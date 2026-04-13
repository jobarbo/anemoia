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

const PHASE = {BIOS: 0, LOGO: 1, LOGIN: 2, EXIT: 3};

// Change this object to switch splash typography globally.
const SPLASH_FONT = {
	// "google" | "local" | "system"
	provider: "google",
	// Used for provider: "google"
	family: "IBM Plex Mono",
	googleCssUrl: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&family=Overpass+Mono:wght@300..700&display=swap",
	// Used for provider: "local" (served from /public)
	localPath: "/assets/fonts/splash.ttf",
	// Used for provider: "system" and as fallback for all providers
	fallbackFamily: "monospace",
};

const loadedGoogleStylesheets = new Set();
const loadedLocalFontFaces = new Set();

async function ensureGoogleFontLoaded(cssUrl, family) {
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
		await document.fonts.load(`16px "${family}"`);
		return true;
	} catch {
		return false;
	}
}

async function ensureLocalFontLoaded(path, family) {
	if (!path || !family || typeof document === "undefined" || !window.FontFace) return false;

	if (loadedLocalFontFaces.has(`${family}::${path}`)) return true;

	try {
		const face = new FontFace(family, `url(${path})`);
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
	let splashFontFamily = SPLASH_FONT.fallbackFamily;

	let phase = PHASE.BIOS;
	let exitFlashFrames = 0;

	/** Phase instances — created in setup once artBuffer is ready. */
	let bios = null;
	let logo = null;
	let login = null;

	function getCanvasFont() {
		return splashFontFamily ?? "monospace";
	}

	return (sketch) => {
		// ── Setup ──────────────────────────────────────────────────────────────

		sketch.setup = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			const canvas = sketch.createCanvas(w, h);
			canvas.parent(container);

			artBuffer = sketch.createGraphics(w, h);
			artBuffer.noStroke();

			if (SPLASH_FONT.provider === "google") {
				splashFontFamily = SPLASH_FONT.fallbackFamily;
				ensureGoogleFontLoaded(SPLASH_FONT.googleCssUrl, SPLASH_FONT.family).then((ok) => {
					if (ok) splashFontFamily = SPLASH_FONT.family;
				});
			} else if (SPLASH_FONT.provider === "local") {
				splashFontFamily = SPLASH_FONT.fallbackFamily;
				ensureLocalFontLoaded(SPLASH_FONT.localPath, SPLASH_FONT.family).then((ok) => {
					if (ok) splashFontFamily = SPLASH_FONT.family;
				});
			} else if (SPLASH_FONT.provider === "system") {
				splashFontFamily = SPLASH_FONT.family || SPLASH_FONT.fallbackFamily;
			}

			const fontApi = {getCanvasFont};
			bios = createBiosPhase(sketch, artBuffer, fontApi);
			logo = createLogoPhase(sketch, artBuffer, fontApi);
			login = createLoginPhase(sketch, artBuffer, fontApi);
		};

		// ── Draw ───────────────────────────────────────────────────────────────

		sketch.draw = () => {
			const now = sketch.millis();

			// Advance state machine
			if (phase === PHASE.BIOS && bios.isDone()) phase = PHASE.LOGO;
			if (phase === PHASE.LOGO && logo.isDone()) phase = PHASE.LOGIN;
			if (phase === PHASE.LOGIN && login.isDone()) phase = PHASE.EXIT;

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
