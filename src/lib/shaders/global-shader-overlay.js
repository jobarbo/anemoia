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
import {drawElementLikeObjectFit} from "../utils/canvas-object-fit-draw.js";
import {ShaderEffects} from "./shader-effects.js";

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
	pixelGrid: {
		enabled: false,
		gridCols: 1660.0,
		gridRows: 6120.0,
		cellRatio: 1.0,
		mode: 1.0,
		diffuse: 1.0,
		gapSize: 0.0,
		gapBrightness: 1.0,
	},

	colorQuantize: {
		enabled: false,
		levelsPerChannel: 12.0,
		blend: 1,
	},
	dither: {
		enabled: false,
		ditherMode: 0, // Bayer 8x8
		levels: 8,
		blend: 1,
		strength: 1.0,
		scale: 0.1,
		colorMode: 0,
	},
	zoom: {
		enabled: true,
		zoomAmount: 0.8,
		zoomSpeed: 0.8,
		animateZoom: 0.0,
		easingMode: 4.0,
	},
	crtDisplay: {
		enabled: true,
		brightness: 0.99,
		cellSize: 2.0,
		gapOpacity: 0.6,
		rgbOpacity: 0.7,
		rgbGain: [1.0, 1.0, 1.0],
		dotRadius: 0.41,
		dotFalloff: 0.4,
		filterMode: 1.0,
	},

	crtWarp: {
		enabled: true,
		warpAmount: 0.25,
		aspectCorrect: 1.0,
		borderColor: 2.0,
		vignette: 0.0,
		cornerSmooth: 0.015,
		cornerRadius: 0.2,
		boundsInset: 0.1,
	},

	blur: {
		enabled: true,
		blurAmount: 2.0,
		blurQuality: 40.0,
		blurDirection: 0,
		blurCenter: [0.5, 0.5],
		blurStart: 0.1586,
		blurCrt: 1.0,
		blurCrtPower: 10.0,
		blurMin: 0.0,
	},
	chromatic: {
		enabled: true,
		amount: 0.0025,
		timeMultiplier: 0.0,
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

	// Scene-wide overlays (slot fallback / explicit scene-level sketches) render above layers.
	const sceneOutlet = /** @type {HTMLElement|null} */ (container.querySelector("[data-scene-slot-outlet]"));
	if (!sceneOutlet) return;
	for (const el of sceneOutlet.querySelectorAll("img, canvas, video")) {
		drawCompositorDrawable(ctx, /** @type {HTMLElement} */ (el), w, h);
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
	// Always clear to black — body can be themed separately; light clears caused visible flashes
	// when swapping scenes before the next canvas frame is captured.
	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, w, h);

	if (container.querySelector(".scene__layer-container")) {
		compositeLayerContainers(container, ctx, w, h);
	} else if (container.hasAttribute("data-dom-snapshot") && domSnapshotCanvas) {
		ctx.drawImage(domSnapshotCanvas, 0, 0, w, h);
	} else {
		compositeFlatRaster(container, ctx, w, h);
	}
}

const smoothstep = (x) => x * x * (3 - 2 * x);

/**
 * CRT-style beam collapse / expand (vertical squash), then fade to black on power-off.
 * Draws into `dest` from `raw` (same dimensions).
 *
 * @param {p5.Graphics} raw
 * @param {p5.Graphics} dest
 * @param {number} t - 0..1 animation progress
 * @param {"out"|"in"} direction
 */
function applyCrtBeamTransition(raw, dest, t, direction) {
	const w = dest.width;
	const h = dest.height;
	const sctx = dest.drawingContext;
	const src = /** @type {HTMLCanvasElement} */ (raw.elt);
	// p5 sets canvas bitmap size = logical size × pixelDensity — source rect must use actual
	// bitmap dimensions or drawImage only samples the top-left quadrant (zoomed / misaligned).
	const sw = src.width;
	const sh = src.height;

	sctx.save();
	sctx.fillStyle = "#000000";
	sctx.fillRect(0, 0, w, h);

	if (direction === "out") {
		// Power off: image squashes to a thin phosphor line, then fades to black
		let hRatio;
		let blackout = 0;
		if (t < 0.78) {
			const u = t / 0.78;
			const e = smoothstep(u);
			hRatio = 1 - e * (1 - 0.024);
		} else {
			const u = (t - 0.78) / 0.22;
			const e = smoothstep(u);
			hRatio = 0.024 * (1 - e);
			blackout = e;
		}

		const dh = Math.max(1, h * hRatio);
		const y0 = (h - dh) / 2;
		sctx.imageSmoothingEnabled = true;
		sctx.drawImage(src, 0, 0, sw, sh, 0, y0, w, dh);

		if (hRatio < 0.1 && hRatio > 0.002) {
			sctx.globalCompositeOperation = "screen";
			const glow = Math.min(0.55, (0.1 - hRatio) / 0.1);
			sctx.fillStyle = `rgba(130, 255, 170, ${glow * 0.42})`;
			sctx.fillRect(0, y0, w, dh);
			sctx.globalCompositeOperation = "source-over";
		}

		if (blackout > 0) {
			sctx.globalAlpha = blackout;
			sctx.fillStyle = "#000000";
			sctx.fillRect(0, 0, w, h);
			sctx.globalAlpha = 1;
		}
	} else {
		// Power on: faint line expands; ease-out so it “warms up” like a CRT waking
		const easeOut = (x) => 1 - (1 - x) ** 3;
		const pre = 0.07;
		let u = (t - pre) / (1 - pre);
		if (t < pre) {
			u = 0;
		}
		u = Math.max(0, Math.min(1, u));
		const e = easeOut(u);
		const hRatio = 0.02 + e * (1 - 0.02);
		const fadeIn = Math.min(1, t / 0.14);

		const dh = Math.max(1, h * hRatio);
		const y0 = (h - dh) / 2;
		sctx.globalAlpha = fadeIn;
		sctx.imageSmoothingEnabled = true;
		sctx.drawImage(src, 0, 0, sw, sh, 0, y0, w, dh);
		sctx.globalAlpha = 1;

		if (hRatio < 0.14) {
			sctx.globalCompositeOperation = "screen";
			sctx.fillStyle = "rgba(120, 240, 160, 0.18)";
			sctx.fillRect(0, y0, w, dh);
			sctx.globalCompositeOperation = "source-over";
		}
	}

	sctx.restore();
}

/** z-index string for the overlay canvas; reads --game-shader-overlay-z from :root */
function getShaderOverlayZIndex() {
	const raw = getComputedStyle(document.documentElement).getPropertyValue("--game-shader-overlay-z").trim();
	return raw || "9000";
}

/** Run the compositor every N draw frames (~6 = 10fps at 60fps render rate) */
const COMPOSITE_EVERY_N_FRAMES = 1;

/** @type {GlobalShaderOverlay|null} */
let _overlayInstance = null;

/** Singleton accessor for the active GlobalShaderOverlay (set on mount). */
export function getGlobalShaderOverlay() {
	return _overlayInstance;
}

export class GlobalShaderOverlay {
	/**
	 * @param {{ effects?: Record<string, object> }} [options]
	 */
	constructor(options = {}) {
		this._effects = options.effects ?? DEFAULT_EFFECTS;

		/** @type {p5|null} */
		this._p5Instance = null;
		/** @type {ShaderEffects|null} Live shader pipeline — set after loadShaders completes */
		this._shaderEffects = null;
		/** @type {p5.Graphics|null} P2D buffer — compositor draws here */
		this._captureBuffer = null;
		/** @type {p5.Graphics|null} Unprocessed composite; CRT transition reads from here into _captureBuffer */
		this._rawComposite = null;
		/** @type {p5.Graphics|null} WEBGL buffer — receives P2D, fed to shader pipeline */
		this._webglBuffer = null;
		/** @type {{ direction: 'out'|'in', startTime: number, durationMs: number, resolve: () => void } | null} */
		this._crtTransition = null;
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
		/** @type {number} 0 = fully visible, 1 = fully black (used for scene transitions) */
		this._transitionAlpha = 0;
	}

	/**
	 * Create the overlay and start rendering.
	 * @param {HTMLElement} scrollContainer - Root [data-game-screen]
	 */
	mount(scrollContainer) {
		this._scrollContainer = scrollContainer;
		_overlayInstance = this;

		const shaders = new ShaderEffects({effects: this._effects});
		const self = this;

		const sketchFn = (sketch) => {
			sketch.setup = async () => {
				await shaders.loadShaders(sketch);
				self._shaderEffects = shaders;

				const w = window.innerWidth;
				const h = window.innerHeight;

				// P2D buffer: final pre-shader frame (after optional CRT pass)
				self._captureBuffer = sketch.createGraphics(w, h);
				// Raw composite from DOM/canvas before CRT beam effect
				self._rawComposite = sketch.createGraphics(w, h);
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
					const cw = self._captureBuffer.width;
					const ch = self._captureBuffer.height;

					compositeGameScreen(self._scrollContainer, self._rawComposite.drawingContext, cw, ch, self._domSnapshotCanvas);

					if (self._crtTransition) {
						const tr = self._crtTransition;
						const elapsed = performance.now() - tr.startTime;
						const t = Math.min(1, elapsed / tr.durationMs);
						applyCrtBeamTransition(self._rawComposite, self._captureBuffer, t, tr.direction);
						if (t >= 1) {
							const {resolve, direction} = tr;
							self._crtTransition = null;
							self._transitionAlpha = direction === "out" ? 1 : 0;
							queueMicrotask(resolve);
						}
					} else {
						self._captureBuffer.image(self._rawComposite, 0, 0, cw, ch);
						if (self._transitionAlpha > 0) {
							const ctx = self._captureBuffer.drawingContext;
							ctx.save();
							ctx.globalAlpha = self._transitionAlpha;
							ctx.fillStyle = "#000000";
							ctx.fillRect(0, 0, cw, ch);
							ctx.restore();
						}
					}

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
				self._rawComposite.resizeCanvas(w, h);
				self._webglBuffer.resizeCanvas(w, h);
				sketch.resizeCanvas(w, h);
				self._domSnapshotCanvas = null;
				self._lastDomSnapshotStartedAt = 0;
				shaders.reinitializePipeline();
			};
		};

		this._p5Instance = new p5(sketchFn);
	}

	/**
	 * Change the composited container without destroying the shader pipeline.
	 * Called by SceneRouter after each scene swap.
	 *
	 * @param {HTMLElement} newContainer
	 */
	setContainer(newContainer) {
		this._scrollContainer = newContainer;
		// Reset DOM snapshot state — irrelevant for canvas-only scenes
		this._domSnapshotCanvas = null;
		this._domSnapshotInFlight = false;
		this._lastDomSnapshotStartedAt = 0;
		this._captureReady = false;
	}

	/**
	 * Apply per-scene shader effect overrides on top of DEFAULT_EFFECTS.
	 * Each key in `overrides` is shallow-merged into the corresponding effect group.
	 * Call with no argument (or empty object) to reset to defaults.
	 *
	 * @param {Record<string, object>} overrides
	 */
	setEffects(overrides = {}) {
		// Build a fully-merged config (defaults first, then scene overrides) so that
		// a single applyEffectsConfig call both resets stale values and applies new ones.
		/** @type {Record<string, object>} */
		const merged = {};
		for (const [key, defaults] of Object.entries(DEFAULT_EFFECTS)) {
			merged[key] = {...defaults, ...(overrides[key] ?? {})};
		}
		// Also keep effect groups not present in DEFAULT_EFFECTS (e.g. pixelSort test overrides).
		for (const [key, val] of Object.entries(overrides)) {
			if (key in merged) continue;
			merged[key] = {...val};
		}

		// Update the backing object so constructor-time reads stay consistent
		for (const [key, val] of Object.entries(merged)) {
			if (!this._effects[key]) this._effects[key] = {};
			Object.assign(this._effects[key], val);
		}

		// Apply to the live pipeline if it's already running
		if (this._shaderEffects) {
			this._shaderEffects.applyEffectsConfig(merged);
		}
	}

	/**
	 * Animate _transitionAlpha to `target` over `durationMs` milliseconds.
	 * Resolves when the animation is complete.
	 * The draw loop reads _transitionAlpha and overlays a black rect on the output.
	 *
	 * @param {number} target - 0 (visible) or 1 (black)
	 * @param {number} durationMs
	 * @returns {Promise<void>}
	 */
	/**
	 * Simple linear fade to/from black (legacy). Prefer {@link crtSceneTransition} for scene changes.
	 */
	fadeTransition(target, durationMs) {
		return new Promise((resolve) => {
			const start = performance.now();
			const from = this._transitionAlpha;
			const self = this;

			const tick = (now) => {
				const t = Math.min(1, (now - start) / durationMs);
				self._transitionAlpha = from + (target - from) * t;
				if (t < 1) {
					requestAnimationFrame(tick);
				} else {
					self._transitionAlpha = target;
					resolve();
				}
			};
			requestAnimationFrame(tick);
		});
	}

	/**
	 * CRT-style scene change: vertical beam collapse (power off) or expand (power on).
	 * Resolves when the animation completes. Shader pipeline keeps running; only the CPU composite changes.
	 *
	 * @param {"out"|"in"} direction - `out` = old screen shuts down; `in` = new screen warms up
	 * @param {number} durationMs
	 * @returns {Promise<void>}
	 */
	crtSceneTransition(direction, durationMs) {
		return new Promise((resolve) => {
			if (direction === "in") {
				this._transitionAlpha = 0;
			}
			this._crtTransition = {
				direction,
				startTime: performance.now(),
				durationMs,
				resolve,
			};
		});
	}

	/**
	 * Returns the current warp parameters needed for pointer-coordinate remapping.
	 * Returns null when the shader pipeline has not yet initialised.
	 *
	 * @returns {{ W: number, H: number, crtWarp: object|null, zoom: object|null }|null}
	 */
	getWarpParams() {
		if (!this._shaderEffects) return null;

		const cfg = this._shaderEffects.effectsConfig;
		return {
			W: window.innerWidth,
			H: window.innerHeight,
			crtWarp: cfg.crtWarp ?? null,
			zoom: cfg.zoom ?? null,
		};
	}

	destroy() {
		this._destroyed = true;
		if (_overlayInstance === this) _overlayInstance = null;

		if (this._p5Instance) {
			this._p5Instance.remove();
			this._p5Instance = null;
		}

		this._captureBuffer = null;
		this._rawComposite = null;
		this._crtTransition = null;
		this._webglBuffer = null;
		this._scrollContainer = null;
		this._captureReady = false;
		this._domSnapshotCanvas = null;
		this._domSnapshotInFlight = false;
		this._shaderEffects = null;
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
