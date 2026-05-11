/**
 * TITLE phase — cinematic hero composition inspired by the old splash:
 * centered title, creator credit, atmospheric particles, CRT overlays.
 *
 * Interface:
 *   createTitlePhase(sketch, artBuffer, fontApi) → { draw(now), isDone(), onPointerPressed(), reset() }
 */

import {THEME, applyThemeCanvasFont, drawScanLines, drawTitleAberration, drawVignette, readingUiFontSize} from "../../lib/utils/retro-theme.js";

const BG = [...THEME.BG];

const TITLE_FONT = {
	family: "Saira Stencil",
	weight: "500",
	cssUrl: "https://fonts.googleapis.com/css2?family=Saira+Stencil:ital,wght@0,100..900;1,100..900&display=swap",
};

/** Served from `public/assets/scenes/splash/` (Astro root URL). */
const TITLE_AUDIO_SRC = "/assets/scenes/splash/song.m4a";
/** When true, title music repeats until the phase ends or `stopAudio` runs. */
const TITLE_AUDIO_LOOP = true;
/** 0–1; mixed with splash background tracks (`index.js` `SPLASH_BACKGROUND_TRACKS`). */
const TITLE_AUDIO_VOLUME = 0.85;

const TITLE_TEXT = "ANÉMOIA";
const AUTHOR_TEXT = "Olivier Laforest  ·  Jonathan Barbeau";
const PROMPT_TEXT = "[ CLIQUER POUR CONTINUER ]";
const SKY_PAN_MS = 16800;
/** Délai (ms) avant le début de la révélation du titre ; plus petit = titre arrive plus tôt (peut devancer la fin du pan ciel si < SKY_PAN_MS). */
const TITLE_ARRIVAL_MS = SKY_PAN_MS;
/** Durée (ms) de la séquence d’apparition du titre (toutes les lettres à plein fondu). */
const TITLE_REVEAL_MS = 3600;
/** Durée (ms) du fondu 0→100 % pour chaque lettre (les débuts sont échelonnés sur TITLE_REVEAL_MS). */
const TITLE_LETTER_FADE_MS = 480;
const AUTHOR_FADE_MS = 900;
const DONE_HOLD_MS = 0;
const PARTICLE_DENSITY = 0.55;
const PARTICLE_MIN = 1240;
const PARTICLE_MAX = 2980;
/** Vitesse verticale |speed| dans [min, max] ; signe aléatoire (monter ou descendre : p.y -= speed). */
const PARTICLE_SPEED_MIN_ABS = 0.12;
const PARTICLE_SPEED_MAX_ABS = 1.42;
/** Marge hors canvas : au-delà, la particule est recyclée (haut, bas, gauche, droite). */
const PARTICLE_RECYCLE_MARGIN = 14;
const SUNSET_TOP = [10, 10, 6];
const SUNSET_MID = [28, 20, 36];
const SUNSET_HORIZON = [56, 28, 36];
const SKYLINE_BASE = [10, 10, 10, 255];
const SKYLINE_FAR = [30, 10, 10, 255];
const SKYLINE_MID = [10, 10, 10, 255];
const SKYLINE_LIGHT = [88, 88, 94, 255];
const SKYLINE_STATE = [10, 10, 10, 255];
const SKYLINE_ACCENT = [10, 10, 10, 255];
const loadedTitleStylesheets = new Set();

async function ensureTitleGoogleFontLoaded() {
	if (!TITLE_FONT.cssUrl || !TITLE_FONT.family || typeof document === "undefined") return false;

	if (!loadedTitleStylesheets.has(TITLE_FONT.cssUrl)) {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = TITLE_FONT.cssUrl;
		document.head.appendChild(link);
		loadedTitleStylesheets.add(TITLE_FONT.cssUrl);
	}

	if (!document.fonts?.load) return false;
	try {
		await document.fonts.load(`${TITLE_FONT.weight ?? "700"} 16px "${TITLE_FONT.family}"`);
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {import('p5')} sketch
 * @param {import('p5').Graphics} artBuffer
 * @param {{ getCanvasFont?: () => string | import('p5').Font, getCanvasFontVersion?: () => number, getCanvasFontWeight?: () => string | number, applyCanvasFont?: (buf: import('p5').Graphics, size: number, options?: { weight?: string | number, style?: "normal" | "italic" }) => void }} [fontApi]
 */
export function createTitlePhase(sketch, artBuffer, fontApi) {
	let phaseStart = 0;
	let revealComplete = false;
	let doneAt = null;
	let promptRect = null;
	let particles = [];
	let particleFieldW = 0;
	let particleFieldH = 0;
	let skyline = null;
	let titleFontReady = false;
	let titleFontLoadStarted = false;
	let titleAudio = null;
	let titleAudioPlayStarted = false;

	function stopAudio() {
		if (titleAudio) {
			titleAudio.pause();
			titleAudio.currentTime = 0;
		}
		titleAudioPlayStarted = false;
	}

	function tryStartTitleAudio() {
		if (titleAudioPlayStarted || typeof Audio === "undefined") return;
		titleAudioPlayStarted = true;
		if (!titleAudio) {
			titleAudio = new Audio(TITLE_AUDIO_SRC);
			titleAudio.loop = TITLE_AUDIO_LOOP;
			titleAudio.volume = TITLE_AUDIO_VOLUME;
		}
		titleAudio.play().catch(() => {});
	}

	function easeOutCubic(t) {
		const clamped = sketch.constrain(t, 0, 1);
		return 1 - (1 - clamped) ** 3;
	}

	function hash01(seed) {
		const raw = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
		return raw - Math.floor(raw);
	}

	function buildStrip(startX, endX, baseY, px, minBlocks, maxBlocks, minHeight, maxHeight, seedBase) {
		const list = [];
		let cursor = startX;
		let idx = 0;
		while (cursor < endX) {
			const widthBlocks = Math.round(sketch.lerp(minBlocks, maxBlocks, hash01(seedBase + idx * 1.77)));
			const heightBlocks = Math.round(sketch.lerp(minHeight, maxHeight, hash01(seedBase + idx * 2.93 + 0.37)));
			const gapBlocks = Math.round(sketch.lerp(1, 4, hash01(seedBase + idx * 3.31 + 0.81)));
			const bw = Math.max(px * 2, widthBlocks * px);
			const bh = Math.max(px * 3, heightBlocks * px);
			list.push({x: cursor, y: baseY - bh, w: bw, h: bh, seed: seedBase + idx * 7.41});
			cursor += bw + gapBlocks * px;
			idx++;
		}
		return list;
	}

	function ensureSkyline(w, h) {
		if (skyline && skyline.w === w && skyline.h === h) return;

		const px = Math.max(2, Math.round(Math.min(w, h) * 0.0048));
		const horizonY = Math.round(h * 0.89);
		const stripStart = -px * 8;
		const stripEnd = w + px * 8;

		const states = [
			{
				x: Math.round(w * 0.72),
				baseW: px * 24,
				coreW: px * 13,
				height: px * 48,
				tiers: [
					{w: px * 22, h: px * 8},
					{w: px * 18, h: px * 8},
					{w: px * 14, h: px * 8},
				],
				seed: 21.3,
			},
			{
				x: Math.round(w * 0.85),
				baseW: px * 30,
				coreW: px * 16,
				height: px * 92,
				tiers: [
					{w: px * 28, h: px * 8},
					{w: px * 22, h: px * 8},
					{w: px * 18, h: px * 9},
				],
				seed: 47.6,
			},
			{
				x: Math.round(w * 0.95),
				baseW: px * 26,
				coreW: px * 14,
				height: px * 67,
				tiers: [
					{w: px * 24, h: px * 8},
					{w: px * 20, h: px * 8},
					{w: px * 15, h: px * 8},
				],
				seed: 73.2,
			},
		];

		skyline = {
			w,
			h,
			px,
			horizonY,
			far: buildStrip(stripStart, stripEnd, horizonY + px * 2, px, 3, 7, 6, 14, 12.5),
			mid: buildStrip(stripStart, stripEnd, horizonY + px * 5, px, 4, 10, 8, 18, 48.75),
			states,
			maxStateHeight: Math.max(...states.map((state) => state.height)),
		};
	}

	function drawWindowDots(buf, building, amount) {
		const px = skyline?.px ?? 2;
		for (let i = 0; i < amount; i++) {
			const wx = building.x + px + Math.floor(hash01(building.seed + i * 1.27) * Math.max(px, building.w - px * 2));
			const wy = building.y + px + Math.floor(hash01(building.seed + i * 2.61 + 4.0) * Math.max(px, building.h - px * 2));
			buf.rect(wx, wy, px, px);
		}
	}

	function drawSkyscraperRoof(buf, state, coreX, coreY) {
		const px = skyline?.px ?? 2;
		const topTier = state.tiers.at(-1);
		const roofInset = px;
		const roofW = topTier?.w ?? state.coreW + px * 4;
		const roofX = state.x - Math.round(roofW * 0.5);
		const roofY = coreY - px * 2;
		buf.fill(...SKYLINE_ACCENT);
		buf.rect(roofX + roofInset, roofY + px, roofW - roofInset * 2, px);

		buf.fill(...SKYLINE_MID);
	}

	function drawVerticalCityStates(buf, horizonY) {
		if (!skyline) return;
		const {px, states} = skyline;

		// Cliff-like foundation that supports the city-states.
		buf.fill(0, 0, 0, 255);
		for (let x = -px * 6; x < skyline.w + px * 6; x += px * 2) {
			const rise = Math.round(hash01(x * 0.031 + 1.7) * px * 6);
			buf.rect(x, horizonY + px * 4 - rise, px * 2, skyline.h - (horizonY + px * 4 - rise));
		}

		for (let i = 0; i < states.length; i++) {
			const state = states[i];
			const baseX = state.x - Math.round(state.baseW * 0.5);
			const baseY = horizonY - px * 10;

			// Fortified lower base.
			buf.fill(...SKYLINE_STATE);
			buf.rect(baseX, baseY, state.baseW, px * 10);

			// Vertical core tower.
			const coreX = state.x - Math.round(state.coreW * 0.5);
			const coreY = horizonY - state.height;
			buf.fill(...SKYLINE_STATE);
			buf.rect(coreX, coreY, state.coreW, state.height - px * 2);

			// Stacked district terraces (city-state layers).
			let tierTop = baseY;
			for (let t = 0; t < state.tiers.length; t++) {
				const tier = state.tiers[t];
				tierTop -= tier.h;
				const tierX = state.x - Math.round(tier.w * 0.5);
				buf.fill(...SKYLINE_MID);
				buf.rect(tierX, tierTop, tier.w, tier.h);
				buf.fill(...SKYLINE_ACCENT);
				buf.rect(tierX + px, tierTop + px, tier.w - px * 2, px);
			}

			drawSkyscraperRoof(buf, state, coreX, coreY);

			// Defensive buttresses.
			buf.fill(...SKYLINE_MID);
			buf.rect(baseX - px * 2, baseY + px * 2, px * 2, px * 8);
			buf.rect(baseX + state.baseW, baseY + px * 1, px * 2, px * 9);

			// Localized windows for each vertical city-state.
			buf.fill(...SKYLINE_LIGHT);
			drawWindowDots(buf, {x: coreX, y: coreY, w: state.coreW, h: state.height - px * 3, seed: state.seed}, 14);
			drawWindowDots(buf, {x: baseX, y: baseY, w: state.baseW, h: px * 10, seed: state.seed + 8.2}, 9);
		}
	}

	/**
	 * @param {import('p5').Graphics} buf
	 * @param {number} now
	 * @param {number} horizonShiftY - pan caméra (ville monte / horizon se déplace)
	 * @param {number} skyReveal - 0→1, ease du pan : voile sur ciel fixe + zone au-dessus de la ville (bord bas = horizon caméra) + fond derrière les bâtiments
	 */
	function drawSkyline(buf, now, horizonShiftY = 0, skyReveal = 1) {
		if (!skyline) return;
		const {far, mid, horizonY, h} = skyline;
		const shiftedHorizonY = horizonY + horizonShiftY;
		const stripShift = shiftedHorizonY - horizonY;
		buf.noStroke();

		// Dégradé ciel sur toute la hauteur (fixe, ne suit pas le pan) ; stops calés pour garder l’horizon ~horizonY.
		const skyGradH = Math.max(1, h);
		const midStop = sketch.constrain((0.58 * horizonY) / skyGradH, 0.06, 0.78);
		const horStop = sketch.constrain(horizonY / skyGradH, midStop + 0.02, 0.995);
		const skyGrad = buf.drawingContext.createLinearGradient(0, 0, 0, skyGradH);
		skyGrad.addColorStop(0, `rgba(${SUNSET_TOP[0]}, ${SUNSET_TOP[1]}, ${SUNSET_TOP[2]}, 1)`);
		skyGrad.addColorStop(midStop, `rgba(${SUNSET_MID[0]}, ${SUNSET_MID[1]}, ${SUNSET_MID[2]}, 1)`);
		skyGrad.addColorStop(horStop, `rgba(${SUNSET_HORIZON[0]}, ${SUNSET_HORIZON[1]}, ${SUNSET_HORIZON[2]}, 1)`);
		skyGrad.addColorStop(1, `rgba(${SUNSET_HORIZON[0]}, ${SUNSET_HORIZON[1]}, ${SUNSET_HORIZON[2]}, 1)`);
		buf.drawingContext.fillStyle = skyGrad;
		buf.drawingContext.fillRect(0, 0, skyline.w, skyGradH);

		const reveal = sketch.constrain(skyReveal, 0, 1);
		const veilAlpha = Math.round(255 * (1 - reveal));

		// Fond derrière les silhouettes : suit l’horizon caméra + même voile que le ciel (pas de bande noire fixe).
		buf.fill(...SKYLINE_BASE);
		buf.rect(0, shiftedHorizonY, skyline.w, h - shiftedHorizonY);
		if (veilAlpha > 0) {
			buf.fill(0, 0, 0, veilAlpha);
			buf.rect(0, shiftedHorizonY, skyline.w, h - shiftedHorizonY);
		}

		// Voile unifié jusqu’à l’horizon caméra : ciel + espace au-dessus de la ville (bord bas = shiftedHorizonY, suit le pan).
		const veilH = Math.min(h, Math.max(0, shiftedHorizonY));
		if (veilAlpha > 0 && veilH > 0) {
			buf.fill(0, 0, 0, veilAlpha);
			buf.rect(0, 0, skyline.w, veilH);
		}

		buf.fill(...SKYLINE_FAR);
		for (let i = 0; i < far.length; i++) {
			const b = far[i];
			buf.rect(b.x, b.y + stripShift, b.w, b.h);
		}

		buf.fill(...SKYLINE_MID);
		for (let i = 0; i < mid.length; i++) {
			const b = mid[i];
			buf.rect(b.x, b.y + stripShift, b.w, b.h);
		}

		buf.fill(...SKYLINE_LIGHT);
		for (let i = 0; i < far.length; i++) {
			const b = far[i];
			drawWindowDots(buf, {x: b.x, y: b.y + stripShift, w: b.w, h: b.h, seed: b.seed}, 3);
		}

		buf.fill(...SKYLINE_LIGHT);
		for (let i = 0; i < mid.length; i++) {
			const b = mid[i];
			drawWindowDots(buf, {x: b.x, y: b.y + stripShift, w: b.w, h: b.h, seed: b.seed}, 5);
		}

		drawVerticalCityStates(buf, shiftedHorizonY);
	}

	function particleCountFor(w, h) {
		const byArea = Math.round(w * h * PARTICLE_DENSITY);
		return sketch.constrain(byArea, PARTICLE_MIN, PARTICLE_MAX);
	}

	function makeParticle(randomY, w, h) {
		let speed = sketch.random(-PARTICLE_SPEED_MAX_ABS, PARTICLE_SPEED_MAX_ABS);
		if (speed > -PARTICLE_SPEED_MIN_ABS && speed < PARTICLE_SPEED_MIN_ABS) {
			speed = sketch.random() < 0.5 ? -PARTICLE_SPEED_MIN_ABS : PARTICLE_SPEED_MIN_ABS;
		}
		return {
			x: sketch.random(0, w),
			y: randomY ? sketch.random(0, h) : h + sketch.random(8, 56),
			size: sketch.random(1.55, 2.6),
			speed: sketch.random(0.12, -3.42),
			drift: sketch.random(-4.2, 2.2),
			alpha: sketch.random(128, 255),
		};
	}

	function ensureParticles(w, h) {
		if (particles.length > 0 && particleFieldW === w && particleFieldH === h) return;
		particleFieldW = w;
		particleFieldH = h;
		const particleCount = particleCountFor(w, h);
		particles = new Array(particleCount);
		for (let i = 0; i < particleCount; i++) particles[i] = makeParticle(true, w, h);
	}

	function updateAndDrawParticles(buf) {
		const w = buf.width;
		const h = buf.height;
		buf.noStroke();
		const m = PARTICLE_RECYCLE_MARGIN;
		for (let i = 0; i < particles.length; i++) {
			let p = particles[i];
			p.y -= p.speed;
			p.x += p.drift;
			if (p.x < -m || p.x > w + m || p.y < -m || p.y > h + m) {
				p = makeParticle(true, w, h);
				particles[i] = p;
			}
			buf.fill(160, 200, 230, p.alpha);
			buf.circle(p.x, p.y, p.size);
		}
	}

	function reset() {
		stopAudio();
		phaseStart = 0;
		revealComplete = false;
		doneAt = null;
		promptRect = null;
		particles = [];
		particleFieldW = 0;
		particleFieldH = 0;
		skyline = null;
		titleFontReady = false;
		titleFontLoadStarted = false;
	}

	function isDone() {
		return doneAt !== null && sketch.millis() - doneAt > DONE_HOLD_MS;
	}

	function isPointerOver(x, y) {
		if (!promptRect || !revealComplete) return false;
		return x >= promptRect.x && x <= promptRect.x + promptRect.w && y >= promptRect.y && y <= promptRect.y + promptRect.h;
	}

	function onPointerPressed(x, y) {
		if (!isPointerOver(x, y) || doneAt !== null) return false;
		doneAt = sketch.millis();
		return true;
	}

	function onConfirm() {
		if (!revealComplete || doneAt !== null) return;
		doneAt = sketch.millis();
	}

	function draw(now) {
		const buf = artBuffer;
		const w = buf.width;
		const h = buf.height;
		if (phaseStart === 0) phaseStart = now;
		tryStartTitleAudio();
		const elapsed = now - phaseStart;
		ensureParticles(w, h);
		ensureSkyline(w, h);
		if (!titleFontLoadStarted) {
			titleFontLoadStarted = true;
			ensureTitleGoogleFontLoaded().then((ok) => {
				if (ok) titleFontReady = true;
			});
		}

		buf.background(...BG);
		const panProgress = sketch.constrain(elapsed / SKY_PAN_MS, 0, 1);
		const panEase = easeOutCubic(panProgress);
		const introStartShift = skyline ? Math.max(h * 0.42, h - skyline.horizonY + skyline.maxStateHeight + skyline.px * 24) : h * 0.42;
		const horizonShiftY = sketch.lerp(introStartShift, 0, panEase);
		drawSkyline(buf, now, horizonShiftY, panEase);
		updateAndDrawParticles(buf);

		const titleSize = Math.max(34, Math.round(w * 0.12));
		const titleX = w / 2;
		const titleY = h * 0.35;
		const titleElapsed = Math.max(0, elapsed - SKY_PAN_MS / 1.5);
		const titleFamily = titleFontReady ? TITLE_FONT.family : (fontApi?.getCanvasFont?.() ?? "monospace");
		const titleWeight = titleFontReady ? TITLE_FONT.weight : (fontApi?.getCanvasFontWeight?.() ?? "700");

		// Titre : chaque glyphe en fondu échelonné (ease sur l’alpha par lettre).
		const chars = Array.from(TITLE_TEXT);
		const letterCount = chars.length;
		const fadeMs = TITLE_LETTER_FADE_MS;
		const spanMs = Math.max(1, TITLE_REVEAL_MS - fadeMs);
		applyThemeCanvasFont(buf, titleSize, sketch, {family: titleFamily, weight: titleWeight});
		buf.textAlign(sketch.LEFT, sketch.CENTER);
		const fullTitleW = buf.textWidth(TITLE_TEXT);
		const leftEdge = titleX - fullTitleW / 2;
		let prefix = "";
		for (let i = 0; i < letterCount; i++) {
			const ch = chars[i];
			const wBefore = buf.textWidth(prefix);
			prefix += ch;
			const wAfter = buf.textWidth(prefix);
			const charW = wAfter - wBefore;
			const cx = leftEdge + wBefore + charW / 2;
			const t0 = letterCount <= 1 ? 0 : (i / (letterCount - 1)) * spanMs;
			const u = sketch.constrain((titleElapsed - t0) / fadeMs, 0, 1);
			const letterAlpha = Math.round(sketch.lerp(0, 255, easeOutCubic(u)));
			if (letterAlpha > 1) {
				drawTitleAberration(buf, ch, cx, titleY, titleSize, letterAlpha, sketch, titleFamily, titleWeight);
			}
		}

		const subtitleProgress = sketch.constrain((titleElapsed - TITLE_REVEAL_MS) / AUTHOR_FADE_MS, 0, 1);
		const subtitleAlpha = Math.round(sketch.lerp(0, 255, subtitleProgress));
		buf.textAlign(sketch.CENTER, sketch.CENTER);
		const subtitlePx = readingUiFontSize(Math.max(14, Math.round(w * 0.028)));
		fontApi?.applyCanvasFont?.(buf, subtitlePx, {weight: fontApi?.getCanvasFontWeight?.() ?? "400"}) ?? buf.textSize(subtitlePx);
		buf.fill(...THEME.GREEN_SUBTLE, subtitleAlpha);
		buf.text(AUTHOR_TEXT, titleX, titleY + titleSize * 1.0);
		revealComplete = subtitleProgress >= 1;

		if (revealComplete) {
			const promptSize = readingUiFontSize(Math.max(11, Math.round(w * 0.016)));
			fontApi?.applyCanvasFont?.(buf, promptSize, {weight: fontApi?.getCanvasFontWeight?.() ?? "400"}) ?? buf.textSize(promptSize);
			const promptY = titleY + titleSize * 2.0;
			const promptW = buf.textWidth(PROMPT_TEXT);
			const promptPadX = Math.max(10, promptSize * 0.65);
			const promptPadY = Math.max(6, promptSize * 0.4);
			promptRect = {
				x: titleX - promptW / 2 - promptPadX,
				y: promptY - promptSize * 0.5 - promptPadY,
				w: promptW + promptPadX * 2,
				h: promptSize + promptPadY * 2,
			};
			const promptHovered = isPointerOver(sketch.mouseX, sketch.mouseY);
			if (promptHovered) {
				buf.noFill();
				buf.stroke(...THEME.GREEN_MID, 180);
				buf.strokeWeight(1);
				buf.rect(promptRect.x, promptRect.y, promptRect.w, promptRect.h, 4);
				buf.noStroke();
			}
			buf.fill(...THEME.GREEN_MID, promptHovered ? 255 : 230);
			buf.text(PROMPT_TEXT, titleX, promptY);
		} else {
			promptRect = null;
		}

		drawScanLines(buf, now, sketch);
		drawVignette(buf);
	}

	return {draw, isDone, isPointerOver, onPointerPressed, onConfirm, reset, stopAudio};
}
