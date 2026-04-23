/**
 * Splash screen orchestrator.
 *
 * State machine:
 *   BIOS  — POST-style diagnostic text streams in
 *   LOGO  — "Boot-Boy OS 3.0" splash box; mouse click advances
 *   LOGIN — automated terminal login sequence
 *   TITLE — cinematic title card; mouse click advances
 *   EXIT  — white flash → dispatch 'splash:complete'
 *
 * Each phase lives in this folder.
 * This file owns the p5 lifecycle (setup / draw / mousePressed / windowResized)
 * and the artBuffer → visible canvas pipeline.
 */

import {createBiosPhase} from "./bios.js";
import {createLogoPhase} from "./logo.js";
import {createLoginPhase} from "./login.js";
import {createTitlePhase} from "./title.js";
import {THEME_FONT, applyThemeCanvasFont} from "../../lib/utils/retro-theme.js";

const PHASE = {BIOS: 0, LOGO: 1, LOGIN: 2, TITLE: 3, EXIT: 4};

const loadedGoogleStylesheets = new Set();
const loadedLocalFontFaces = new Set();

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
	/** Font family string for canvas when using google/system provider */
	let splashFontFamily = THEME_FONT.family;
	let splashFontWeight = THEME_FONT.weight ?? "400";
	let splashFontVersion = 0;

	let phase = PHASE.BIOS;
	let exitFlashFrames = 0;

	/** Phase instances — created in setup once artBuffer is ready. */
	let bios = null;
	let logo = null;
	let login = null;
	let title = null;

	function getCanvasFont() {
		return splashFontFamily ?? THEME_FONT.fallbackFamily;
	}

	function getCanvasFontWeight() {
		return splashFontWeight ?? "400";
	}

	function getCanvasFontVersion() {
		return splashFontVersion;
	}

	return (sketch) => {
		// ── Setup ──────────────────────────────────────────────────────────────

		sketch.setup = () => {
			sketch.pixelDensity(1);
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);

			artBuffer = sketch.createGraphics(w, h);
			artBuffer.pixelDensity(1);
			artBuffer.noStroke();

			if (THEME_FONT.provider === "google") {
				splashFontFamily = THEME_FONT.fallbackFamily;
				splashFontWeight = THEME_FONT.weight ?? "400";
				ensureGoogleFontLoaded(THEME_FONT.googleCssUrl, THEME_FONT.family, THEME_FONT.weight).then((ok) => {
					if (ok) {
						splashFontFamily = THEME_FONT.family;
						splashFontVersion++;
					}
				});
			} else if (THEME_FONT.provider === "local") {
				splashFontFamily = THEME_FONT.fallbackFamily;
				splashFontWeight = THEME_FONT.weight ?? "400";
				ensureLocalFontLoaded(THEME_FONT.localPath, THEME_FONT.family, THEME_FONT.weight).then((ok) => {
					if (ok) {
						splashFontFamily = THEME_FONT.family;
						splashFontVersion++;
					}
				});
			} else if (THEME_FONT.provider === "system") {
				splashFontFamily = THEME_FONT.family || THEME_FONT.fallbackFamily;
				splashFontWeight = THEME_FONT.weight ?? "400";
			}
			function applyCanvasFont(buf, size, options = {}) {
				applyThemeCanvasFont(buf, size, sketch, {
					family: getCanvasFont(),
					weight: options.weight ?? getCanvasFontWeight(),
					style: options.style,
				});
			}
			const fontApi = {getCanvasFont, getCanvasFontWeight, getCanvasFontVersion, applyCanvasFont};
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
			/* switch (phase) {
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
			} */

			title.draw(now);
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

		sketch.mousePressed = () => {
			if (phase === PHASE.LOGO) logo.onPointerPressed();
			if (phase === PHASE.TITLE) title.onPointerPressed();
			return false;
		};

		sketch.keyPressed = () => {
			if (phase === PHASE.LOGO) logo.onPointerPressed();
			if (phase === PHASE.LOGIN) login.onKeyPressed(sketch.keyCode, sketch.key);
			if (phase === PHASE.TITLE) title.onPointerPressed();
			return false; // prevent default browser scroll
		};

		// ── Resize ─────────────────────────────────────────────────────────────

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			sketch.resizeCanvas(w, h);
			artBuffer.resizeCanvas(w, h);
			artBuffer.pixelDensity(1);
		};
	};
}
