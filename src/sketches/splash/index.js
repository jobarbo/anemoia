/**
 * Splash screen orchestrator.
 *
 * State machine:
 *   LOGO  — boot certification splash; mouse click advances
 *   BIOS  — POST-style diagnostic text streams in
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
import {createCanvasCursor, drawCanvasCursor} from "../../lib/input/canvas-cursor.js";

const PHASE = {LOGO: 0, BIOS: 1, LOGIN: 2, TITLE: 3, EXIT: 4};

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
	let canvasCursor;
	/** Font family string for canvas when using google/system provider */
	let splashFontFamily = THEME_FONT.family;
	let splashFontWeight = THEME_FONT.weight ?? "400";
	let splashFontVersion = 0;

	let phase = PHASE.LOGO;

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
		let pointer = {x: 0, y: 0};

		// ── Setup ──────────────────────────────────────────────────────────────

		sketch.setup = () => {
			sketch.pixelDensity(1);
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);
			canvasCursor = createCanvasCursor({canvasEl: canvas.elt});

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
			pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: artBuffer.width, height: artBuffer.height});
			let hoveredCursor = phase === PHASE.TITLE;

			// Advance state machine
			if (phase === PHASE.LOGO && logo.isDone()) phase = PHASE.BIOS;
			if (phase === PHASE.BIOS && bios.isDone()) phase = PHASE.LOGIN;
			if (phase === PHASE.LOGIN && login.isDone()) phase = PHASE.TITLE;
			if (phase === PHASE.TITLE && title.isDone()) phase = PHASE.EXIT;

			// Delegate drawing to active phase
			switch (phase) {
				case PHASE.BIOS:
					bios.draw(now);
					break;
				case PHASE.LOGO:
					logo.draw(now);
					hoveredCursor = logo.isPointerOver(pointer.x, pointer.y);
					break;
				case PHASE.LOGIN:
					login.draw(now);
					break;
				case PHASE.TITLE:
					title.draw(now);
					hoveredCursor = title.isPointerOver(pointer.x, pointer.y);
					break;
				case PHASE.EXIT:
					drawExit();
					break;
			}

			// Blit artBuffer onto visible canvas
			drawCanvasCursor(artBuffer, pointer, {hovered: hoveredCursor});
			sketch.clear();
			sketch.image(artBuffer, 0, 0);
		};

		// ── Exit flash ─────────────────────────────────────────────────────────

		function drawExit() {
			sketch.noLoop();
			document.dispatchEvent(new CustomEvent("splash:complete"));
		}

		// ── Input ──────────────────────────────────────────────────────────────

		sketch.mousePressed = () => {
			if (phase === PHASE.LOGO) logo.onPointerPressed(pointer.x, pointer.y);
			if (phase === PHASE.TITLE) title.onPointerPressed(pointer.x, pointer.y);
			return false;
		};

		sketch.keyPressed = () => {
			const isConfirmKey = sketch.keyCode === sketch.ENTER || sketch.keyCode === sketch.RETURN || sketch.keyCode === 13 || sketch.key === "Enter" || sketch.key === "Return";
			if (phase === PHASE.LOGO && isConfirmKey) logo.onConfirm();
			if (phase === PHASE.LOGIN) login.onKeyPressed(sketch.keyCode, sketch.key);
			if (phase === PHASE.TITLE && isConfirmKey) title.onConfirm();
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

		if (typeof sketch.registerMethod === "function") {
			sketch.registerMethod("remove", () => {
				canvasCursor?.destroy();
			});
		}
	};
}
