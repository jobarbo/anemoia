/**
 * Splash screen orchestrator.
 *
 * State machine:
 *   CLICK_TO_START — débloque l’audio (1er clic / Entrée sur le canvas)
 *   BOOT  — court écran de mise en route; clic / Entrée ou délai auto → logo
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

import {createClickToStartPhase} from "./click-to-start.js";
import {createBootScreenPhase} from "./boot-screen.js";
import {createBiosPhase} from "./bios.js";
import {createLogoPhase} from "./logo.js";
import {createLoginPhase} from "./login.js";
import {createTitlePhase} from "./title.js";
import {THEME_FONT, applyThemeCanvasFont} from "../../lib/utils/retro-theme.js";
import {createCanvasCursor, drawCanvasCursor} from "../../lib/input/canvas-cursor.js";
import {playUiClickSfx, playUiHoverSfxIfTargetChanged} from "../../lib/audio/ui-hover-sfx.js";

const PHASE = {CLICK_TO_START: 0, BOOT: 1, LOGO: 2, BIOS: 3, LOGIN: 4, TITLE: 5, EXIT: 6};

/**
 * Pistes de fond du splash, mixées en parallèle (sous la musique du titre, `title.js`).
 * Ajoute une ligne `{ src, loop?, volume? }` pour une couche de plus ; `src: ""` ou entrée omise = ignorée.
 *
 * @type {ReadonlyArray<{ src: string, loop?: boolean, volume?: number }>}
 */
const SPLASH_BACKGROUND_TRACKS = [
	{src: "/assets/scenes/splash/boot.mp3", loop: true, volume: 0.99},
	{src: "/assets/scenes/splash/parasite.wav", loop: true, volume: 0.45},
];

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

	let phase = PHASE.CLICK_TO_START;

	/** Phase instances — created in setup once artBuffer is ready. */
	let clickToStart = null;
	let boot = null;
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
		/** @type {string|null} */
		let splashUiHoverPrevKey = null;
		/** @type {HTMLAudioElement[]} */
		let splashBackgroundAudios = [];

		function stopSplashAmbient() {
			for (let i = 0; i < splashBackgroundAudios.length; i++) {
				const a = splashBackgroundAudios[i];
				a.pause();
				a.currentTime = 0;
			}
		}

		/** Browsers block autoplay until a user gesture; first click/key on the sketch retries `play()`. */
		function tryPlaySplashAmbient() {
			for (let i = 0; i < splashBackgroundAudios.length; i++) {
				const p = splashBackgroundAudios[i].play();
				if (p !== undefined) p.catch(() => {});
			}
		}

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
			clickToStart = createClickToStartPhase(sketch, artBuffer, fontApi);
			boot = createBootScreenPhase(sketch, artBuffer, fontApi);
			bios = createBiosPhase(sketch, artBuffer, fontApi);
			logo = createLogoPhase(sketch, artBuffer, fontApi);
			login = createLoginPhase(sketch, artBuffer, fontApi);
			title = createTitlePhase(sketch, artBuffer, fontApi);

			splashBackgroundAudios = [];
			if (typeof Audio !== "undefined") {
				for (let i = 0; i < SPLASH_BACKGROUND_TRACKS.length; i++) {
					const t = SPLASH_BACKGROUND_TRACKS[i];
					if (!t?.src) continue;
					const a = new Audio(t.src);
					a.loop = t.loop ?? true;
					a.volume = t.volume ?? 1;
					splashBackgroundAudios.push(a);
				}
			}
		};

		// ── Draw ───────────────────────────────────────────────────────────────

		sketch.draw = () => {
			const now = sketch.millis();
			const phaseAtStart = phase;
			pointer = canvasCursor.beginFrame({mouseX: sketch.mouseX, mouseY: sketch.mouseY, width: artBuffer.width, height: artBuffer.height});
			let hoveredCursor = phase === PHASE.TITLE;

			// Advance state machine
			if (phase === PHASE.CLICK_TO_START && clickToStart.isDone()) phase = PHASE.BOOT;
			if (phase === PHASE.BOOT && boot.isDone()) phase = PHASE.LOGO;
			if (phase === PHASE.LOGO && logo.isDone()) phase = PHASE.BIOS;
			if (phase === PHASE.BIOS && bios.isDone()) phase = PHASE.LOGIN;
			if (phase === PHASE.LOGIN && login.isDone()) phase = PHASE.TITLE;
			if (phase === PHASE.TITLE && title.isDone()) {
				title.stopAudio();
				stopSplashAmbient();
				phase = PHASE.EXIT;
			}

			if (phase !== phaseAtStart) splashUiHoverPrevKey = null;

			// Delegate drawing to active phase
			switch (phase) {
				case PHASE.CLICK_TO_START:
					clickToStart.draw(now);
					hoveredCursor = clickToStart.isPointerOver(pointer.x, pointer.y);
					break;
				case PHASE.BOOT:
					boot.draw(now);
					hoveredCursor = boot.isPointerOver(pointer.x, pointer.y);
					break;
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

			{
				let uiHoverHotKey = null;
				if (phase === PHASE.CLICK_TO_START && clickToStart.isPointerOver(pointer.x, pointer.y)) uiHoverHotKey = "cts";
				else if (phase === PHASE.BOOT && boot.isPointerOver(pointer.x, pointer.y)) uiHoverHotKey = "boot";
				else if (phase === PHASE.LOGO && logo.isPointerOver(pointer.x, pointer.y)) uiHoverHotKey = "logo";
				else if (phase === PHASE.TITLE && title.isPointerOver(pointer.x, pointer.y)) uiHoverHotKey = "title";
				splashUiHoverPrevKey = playUiHoverSfxIfTargetChanged(splashUiHoverPrevKey, uiHoverHotKey);
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
			tryPlaySplashAmbient();
			let handled = false;
			if (phase === PHASE.CLICK_TO_START) handled = clickToStart.onPointerPressed(pointer.x, pointer.y);
			else if (phase === PHASE.BOOT) handled = boot.onPointerPressed(pointer.x, pointer.y);
			else if (phase === PHASE.LOGO) handled = logo.onPointerPressed(pointer.x, pointer.y);
			else if (phase === PHASE.TITLE) handled = title.onPointerPressed(pointer.x, pointer.y);
			if (handled) playUiClickSfx();
			return false;
		};

		sketch.keyPressed = () => {
			tryPlaySplashAmbient();
			const isConfirmKey =
				sketch.keyCode === sketch.ENTER ||
				sketch.keyCode === sketch.RETURN ||
				sketch.keyCode === 13 ||
				sketch.key === "Enter" ||
				sketch.key === "Return";
			if (phase === PHASE.CLICK_TO_START && isConfirmKey) {
				clickToStart.onConfirm();
				playUiClickSfx({throttleMs: 220});
			} else if (phase === PHASE.BOOT && isConfirmKey) {
				boot.onConfirm();
				playUiClickSfx({throttleMs: 220});
			} else if (phase === PHASE.LOGO && isConfirmKey) {
				logo.onConfirm();
				playUiClickSfx({throttleMs: 220});
			} else if (phase === PHASE.LOGIN) {
				login.onKeyPressed(sketch.keyCode, sketch.key);
			} else if (phase === PHASE.TITLE && isConfirmKey) {
				title.onConfirm();
				playUiClickSfx({throttleMs: 220});
			}
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
				title?.stopAudio?.();
				stopSplashAmbient();
				canvasCursor?.destroy();
			});
		}
	};
}
