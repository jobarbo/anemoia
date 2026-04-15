/**
 * Splash screen orchestrator.
 *
 * State machine:
 *   BIOS  — POST-style diagnostic text streams in
 *   LOGO  — "Boot-Boy OS 3.0" splash box; any key advances
 *   LOGIN — automated terminal login sequence
 *   EXIT  — white flash → dispatch 'splash:complete'
 *
 * Each phase lives in its own module under ./splash/.
 * This file owns the p5 lifecycle (setup / draw / keyPressed / windowResized)
 * and the artBuffer → visible canvas pipeline.
 */

import {createBiosPhase} from "./splash/bios.js";
import {createLogoPhase} from "./splash/logo.js";
import {createLoginPhase} from "./splash/login.js";
import {createTitlePhase} from "./splash/title.js";
import {THEME_FONT} from "../lib/utils/retro-theme.js";

const PHASE = {BIOS: 0, LOGO: 1, LOGIN: 2, TITLE: 3, EXIT: 4};

const loadedGoogleStylesheets = new Set();
const loadedLocalFontFaces = new Set();
const appliedFontState = new WeakMap();

async function ensureGoogleFontLoaded(cssUrl, family, weight) {
	if (!cssUrl || !family || typeof document === "undefined") return false;

	if (!loadedGoogleStylesheets.has(cssUrl)) {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = cssUrl;
		document.head.appendChild(link);
		loadedGoogleStylesheets.add(cssUrl);
	}

	if (!document.fonts || !document.fonts.load) return false;
	try {
		await document.fonts.load(`${weight ?? "400"} 16px "${family}"`);
		return true;
	} catch {
		return false;
	}
}

async function ensureLocalFontLoaded(path, family, weight) {
	if (!path || !family || typeof document === "undefined" || !window.FontFace) return false;

	if (loadedLocalFontFaces.has(`${family}::${path}`)) return true;

	try {
		const face = new FontFace(family, `url(${path})`, {weight: weight ?? "400"});
		await face.load();
		document.fonts.add(face);
		loadedLocalFontFaces.add(`${family}::${path}`);
		return true;
	} catch {
		return false;
	}
}

export default function (container) {
	/** P2D offscreen buffer — all phase drawing happens here. */
	let artBuffer;
	let p5Instance = null;
	/** Font family string for canvas when using google/system provider */
	let splashFontFamily = THEME_FONT.family;
	let splashFontWeight = THEME_FONT.weight ?? "400";

	let phase = PHASE.BIOS;
	let exitFlashFrames = 0;

	/** Phase instances — created in setup once artBuffer is ready. */
	let bios = null;
	let logo = null;
	let login = null;
	let title = null;

	function getCanvasFont() {
		return splashFontFamily ?? "monospace";
	}

	function getCanvasFontWeight() {
		return splashFontWeight ?? "400";
	}

	function applyCanvasFont(buf, size, options = {}) {
		const family = getCanvasFont();
		const rawWeight = options.weight ?? getCanvasFontWeight();
		const weight = Number.parseInt(String(rawWeight), 10);
		const style = options.style ?? "normal";
		const p5TextStyle = style === "italic" ? p5Instance?.ITALIC : weight >= 600 ? p5Instance?.BOLD : p5Instance?.NORMAL;
		const font = `${style} ${weight} ${size}px ${family}`;
		const previous = appliedFontState.get(buf);

		if (previous?.font === font && previous.family === family && previous.size === size) return;

		buf.textFont(family);
		buf.textSize(size);
		if (p5TextStyle !== undefined) buf.textStyle(p5TextStyle);
		buf.drawingContext.font = font;
		appliedFontState.set(buf, {font, family, size});
	}

	return (sketch) => {
		p5Instance = sketch;
		// ── Setup ──────────────────────────────────────────────────────────────

		sketch.setup = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);

			artBuffer = sketch.createGraphics(w, h);
			artBuffer.noStroke();

			if (THEME_FONT.provider === "google") {
				splashFontFamily = THEME_FONT.family;
				splashFontWeight = THEME_FONT.weight ?? "400";
				ensureGoogleFontLoaded(THEME_FONT.googleCssUrl, THEME_FONT.family, THEME_FONT.weight).then((ok) => {
					if (ok) splashFontFamily = THEME_FONT.family;
				});
			} else if (THEME_FONT.provider === "local") {
				splashFontFamily = THEME_FONT.family;
				splashFontWeight = THEME_FONT.weight ?? "400";
				ensureLocalFontLoaded(THEME_FONT.localPath, THEME_FONT.family, THEME_FONT.weight).then((ok) => {
					if (ok) splashFontFamily = THEME_FONT.family;
				});
			} else if (THEME_FONT.provider === "system") {
				splashFontFamily = THEME_FONT.family || THEME_FONT.fallbackFamily;
				splashFontWeight = THEME_FONT.weight ?? "400";
			}
			const fontApi = {getCanvasFont, getCanvasFontWeight, applyCanvasFont};
			bios = createBiosPhase(sketch, artBuffer, fontApi);
			logo = createLogoPhase(sketch, artBuffer, fontApi);
			login = createLoginPhase(sketch, artBuffer, fontApi);
			title = createTitlePhase(sketch, artBuffer, fontApi);
		};

		// ── Draw ───────────────────────────────────────────────────────────────

		sketch.draw = () => {
			const now = sketch.millis();

			// Advance state machine
			if (phase === PHASE.BIOS && bios.isDone()) phase = PHASE.LOGO;
			if (phase === PHASE.LOGO && logo.isDone()) phase = PHASE.LOGIN;
			if (phase === PHASE.LOGIN && login.isDone()) phase = PHASE.TITLE;
			if (phase === PHASE.TITLE && title.isDone()) phase = PHASE.EXIT;

			// Delegate drawing to active phase
			switch (phase) {
				case PHASE.BIOS:
					bios.draw(now);
					break;
				case PHASE.LOGO:
					logo.draw(now);
					break;
				case PHASE.LOGIN:
					login.draw(now);
					break;
				case PHASE.TITLE:
					title.draw(now);
					break;
				case PHASE.EXIT:
					drawExit();
					break;
			}

			// Blit artBuffer onto visible canvas
			sketch.clear();
			sketch.image(artBuffer, 0, 0);
		};

		// ── Exit flash ─────────────────────────────────────────────────────────

		function drawExit() {
			exitFlashFrames++;
			const alpha = sketch.map(exitFlashFrames, 0, sketch.frameRate() * 0.4, 255, 0);
			artBuffer.background(255, 255, 255, Math.max(0, alpha));

			if (exitFlashFrames > sketch.frameRate() * 0.18) {
				sketch.noLoop();
				document.dispatchEvent(new CustomEvent("splash:complete"));
			}
		}

		// ── Input ──────────────────────────────────────────────────────────────

		sketch.keyPressed = () => {
			if (phase === PHASE.LOGO) logo.onKeyPressed();
			if (phase === PHASE.LOGIN) login.onKeyPressed(sketch.keyCode, sketch.key);
			return false; // prevent default browser scroll
		};

		// ── Resize ─────────────────────────────────────────────────────────────

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
		};
	};
}
