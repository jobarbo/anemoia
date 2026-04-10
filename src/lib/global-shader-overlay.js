/**
 * Global WebGL Shader Overlay
 *
 * Composites the visible scene layers directly using Canvas2D drawImage(),
 * then feeds the result into the ShaderEffects pipeline on a position:fixed
 * WEBGL canvas that sits above all page content.
 *
 * Why not html2canvas:
 *   html2canvas clones the entire DOM and re-renders it — 200-800ms of main-thread
 *   blocking per call, which freezes GSAP parallax and p5 draw loops.
 *
 * Fast compositor instead:
 *   - Queries .scene__layer-container elements (sorted by z-index)
 *   - Calls getBoundingClientRect() on each <img>/<canvas>/<video> child
 *   - Draws them with drawElementLikeObjectFit() (object-fit / object-position) — ~5-20ms
 *   - getBoundingClientRect() includes CSS parallax transforms, so the capture
 *     reflects the current parallax state automatically
 *
 * Composite runs every COMPOSITE_EVERY_N_FRAMES frames inside sketch.draw(),
 * so it's frame-rate adaptive and never runs during a compositor frame it would block.
 *
 * Buffer pipeline (mirrors splash.js artBuffer → mainCanvas):
 *   compositeScene() → captureBuffer (P2D)
 *     → webglBuffer (WEBGL) via p5 image()
 *       → ShaderEffects pipeline → overlay canvas (position:fixed)
 */
import p5 from "p5";
import {drawElementLikeObjectFit} from "./canvas-object-fit-draw.js";
import {ShaderEffects} from "./p5/sketch-shaders.js";

const DEFAULT_EFFECTS = {
	pixelSort: {
		enabled: true,
		sortAmount: 1.28,
		sampleCount: 112.0,
		sortMode: 4.0,
		threshold: 0.8,
		invert: 1.0,
	},
	pixelGrid: {
		enabled: true,
		gridCols: 640.0,
		gridRows: 420.0,
		cellRatio: 1.0,
		mode: 1.0,
		diffuse: 0.0,
		gapSize: 0.0,
		gapBrightness: 1.0,
	},
	blur: {
		enabled: true,
		blurAmount: 20.15,
		blurMode: 1.0,
		blurCenter: [0.5, 0.5],
		blurRadius: 0.05,
		blurStart: 0.86,
		blurCrt: 1.0,
		blurCrtPower: 789.0,
		blurMin: 0,
	},
	chromatic: {
		enabled: true,
		amount: 0.0035,
		timeMultiplier: 0.0,
	},
	crtWarp: {
		enabled: true,
		warpAmount: 0.2,
		aspectCorrect: 1.0,
		borderColor: 2.0,
		vignette: 0.5,
		cornerSmooth: 0.015,
		cornerRadius: 0.2,
		boundsInset: 0.1,
	},

	crtDisplay: {
		enabled: true,
		brightness: 0.0,
		cellSize: 2.0,
		gapOpacity: 0.9,
		rgbOpacity: 0.0,
		rgbGain: [1.0, 1.0, 1.0],
		dotRadius: 0.8,
		dotFalloff: 0.6,
		filterMode: 0.0,
	},
};

/**
 * Composite visible scene layers to a Canvas2D context.
 * Reads layer order from .scene__layer-container z-index, draws each
 * <img>/<canvas>/<video> at its current screen position (parallax included).
 *
 * @param {HTMLElement} container - The scroll container (.neighborhood-container)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function compositeScene(container, ctx, w, h) {
	// Fill with the page background first so areas not covered by any layer
	// are opaque — without this, gaps between/around layers show transparent
	// pixels through the overlay canvas, revealing the unshaded DOM beneath.
	const bg = getComputedStyle(document.body).backgroundColor;
	ctx.fillStyle = bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#000";
	ctx.fillRect(0, 0, w, h);

	// Collect layer containers and sort back-to-front by z-index
	const layerContainers = /** @type {HTMLElement[]} */ ([...container.querySelectorAll(".scene__layer-container")]);
	layerContainers.sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));

	for (const layerEl of layerContainers) {
		const drawables = layerEl.querySelectorAll("img, canvas, video");
		for (const el of drawables) {
			// Skip our own overlay canvas and any explicitly excluded elements
			if (el.hasAttribute("data-html2canvas-ignore")) continue;

			const rect = el.getBoundingClientRect();

			// Skip zero-size and fully off-screen elements
			if (rect.width <= 0 || rect.height <= 0) continue;
			if (rect.right < 0 || rect.left > w || rect.bottom < 0 || rect.top > h) continue;

			const style = getComputedStyle(el);
			const opacity = parseFloat(style.opacity);
			const blend = style.mixBlendMode;

			ctx.save();
			if (!isNaN(opacity) && opacity < 1) ctx.globalAlpha = opacity;
			if (blend && blend !== "normal") ctx.globalCompositeOperation = /** @type {GlobalCompositeOperation} */ (blend);

			drawElementLikeObjectFit(ctx, /** @type {HTMLElement} */ (el), rect, style, w, h);

			ctx.restore();
		}
	}
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
	}

	/**
	 * Create the overlay and start rendering.
	 * @param {HTMLElement} scrollContainer - The .neighborhood-container
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
					zIndex: "9000",
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

				// Run compositor every N frames — fast enough for smooth-looking updates,
				// light enough (5-20ms) to not interfere with the 60fps shader loop
				if (self._frameCount % COMPOSITE_EVERY_N_FRAMES === 0) {
					compositeScene(self._scrollContainer, self._captureBuffer.drawingContext, self._captureBuffer.width, self._captureBuffer.height);
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
	}
}
