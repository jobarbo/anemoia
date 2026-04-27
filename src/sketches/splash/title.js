/**
 * TITLE phase — cinematic hero composition inspired by the old splash:
 * centered title, creator credit, atmospheric particles, CRT overlays.
 *
 * Interface:
 *   createTitlePhase(sketch, artBuffer, fontApi) → { draw(now), isDone(), onPointerPressed(), reset() }
 */

import {THEME, drawScanLines, drawTitleAberration, drawVignette} from "../../lib/utils/retro-theme.js";

const BG = [...THEME.BG];

const TITLE_FONT = {
	family: "Nabla",
	weight: "700",
	cssUrl: "https://fonts.googleapis.com/css2?family=Nabla&display=swap",
};

const TITLE_TEXT = "ANEMOIA";
const AUTHOR_TEXT = "Olivier Laforest  ·  Jonathan Barbeau";
const PROMPT_TEXT = "[ CLIQUEZ POUR CONTINUER ]";
const TITLE_REVEAL_MS = 1600;
const AUTHOR_FADE_MS = 900;
const DONE_HOLD_MS = 950;
const PARTICLE_DENSITY = 0.055;
const PARTICLE_MIN = 240;
const PARTICLE_MAX = 2980;
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
	let particles = [];
	let particleFieldW = 0;
	let particleFieldH = 0;
	let titleFontReady = false;
	let titleFontLoadStarted = false;

	function particleCountFor(w, h) {
		const byArea = Math.round(w * h * PARTICLE_DENSITY);
		return sketch.constrain(byArea, PARTICLE_MIN, PARTICLE_MAX);
	}

	function makeParticle(randomY, w, h) {
		return {
			x: sketch.random(0, w),
			y: randomY ? sketch.random(0, h) : h + sketch.random(8, 56),
			size: sketch.random(0.55, 2.6),
			speed: sketch.random(0.12, 0.42),
			drift: sketch.random(-0.2, 0.2),
			alpha: sketch.random(28, 112),
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
		for (let i = 0; i < particles.length; i++) {
			const p = particles[i];
			p.y -= p.speed;
			p.x += p.drift;
			if (p.x < -8) p.x = w + sketch.random(1, 8);
			if (p.x > w + 8) p.x = -sketch.random(1, 8);
			if (p.y < -5) particles[i] = makeParticle(false, w, h);
			buf.fill(160, 200, 230, p.alpha);
			buf.circle(p.x, p.y, p.size);
		}
	}

	function reset() {
		phaseStart = 0;
		revealComplete = false;
		doneAt = null;
		particles = [];
		particleFieldW = 0;
		particleFieldH = 0;
		titleFontReady = false;
		titleFontLoadStarted = false;
	}

	function isDone() {
		return doneAt !== null && sketch.millis() - doneAt > DONE_HOLD_MS;
	}

	function onPointerPressed() {
		if (!revealComplete || doneAt !== null) return;
		doneAt = sketch.millis();
	}

	function draw(now) {
		const buf = artBuffer;
		const w = buf.width;
		const h = buf.height;
		if (phaseStart === 0) phaseStart = now;
		const elapsed = now - phaseStart;
		ensureParticles(w, h);
		if (!titleFontLoadStarted) {
			titleFontLoadStarted = true;
			ensureTitleGoogleFontLoaded().then((ok) => {
				if (ok) titleFontReady = true;
			});
		}

		buf.background(...BG);
		updateAndDrawParticles(buf);

		const titleSize = Math.max(54, Math.round(w * 0.17));
		const titleX = w / 2;
		const titleY = h * 0.45;
		const revealProgress = sketch.constrain(elapsed / TITLE_REVEAL_MS, 0, 1);
		const charCount = Math.max(1, Math.floor(TITLE_TEXT.length * revealProgress + 0.0001));
		const visibleTitle = TITLE_TEXT.slice(0, charCount);
		const titleAlpha = Math.round(sketch.lerp(0, 255, revealProgress));
		const glowAlpha = Math.round(sketch.lerp(0, 95, revealProgress));
		const titleFamily = titleFontReady ? TITLE_FONT.family : (fontApi?.getCanvasFont?.() ?? "monospace");
		const titleWeight = titleFontReady ? TITLE_FONT.weight : (fontApi?.getCanvasFontWeight?.() ?? "700");

		drawTitleAberration(buf, visibleTitle, titleX, titleY + 2, titleSize, glowAlpha, sketch, titleFamily, titleWeight);
		drawTitleAberration(buf, visibleTitle, titleX, titleY, titleSize, titleAlpha, sketch, titleFamily, titleWeight);

		const subtitleProgress = sketch.constrain((elapsed - TITLE_REVEAL_MS) / AUTHOR_FADE_MS, 0, 1);
		const subtitleAlpha = Math.round(sketch.lerp(0, 255, subtitleProgress));
		buf.textAlign(sketch.CENTER, sketch.CENTER);
		fontApi?.applyCanvasFont?.(buf, Math.max(14, Math.round(w * 0.028)), {weight: fontApi?.getCanvasFontWeight?.() ?? "400"}) ?? buf.textSize(Math.max(14, Math.round(w * 0.022)));
		buf.fill(...THEME.GREEN_SUBTLE, subtitleAlpha);
		buf.text(AUTHOR_TEXT, titleX, titleY + titleSize * 1.0);
		revealComplete = subtitleProgress >= 1;

		if (revealComplete) {
			const promptSize = Math.max(11, Math.round(w * 0.022));
			fontApi?.applyCanvasFont?.(buf, promptSize, {weight: fontApi?.getCanvasFontWeight?.() ?? "400"}) ?? buf.textSize(promptSize);
			buf.fill(...THEME.GREEN_MID, 255);
			buf.text(PROMPT_TEXT, titleX, titleY + titleSize * 2.0);
		}

		drawScanLines(buf, now, sketch);
		drawVignette(buf);
	}

	return {draw, isDone, onPointerPressed, reset};
}
