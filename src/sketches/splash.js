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
 */
export default function (container) {
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

		const BG_COLOR = [6, 8, 18, 90];
		const TITLE_COLOR = [120, 200, 140];
		const SUBTITLE_COLOR = [180, 190, 210];
		const PROMPT_COLOR = [220, 230, 255];
		const LOAD_GREEN = [120, 200, 140]; // phosphor green, DOS aesthetic

		const PHASE = {ATTRACT: 0, LOADING: 1, FADE_IN: 2, TITLE: 3, SUBTITLE: 4, PROMPT: 5, EXIT: 6};
		const PHASE_DURATION = {
			[PHASE.LOADING]: 3.8,
			[PHASE.FADE_IN]: 1.5,
			[PHASE.TITLE]: 2.5,
			[PHASE.SUBTITLE]: 1.5,
		};

		const PARTICLE_COUNT = 3360;
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

		sketch.setup = () => {
			const canvas = sketch.createCanvas(window.innerWidth, window.innerHeight);
			canvas.parent(container);
			sketch.noStroke();
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
		};

		// ── Input ─────────────────────────────────────────────────────────────────

		sketch.mousePressed = () => onInput();
		sketch.keyPressed = () => onInput();

		sketch.windowResized = () => {
			sketch.resizeCanvas(window.innerWidth, window.innerHeight);
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
			sketch.background(...BG_COLOR);

			// Sparse horizontal static streaks
			for (let i = 0; i < 2320; i++) {
				const x = sketch.random(sketch.width);
				const y = sketch.random(sketch.height);
				sketch.fill(200, 210, 230, sketch.random(8, 35));
				sketch.rect(x, y, sketch.random(4, 40), 1);
			}

			// Blinking prompt
			if (now - lastBlink > BLINK_INTERVAL_MS) {
				promptVisible = !promptVisible;
				lastBlink = now;
			}
			if (promptVisible) {
				const sz = sketch.width * 0.019;
				sketch.textAlign(sketch.CENTER, sketch.CENTER);
				sketch.textSize(sz);
				sketch.textFont("monospace");
				sketch.fill(...PROMPT_COLOR, 190);
				sketch.text("[ CLIQUER OU APPUYER POUR DÉMARRER ]", sketch.width / 2, sketch.height / 2);
			}

			drawScanLines(now);
			drawVignette();
		}

		// ── LOADING ───────────────────────────────────────────────────────────────

		function drawLoading(elapsed, now) {
			sketch.background(0);

			const progress = sketch.constrain(elapsed / PHASE_DURATION[PHASE.LOADING], 0, 1);
			const cx = sketch.width / 2;
			const cy = sketch.height / 2;
			const labelSz = sketch.width * 0.016;
			const barW = sketch.width * 0.42;
			const barH = Math.max(8, sketch.height * 0.018);
			const barX = cx - barW / 2;
			const barY = cy - barH / 2;

			// Cycle status messages
			const msgPeriod = (PHASE_DURATION[PHASE.LOADING] / LOADING_MESSAGES.length) * 1000;
			if (now - lastMsgChange > msgPeriod) {
				loadMsgIdx = Math.min(loadMsgIdx + 1, LOADING_MESSAGES.length - 1);
				lastMsgChange = now;
			}

			// Status text
			sketch.textAlign(sketch.LEFT, sketch.BASELINE);
			sketch.textSize(labelSz);
			sketch.textFont("monospace");
			sketch.fill(...LOAD_GREEN);
			sketch.text(LOADING_MESSAGES[loadMsgIdx], barX, barY - labelSz * 1.4);

			// Bar outline
			sketch.stroke(...LOAD_GREEN, 140);
			sketch.strokeWeight(1);
			sketch.noFill();
			sketch.rect(barX, barY, barW, barH);
			sketch.noStroke();

			// Bar fill
			sketch.fill(...LOAD_GREEN);
			sketch.rect(barX + 1, barY + 1, (barW - 2) * progress, barH - 2);

			// Percentage
			sketch.textAlign(sketch.RIGHT, sketch.TOP);
			sketch.textSize(labelSz);
			sketch.fill(...LOAD_GREEN);
			sketch.text(`${Math.floor(progress * 100)}%`, barX + barW, barY + barH + labelSz * 0.5);

			drawScanLines(now);
			drawVignette();
		}

		// ── MAIN (FADE_IN → TITLE → SUBTITLE → PROMPT) ───────────────────────────

		function drawMain(elapsed, now) {
			sketch.background(...BG_COLOR);

			if (phase === PHASE.FADE_IN) {
				const alpha = sketch.map(elapsed, 0, PHASE_DURATION[PHASE.FADE_IN], 255, 0);
				sketch.fill(0, 0, 0, alpha);
				sketch.rect(0, 0, sketch.width, sketch.height);
			}

			updateAndDrawParticles();
			drawContent(elapsed, now);
			drawScanLines(now);
			drawVignette();
		}

		function drawContent(elapsed, now) {
			const cx = sketch.width / 2;
			const cy = sketch.height / 2;
			const titleSz = sketch.width * 0.09;
			const titleY = cy - titleSz * 0.2;

			// Title
			if (phase >= PHASE.TITLE) {
				const alpha = phase === PHASE.TITLE ? sketch.map(elapsed, 0, 0.3, 0, 255) : 255;
				const revealedCount = phase === PHASE.TITLE ? Math.floor(sketch.map(elapsed, 0, PHASE_DURATION[PHASE.TITLE], 0, TITLE.length + 0.99)) : TITLE.length;
				drawTitleAberration(TITLE.slice(0, Math.min(revealedCount, TITLE.length)), cx, titleY, titleSz, alpha);
			}

			// Subtitle
			if (phase >= PHASE.SUBTITLE) {
				const alpha = phase === PHASE.SUBTITLE ? sketch.map(elapsed, 0, PHASE_DURATION[PHASE.SUBTITLE] * 0.7, 0, 200) : 200;
				sketch.textAlign(sketch.CENTER, sketch.CENTER);
				sketch.textSize(sketch.width * 0.018);
				sketch.textFont("monospace");
				sketch.fill(...SUBTITLE_COLOR, alpha);
				sketch.text(SUBTITLE, cx, titleY + titleSz * 0.9);
			}

			// Prompt
			if (phase === PHASE.PROMPT) {
				if (now - lastBlink > BLINK_INTERVAL_MS) {
					promptVisible = !promptVisible;
					lastBlink = now;
				}
				if (promptVisible) {
					sketch.textAlign(sketch.CENTER, sketch.CENTER);
					sketch.textSize(sketch.width * 0.022);
					sketch.textFont("monospace");
					sketch.fill(...PROMPT_COLOR, 210);
					sketch.text(PROMPT_TEXT, cx, titleY + titleSz * 1.8);
				}
			}
		}

		// ── EXIT ──────────────────────────────────────────────────────────────────

		function drawExit() {
			exitFlashFrames++;
			const alpha = sketch.map(exitFlashFrames, 0, sketch.frameRate() * PHASE_DURATION[PHASE.FADE_IN] * 0.4, 255, 0);
			sketch.background(255, 255, 255, Math.max(0, alpha));

			if (exitFlashFrames > sketch.frameRate() * 0.18) {
				sketch.noLoop();
				document.dispatchEvent(new CustomEvent("splash:complete"));
			}
		}

		// ── Title with chromatic aberration ───────────────────────────────────────

		function drawTitleAberration(text, x, y, size, alpha) {
			const ctx = sketch.drawingContext;
			const offset = Math.max(2, size * 0.015);

			sketch.textAlign(sketch.CENTER, sketch.CENTER);
			sketch.textSize(size);
			sketch.textFont("monospace");
			sketch.textStyle(sketch.BOLD);

			ctx.globalCompositeOperation = "screen";
			sketch.fill(255, 50, 50, alpha * 0.55);
			sketch.text(text, x - offset, y);

			sketch.fill(50, 100, 255, alpha * 0.55);
			sketch.text(text, x + offset, y);

			ctx.globalCompositeOperation = "source-over";
			sketch.fill(...TITLE_COLOR, alpha);
			sketch.text(text, x, y);

			sketch.textStyle(sketch.NORMAL);
		}

		// ── Particles ─────────────────────────────────────────────────────────────

		function makeParticle(randomY = false) {
			return {
				x: sketch.random(0, sketch.width),
				y: randomY ? sketch.random(0, sketch.height) : sketch.height + sketch.random(10, 40),
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
				sketch.fill(160, 200, 230, p.alpha);
				sketch.circle(p.x, p.y, p.size);
				if (p.y < -5) Object.assign(p, makeParticle(false));
			}
		}

		// ── CRT scan lines ────────────────────────────────────────────────────────

		function drawScanLines(now) {
			const flicker = 0.12 + sketch.noise(now * 0.0003) * 0.08;
			sketch.fill(0, 0, 0, flicker * 255);
			for (let y = 0; y < sketch.height; y += 3) {
				sketch.rect(0, y, sketch.width, 1);
			}
		}

		// ── Vignette ──────────────────────────────────────────────────────────────

		function drawVignette() {
			const ctx = sketch.drawingContext;
			const cx = sketch.width / 2;
			const cy = sketch.height / 2;
			const r = Math.max(cx, cy) * 1.3;
			const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
			grad.addColorStop(0, "rgba(0,0,0,0)");
			grad.addColorStop(1, "rgba(0,0,0,0.82)");
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, sketch.width, sketch.height);
		}

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
