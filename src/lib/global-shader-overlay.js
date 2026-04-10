/**
 * Global WebGL Shader Overlay
 *
 * Composites raster content directly using Canvas2D drawImage(), then feeds the result
 * into the ShaderEffects pipeline on a position:fixed WEBGL canvas above page content.
 *
 * Why not html2canvas:
 *   html2canvas clones the entire DOM and re-renders it — 200-800ms of main-thread
 *   blocking per call, which freezes GSAP parallax and p5 draw loops.
 *
 * Two compositor modes (see compositeGameScreen):
 *   - Scene (neighborhood): .scene__layer-container sorted by z-index; img/canvas/video per layer.
 *     getBoundingClientRect() includes CSS parallax transforms.
 *   - Flat (splash, …): img/canvas/video under [data-game-screen] in document order.
 *   - DOM snapshot ([data-dom-snapshot], e.g. overworld): periodic html-to-image render of the
 *     screen root so HTML/CSS (map, text) reach the shader. Throttled; excludes
 *     [data-composite-exclude] / [data-html2canvas-ignore] (e.g. back link stays sharp above).
 *
 * Limitation without [data-dom-snapshot]: only <img>, <canvas>, <video> pixels are captured.
 *
 * Composite runs every COMPOSITE_EVERY_N_FRAMES frames inside sketch.draw().
 *
 * Buffer pipeline (mirrors splash.js artBuffer → mainCanvas):
 *   compositeGameScreen() → captureBuffer (P2D)
 *     → webglBuffer (WEBGL) via p5 image()
 *       → ShaderEffects pipeline → overlay canvas (position:fixed, z-index from CSS)
 */
import p5 from "p5";
import {toCanvas} from "html-to-image";
import {drawElementLikeObjectFit} from "./canvas-object-fit-draw.js";
import {ShaderEffects} from "./p5/sketch-shaders.js";

/** Min delay between successful DOM snapshots (html-to-image is heavy). */
const DOM_SNAPSHOT_INTERVAL_MS = 1000;

/**
 * @param {HTMLElement} domNode
 * @returns {boolean}
 */
function domCompositeFilter(domNode) {
	if (domNode.nodeType !== Node.ELEMENT_NODE) return true;
	const el = /** @type {HTMLElement} */ (domNode);
	const tag = el.tagName;
	if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return false;
	if (el.hasAttribute("data-composite-exclude")) return false;
	if (el.closest("[data-html2canvas-ignore]")) return false;
	return true;
}

const DEFAULT_EFFECTS = {
	chromatic: {
		enabled: false,
		amount: 0.0005,
		timeMultiplier: 0.0,
	},
	pixelGrid: {
		enabled: false,
		gridCols: 660.0,
		gridRows: 620.0,
		cellRatio: 1.0,
		mode: 0.0,
		diffuse: 0.0,
		gapSize: 0.0,
		gapBrightness: 1.0,
	},
	zoom: {
		enabled: true,
		zoomAmount: 0.8,
		zoomSpeed: 0.8,
		animateZoom: 0.0,
		easingMode: 4.0,
	},
	colorQuantize: {
		enabled: false,
		levelsPerChannel: 12.0,
		blend: 1,
	},
	dither: {
		enabled: true,
		ditherMode: 1, // Bayer 8x8
		levels: 8,
		blend: 1,
		strength: 1.0,
		scale: 0.1,
		colorMode: 1,
	},

	// Ordered dither (off by default — enable to avoid stacking with colorQuantize or tune both)

	crtDisplay: {
		enabled: true,
		brightness: 0.5,
		cellSize: 2.0,
		gapOpacity: 0.9,
		rgbOpacity: 0.0,
		rgbGain: [1.0, 1.0, 1.0],
		dotRadius: 0.8,
		dotFalloff: 0.6,
		filterMode: 0.0,
	},
	crtWarp: {
		enabled: true,
		warpAmount: 0.2,
		aspectCorrect: 1.0,
		borderColor: 2.0,
		vignette: 0.05,
		cornerSmooth: 0.015,
		cornerRadius: 0.2,
		boundsInset: 0.1,
	},
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLElement} el
 * @param {number} w viewport width
 * @param {number} h viewport height
 */
function drawCompositorDrawable(ctx, el, w, h) {
	if (el.closest("[data-html2canvas-ignore]")) return;

	const rect = el.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) return;
	if (rect.right < 0 || rect.left > w || rect.bottom < 0 || rect.top > h) return;

	const style = getComputedStyle(el);
	const opacity = parseFloat(style.opacity);
	const blend = style.mixBlendMode;

	ctx.save();
	if (!isNaN(opacity) && opacity < 1) ctx.globalAlpha = opacity;
	if (blend && blend !== "normal") ctx.globalCompositeOperation = /** @type {GlobalCompositeOperation} */ (blend);

	drawElementLikeObjectFit(ctx, el, rect, style, w, h);

	ctx.restore();
}

/**
 * Parallax scene: layers from SceneRenderer, back-to-front by z-index.
 *
 * @param {HTMLElement} container - [data-game-screen] root
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function compositeLayerContainers(container, ctx, w, h) {
	const layerContainers = /** @type {HTMLElement[]} */ ([...container.querySelectorAll(".scene__layer-container")]);
	layerContainers.sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));

	for (const layerEl of layerContainers) {
		for (const el of layerEl.querySelectorAll("img, canvas, video")) {
			drawCompositorDrawable(ctx, /** @type {HTMLElement} */ (el), w, h);
		}
	}
}

/**
 * Non-scene screens: document-order raster pass (e.g. splash canvas).
 *
 * @param {HTMLElement} container
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function compositeFlatRaster(container, ctx, w, h) {
	for (const el of container.querySelectorAll("img, canvas, video")) {
		drawCompositorDrawable(ctx, /** @type {HTMLElement} */ (el), w, h);
	}
}

/**
 * Fills capture buffer with body background, then scene layers, DOM snapshot, or flat rasters.
 *
 * @param {HTMLElement} container - [data-game-screen] root
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {HTMLCanvasElement|null} domSnapshotCanvas - from html-to-image when [data-dom-snapshot]
 */
function compositeGameScreen(container, ctx, w, h, domSnapshotCanvas) {
	const bg = getComputedStyle(document.body).backgroundColor;
	ctx.fillStyle = bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#000";
	ctx.fillRect(0, 0, w, h);

	if (container.querySelector(".scene__layer-container")) {
		compositeLayerContainers(container, ctx, w, h);
	} else if (container.hasAttribute("data-dom-snapshot") && domSnapshotCanvas) {
		ctx.drawImage(domSnapshotCanvas, 0, 0, w, h);
	} else {
		compositeFlatRaster(container, ctx, w, h);
	}
}

/** z-index string for the overlay canvas; reads --game-shader-overlay-z from :root */
function getShaderOverlayZIndex() {
	const raw = getComputedStyle(document.documentElement).getPropertyValue("--game-shader-overlay-z").trim();
	return raw || "9000";
}

/** Run the compositor every N draw frames (~6 = 10fps at 60fps render rate) */
const COMPOSITE_EVERY_N_FRAMES = 1;

export class GlobalShaderOverlay {
	/**
	 * @param {{ effects?: Record<string, object> }} [options]
	 */
	constructor(options = {}) {
		this._effects = options.effects ?? DEFAULT_EFFECTS;

		/** @type {p5|null} */
		this._p5Instance = null;
		/** @type {p5.Graphics|null} P2D buffer — compositor draws here */
		this._captureBuffer = null;
		/** @type {p5.Graphics|null} WEBGL buffer — receives P2D, fed to shader pipeline */
		this._webglBuffer = null;
		/** @type {HTMLElement|null} */
		this._scrollContainer = null;
		/** @type {boolean} */
		this._destroyed = false;
		/** @type {number} */
		this._frameCount = 0;
		/** @type {boolean} True after first composite completes */
		this._captureReady = false;
		/** @type {HTMLCanvasElement|null} Last html-to-image capture for [data-dom-snapshot] screens */
		this._domSnapshotCanvas = null;
		/** @type {boolean} */
		this._domSnapshotInFlight = false;
		/** @type {number} performance.now() when a DOM snapshot was last *started* (throttles retries) */
		this._lastDomSnapshotStartedAt = 0;
	}

	/**
	 * Create the overlay and start rendering.
	 * @param {HTMLElement} scrollContainer - Root [data-game-screen]
	 */
	mount(scrollContainer) {
		this._scrollContainer = scrollContainer;

		const shaders = new ShaderEffects({effects: this._effects});
		const self = this;

		const sketchFn = (sketch) => {
			sketch.setup = async () => {
				await shaders.loadShaders(sketch);

				const w = window.innerWidth;
				const h = window.innerHeight;

				// P2D buffer: compositor draws here via Canvas2D drawImage()
				self._captureBuffer = sketch.createGraphics(w, h);
				// WEBGL buffer: receives P2D content via p5 image(), used as shader uTexture
				self._webglBuffer = sketch.createGraphics(w, h, sketch.WEBGL);

				const outputCanvas = sketch.createCanvas(w, h, sketch.WEBGL);
				outputCanvas.elt.remove();
				Object.assign(outputCanvas.elt.style, {
					position: "fixed",
					inset: "0",
					zIndex: getShaderOverlayZIndex(),
					pointerEvents: "none",
					display: "block",
				});
				outputCanvas.elt.setAttribute("data-html2canvas-ignore", "true");
				document.body.appendChild(outputCanvas.elt);

				shaders.setup(w, h, self._webglBuffer, sketch);
			};

			sketch.draw = () => {
				if (self._destroyed || !self._scrollContainer) return;

				self._frameCount++;

				scheduleDomSnapshotIfNeeded(self);

				// Run compositor every N frames — fast enough for smooth-looking updates,
				// light enough (5-20ms) to not interfere with the 60fps shader loop
				if (self._frameCount % COMPOSITE_EVERY_N_FRAMES === 0) {
					compositeGameScreen(self._scrollContainer, self._captureBuffer.drawingContext, self._captureBuffer.width, self._captureBuffer.height, self._domSnapshotCanvas);
					self._captureReady = true;
				}

				if (!self._captureReady) return;

				// P2D → WEBGL (same pattern as splash.js artBuffer → mainCanvas)
				self._webglBuffer.clear();
				self._webglBuffer.image(self._captureBuffer, -self._webglBuffer.width / 2, -self._webglBuffer.height / 2, self._webglBuffer.width, self._webglBuffer.height);

				// Animate shaders at full 60fps (grain, warp, chromatic are time-based)
				shaders.updateTime(0.016);
				shaders.apply();
			};

			sketch.windowResized = () => {
				const w = window.innerWidth;
				const h = window.innerHeight;
				self._captureBuffer.resizeCanvas(w, h);
				self._webglBuffer.resizeCanvas(w, h);
				sketch.resizeCanvas(w, h);
				self._domSnapshotCanvas = null;
				self._lastDomSnapshotStartedAt = 0;
				shaders.reinitializePipeline();
			};
		};

		this._p5Instance = new p5(sketchFn);
	}

	destroy() {
		this._destroyed = true;

		if (this._p5Instance) {
			this._p5Instance.remove();
			this._p5Instance = null;
		}

		this._captureBuffer = null;
		this._webglBuffer = null;
		this._scrollContainer = null;
		this._captureReady = false;
		this._domSnapshotCanvas = null;
		this._domSnapshotInFlight = false;
	}
}

/**
 * @param {InstanceType<typeof GlobalShaderOverlay>} overlay
 */
function scheduleDomSnapshotIfNeeded(overlay) {
	const el = overlay._scrollContainer;
	if (!el?.hasAttribute("data-dom-snapshot") || overlay._domSnapshotInFlight) return;

	const now = performance.now();
	if (now - overlay._lastDomSnapshotStartedAt < DOM_SNAPSHOT_INTERVAL_MS) return;

	const w = window.innerWidth;
	const h = window.innerHeight;

	overlay._lastDomSnapshotStartedAt = now;
	overlay._domSnapshotInFlight = true;

	toCanvas(el, {
		width: w,
		height: h,
		canvasWidth: w,
		canvasHeight: h,
		pixelRatio: 1,
		cacheBust: true,
		filter: domCompositeFilter,
	})
		.then((canvas) => {
			if (!overlay._destroyed) {
				overlay._domSnapshotCanvas = canvas;
			}
		})
		.catch(() => {
			/* keep previous frame on failure */
		})
		.finally(() => {
			overlay._domSnapshotInFlight = false;
		});
}
