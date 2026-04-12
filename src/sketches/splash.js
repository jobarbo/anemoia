/**
 * Retro game splash screen — late 90s / early 2000s aesthetic.
 *
 * State machine:
 *   ATTRACT  — static noise, blinking "press any key" (waits for user gesture)
 *   LOADING  — DOS-style progress bar + synthesized boot/modem/static sounds
 *   FADE_IN  — black fades to dark background
 *   TITLE    — "ANÉMOIA" scans in char by char with chromatic aberration
 *   SUBTITLE — creator names fade in
 *   PROMPT   — "APPUYER POUR COMMENCER" blinks
 *   EXIT     — white flash, dispatch 'splash:complete'
 *
 * Sounds are synthesized via Web Audio API (no external dependency).
 * AudioContext is created on first user gesture (ATTRACT → LOADING) to satisfy
 * browser autoplay policy.
 *
 * Rendering: P2D offscreen buffer → ShaderEffects → visible WEBGL canvas (CRT-style post).
 */
import {ShaderEffects} from "../lib/shaders/shader-effects.js";
import {THEME, drawScanLines, drawVignette, drawTitleAberration, tickBlink} from "../lib/utils/retro-theme.js";

export default function (container) {
	/** P2D offscreen buffer — all 2D drawing (gradients, text, scan lines). */
	let artBuffer;
	/** WEBGL offscreen buffer — receives artBuffer as texture, fed into ShaderEffects. */
	let mainCanvas;

	const shaders = new ShaderEffects({
		effects: {
			/* 			crtDisplay: {enabled: true, brightness: 0.99, cellSize: 2.0, gapOpacity: 0.9, rgbOpacity: 0.9, dotRadius: 0.8, dotFalloff: 0.6, filterMode: 0.0},
			crtDisplay: {enabled: true, brightness: 0.99, cellSize: 12.0, gapOpacity: 0.9, rgbOpacity: 0.9, dotRadius: 0.8, dotFalloff: 0.6, filterMode: 0.0},
			crtDisplay: {enabled: true, brightness: 0.99, cellSize: 122.0, gapOpacity: 0.9, rgbOpacity: 0.9, dotRadius: 0.8, dotFalloff: 0.6, filterMode: 0.0},
			pixelSort: {enabled: true, sortAmount: 111.28, sampleCount: 12.0, sortMode: 1.0, threshold: 0.1, invert: 0.0},
			pixelGrid: {enabled: true, gridCols: 640.0, gridRows: 440.0, cellRatio: 100.0, mode: 0.0, diffuse: 1.0, gapSize: 0.0, gapBrightness: 1.0},

			crtWarp: {enabled: true, warpAmount: 0.32, aspectCorrect: 1.0, borderColor: 1.0, vignette: 0.02},
			//pixelSort: {enabled: true, sortAmount: 111.28, sampleCount: 2.0, sortMode: 1.0, threshold: 0.9, invert: 1.0},
			crtDisplay: {enabled: true, brightness: 0.99, cellSize: 2.0, gapOpacity: 0.9, rgbOpacity: 0.9, dotRadius: 0.8, dotFalloff: 0.6, filterMode: 0.0}, */
			//chromatic: {enabled: true, amount: 0.0015, timeMultiplier: 21.2},
		},
	});

	return (sketch) => {
		// ── Config ────────────────────────────────────────────────────────────────

		const TITLE = "ANÉMOIA";
		const SUBTITLE = "Olivier Laforest  ·  Jonathan Barbeau";
		const PROMPT_TEXT = "APPUYER POUR COMMENCER";

		const LOADING_MESSAGES = [
			"Vérification de la mémoire...",
			"Chargement des ressources graphiques...",
			"Initialisation du moteur audio...",
			"Chargement des données de la ville...",
			"Calibration de la mémoire affective...",
		];

		const BG_COLOR = [...THEME.BG, 90];
		const TITLE_COLOR = THEME.GREEN_PRIMARY;
		const SUBTITLE_COLOR = THEME.GREEN_SUBTLE;
		const PROMPT_COLOR = THEME.GREEN_MID;
		const LOAD_GREEN = THEME.GREEN_MID; // phosphor green, DOS aesthetic

		const PHASE = {ATTRACT: 0, LOADING: 1, FADE_IN: 2, TITLE: 3, SUBTITLE: 4, PROMPT: 5, EXIT: 6};
		const PHASE_DURATION = {
			[PHASE.LOADING]: 3.8,
			[PHASE.FADE_IN]: 1.5,
			[PHASE.TITLE]: 2.5,
			[PHASE.SUBTITLE]: 1.5,
		};

		const PARTICLE_COUNT = 1360;
		const BLINK_INTERVAL_MS = 600;

		// ── State ─────────────────────────────────────────────────────────────────

		let phase = PHASE.ATTRACT;
		let phaseStart = 0;
		let particles = [];
		let promptVisible = true;
		let lastBlink = 0;
		let exitFlashFrames = 0;
		let loadMsgIdx = 0;
		let lastMsgChange = 0;

		/** @type {AudioContext|null} */
		let audioCtx = null;

		// ── Setup ─────────────────────────────────────────────────────────────────

		sketch.setup = async () => {
			await shaders.loadShaders(sketch);

			const w = window.innerWidth;
			const h = window.innerHeight;
			artBuffer = sketch.createGraphics(w, h); // P2D — 2D canvas APIs
			mainCanvas = sketch.createGraphics(w, h, sketch.WEBGL); // WEBGL — shader input
			const canvas = sketch.createCanvas(w, h, sketch.WEBGL);
			canvas.parent(container);
			shaders.setup(w, h, mainCanvas, sketch);
			artBuffer.noStroke();
			for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(makeParticle(true));
			phaseStart = sketch.millis();
		};

		// ── Main loop ─────────────────────────────────────────────────────────────

		sketch.draw = () => {
			const now = sketch.millis();
			const elapsed = (now - phaseStart) / 1000;

			tickPhase(elapsed, now);

			switch (phase) {
				case PHASE.ATTRACT:
					drawAttract(now);
					break;
				case PHASE.LOADING:
					drawLoading(elapsed, now);
					break;
				case PHASE.EXIT:
					drawExit();
					break;
				default:
					drawMain(elapsed, now);
			}

			// Blit P2D artBuffer onto WEBGL mainCanvas before shader pass
			mainCanvas.clear();
			mainCanvas.image(artBuffer, -mainCanvas.width / 2, -mainCanvas.height / 2, mainCanvas.width, mainCanvas.height);

			shaders.updateTime(0.016);
			shaders.apply();
		};

		// ── Input ─────────────────────────────────────────────────────────────────

		sketch.mousePressed = () => onInput();
		sketch.keyPressed = () => onInput();

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			artBuffer.resizeCanvas(w, h);
			mainCanvas.resizeCanvas(w, h);
			sketch.resizeCanvas(w, h);
			shaders.reinitializePipeline();
		};

		function onInput() {
			if (phase === PHASE.ATTRACT) {
				beginLoading();
			} else if (phase >= PHASE.PROMPT) {
				triggerExit();
			}
		}

		// ── Phase management ──────────────────────────────────────────────────────

		function tickPhase(elapsed, now) {
			const dur = PHASE_DURATION[phase];
			if (dur !== undefined && elapsed >= dur) {
				phase++;
				phaseStart = now;
			}
		}

		function beginLoading() {
			phase = PHASE.LOADING;
			phaseStart = sketch.millis();
			initAudio();
			scheduleLoadingSounds();
		}

		function triggerExit() {
			if (phase === PHASE.EXIT) return;
			phase = PHASE.EXIT;
			phaseStart = sketch.millis();
			exitFlashFrames = 0;
		}

		// ── ATTRACT ───────────────────────────────────────────────────────────────

		function drawAttract(now) {
			artBuffer.background(...BG_COLOR);

			// Sparse horizontal static streaks
			for (let i = 0; i < 2320; i++) {
				const x = sketch.random(artBuffer.width);
				const y = sketch.random(artBuffer.height);
				artBuffer.fill(200, 210, 230, sketch.random(8, 35));
				artBuffer.rect(x, y, sketch.random(4, 40), 1);
			}

			// Blinking prompt
			if (now - lastBlink > BLINK_INTERVAL_MS) {
				promptVisible = !promptVisible;
				lastBlink = now;
			}
			if (promptVisible) {
				const sz = artBuffer.width * 0.019;
				artBuffer.textAlign(sketch.CENTER, sketch.CENTER);
				artBuffer.textSize(sz);
				artBuffer.textFont("monospace");
				artBuffer.fill(...PROMPT_COLOR, 190);
				artBuffer.text("[ CLIQUER OU APPUYER POUR DÉMARRER ]", artBuffer.width / 2, artBuffer.height / 2);
			}

			drawScanLines(artBuffer, now, sketch);
			drawVignette(artBuffer);
		}

		// ── LOADING ───────────────────────────────────────────────────────────────

		function drawLoading(elapsed, now) {
			artBuffer.background(0);

			const progress = sketch.constrain(elapsed / PHASE_DURATION[PHASE.LOADING], 0, 1);
			const cx = artBuffer.width / 2;
			const cy = artBuffer.height / 2;
			const labelSz = artBuffer.width * 0.016;
			const barW = artBuffer.width * 0.42;
			const barH = Math.max(8, artBuffer.height * 0.018);
			const barX = cx - barW / 2;
			const barY = cy - barH / 2;

			// Cycle status messages
			const msgPeriod = (PHASE_DURATION[PHASE.LOADING] / LOADING_MESSAGES.length) * 1000;
			if (now - lastMsgChange > msgPeriod) {
				loadMsgIdx = Math.min(loadMsgIdx + 1, LOADING_MESSAGES.length - 1);
				lastMsgChange = now;
			}

			// Status text
			artBuffer.textAlign(sketch.LEFT, sketch.BASELINE);
			artBuffer.textSize(labelSz);
			artBuffer.textFont("monospace");
			artBuffer.fill(...LOAD_GREEN);
			artBuffer.text(LOADING_MESSAGES[loadMsgIdx], barX, barY - labelSz * 1.4);

			// Bar outline
			artBuffer.stroke(...LOAD_GREEN, 140);
			artBuffer.strokeWeight(1);
			artBuffer.noFill();
			artBuffer.rect(barX, barY, barW, barH);
			artBuffer.noStroke();

			// Bar fill
			artBuffer.fill(...LOAD_GREEN);
			artBuffer.rect(barX + 1, barY + 1, (barW - 2) * progress, barH - 2);

			// Percentage
			artBuffer.textAlign(sketch.RIGHT, sketch.TOP);
			artBuffer.textSize(labelSz);
			artBuffer.fill(...LOAD_GREEN);
			artBuffer.text(`${Math.floor(progress * 100)}%`, barX + barW, barY + barH + labelSz * 0.5);

			drawScanLines(artBuffer, now, sketch);
			drawVignette(artBuffer);
		}

		// ── MAIN (FADE_IN → TITLE → SUBTITLE → PROMPT) ───────────────────────────

		function drawMain(elapsed, now) {
			artBuffer.background(...BG_COLOR);

			if (phase === PHASE.FADE_IN) {
				const alpha = sketch.map(elapsed, 0, PHASE_DURATION[PHASE.FADE_IN], 255, 0);
				artBuffer.fill(0, 0, 0, alpha);
				artBuffer.rect(0, 0, artBuffer.width, artBuffer.height);
			}

			updateAndDrawParticles();
			drawContent(elapsed, now);
			drawScanLines(artBuffer, now, sketch);
			drawVignette(artBuffer);
		}

		function drawContent(elapsed, now) {
			const cx = artBuffer.width / 2;
			const cy = artBuffer.height / 2;
			const titleSz = artBuffer.width * 0.09;
			const titleY = cy - titleSz * 0.2;

			// Title
			if (phase >= PHASE.TITLE) {
				const alpha = phase === PHASE.TITLE ? sketch.map(elapsed, 0, 0.3, 0, 255) : 255;
				const revealedCount = phase === PHASE.TITLE ? Math.floor(sketch.map(elapsed, 0, PHASE_DURATION[PHASE.TITLE], 0, TITLE.length + 0.99)) : TITLE.length;
				drawTitleAberrationLocal(TITLE.slice(0, Math.min(revealedCount, TITLE.length)), cx, titleY, titleSz, alpha);
			}

			// Subtitle
			if (phase >= PHASE.SUBTITLE) {
				const alpha = phase === PHASE.SUBTITLE ? sketch.map(elapsed, 0, PHASE_DURATION[PHASE.SUBTITLE] * 0.7, 0, 200) : 200;
				artBuffer.textAlign(sketch.CENTER, sketch.CENTER);
				artBuffer.textSize(artBuffer.width * 0.018);
				artBuffer.textFont("monospace");
				artBuffer.fill(...SUBTITLE_COLOR, alpha);
				artBuffer.text(SUBTITLE, cx, titleY + titleSz * 0.9);
			}

			// Prompt
			if (phase === PHASE.PROMPT) {
				if (now - lastBlink > BLINK_INTERVAL_MS) {
					promptVisible = !promptVisible;
					lastBlink = now;
				}
				if (promptVisible) {
					artBuffer.textAlign(sketch.CENTER, sketch.CENTER);
					artBuffer.textSize(artBuffer.width * 0.022);
					artBuffer.textFont("monospace");
					artBuffer.fill(...PROMPT_COLOR, 210);
					artBuffer.text(PROMPT_TEXT, cx, titleY + titleSz * 1.8);
				}
			}
		}

		// ── EXIT ──────────────────────────────────────────────────────────────────

		function drawExit() {
			exitFlashFrames++;
			const alpha = sketch.map(exitFlashFrames, 0, sketch.frameRate() * PHASE_DURATION[PHASE.FADE_IN] * 0.4, 255, 0);
			artBuffer.background(255, 255, 255, Math.max(0, alpha));

			if (exitFlashFrames > sketch.frameRate() * 0.18) {
				sketch.noLoop();
				document.dispatchEvent(new CustomEvent("splash:complete"));
			}
		}

		// ── Title with chromatic aberration ───────────────────────────────────────

		function drawTitleAberrationLocal(text, x, y, size, alpha) {
			drawTitleAberration(artBuffer, text, x, y, size, alpha, sketch);
		}

		// ── Particles ─────────────────────────────────────────────────────────────

		function makeParticle(randomY = false) {
			const W = artBuffer.width;
			const H = artBuffer.height;
			return {
				x: sketch.random(0, W),
				y: randomY ? sketch.random(0, H) : H + sketch.random(10, 40),
				size: sketch.random(0.5, 2.5),
				speed: sketch.random(0.1, 0.4),
				alpha: sketch.random(30, 100),
				drift: sketch.random(-0.15, 0.15),
			};
		}

		function updateAndDrawParticles() {
			for (const p of particles) {
				p.y -= p.speed;
				p.x += p.drift;
				artBuffer.fill(160, 200, 230, p.alpha);
				artBuffer.circle(p.x, p.y, p.size);
				if (p.y < -5) Object.assign(p, makeParticle(false));
			}
		}

		// ── CRT scan lines + vignette (delegated to retro-theme) ─────────────────

		// ── Audio synthesis (Web Audio API) ───────────────────────────────────────

		function initAudio() {
			if (audioCtx) return;
			try {
				audioCtx = new (window.AudioContext || window.webkitAudioContext)();
			} catch {
				// Audio unavailable — fail silently
			}
		}

		function scheduleLoadingSounds() {
			if (!audioCtx) return;
			const t = audioCtx.currentTime;

			// 1. Static burst at start (white noise → bandpass)
			playStatic(t + 0.05, 0.5, 0.35);

			// 2. Modem handshake tones
			playModem(t + 0.5, 2.4);

			// 3. Short static underneath modem
			playStatic(t + 0.6, 1.8, 0.05);

			// 4. Boot beep at end
			playBootBeep(t + 3.3);
		}

		function playStatic(startTime, duration, volume) {
			if (!audioCtx) return;
			const sr = audioCtx.sampleRate;
			const buf = audioCtx.createBuffer(1, Math.ceil(sr * duration), sr);
			const data = buf.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

			const src = audioCtx.createBufferSource();
			src.buffer = buf;

			const filter = audioCtx.createBiquadFilter();
			filter.type = "bandpass";
			filter.frequency.value = 2800;
			filter.Q.value = 0.6;

			const gain = audioCtx.createGain();
			gain.gain.setValueAtTime(volume, startTime);
			gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

			src.connect(filter);
			filter.connect(gain);
			gain.connect(audioCtx.destination);
			src.start(startTime);
		}

		function playModem(startTime, totalDuration) {
			if (!audioCtx) return;

			// Classic dial-up handshake: alternating tones and sweeps
			const segments = [
				{freq: 2100, endFreq: 2100, type: "sine", dur: 0.35},
				{freq: 1200, endFreq: 2400, type: "sawtooth", dur: 0.4},
				{freq: 300, endFreq: 3200, type: "sawtooth", dur: 0.5},
				{freq: 2400, endFreq: 600, type: "square", dur: 0.25},
				{freq: 1200, endFreq: 1200, type: "sine", dur: 0.28},
				{freq: 2400, endFreq: 2400, type: "sine", dur: 0.28},
				{freq: 600, endFreq: 3000, type: "sawtooth", dur: 0.35},
			];

			let offset = 0;
			for (const seg of segments) {
				if (offset >= totalDuration) break;

				const osc = audioCtx.createOscillator();
				const gain = audioCtx.createGain();

				osc.type = seg.type;
				osc.frequency.setValueAtTime(seg.freq, startTime + offset);
				osc.frequency.linearRampToValueAtTime(seg.endFreq, startTime + offset + seg.dur);

				gain.gain.setValueAtTime(0.09, startTime + offset);
				gain.gain.exponentialRampToValueAtTime(0.001, startTime + offset + seg.dur);

				osc.connect(gain);
				gain.connect(audioCtx.destination);
				osc.start(startTime + offset);
				osc.stop(startTime + offset + seg.dur + 0.01);

				offset += seg.dur;
			}
		}

		function playBootBeep(startTime) {
			if (!audioCtx) return;

			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();

			osc.type = "square";
			osc.frequency.setValueAtTime(220, startTime);
			osc.frequency.exponentialRampToValueAtTime(880, startTime + 0.08);

			gain.gain.setValueAtTime(0.22, startTime);
			gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);

			osc.connect(gain);
			gain.connect(audioCtx.destination);
			osc.start(startTime);
			osc.stop(startTime + 0.32);
		}
	};
}
