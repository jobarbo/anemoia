/**
 * Neighborhood scene — client-side equivalent of the Astro SceneRenderer.
 *
 * Fetches the manifest from public/, builds the layer DOM programmatically,
 * mounts snow sketch, and initialises parallax. The GlobalShaderOverlay
 * captures it in "scene mode" (compositeLayerContainers) exactly as before
 * since the DOM structure is identical to what SceneRenderer.astro produced.
 *
 * On unmount, all event listeners and p5 instances are cleaned up.
 */

/** @type {Partial<import('../lib/shaders/global-shader-overlay.js').DEFAULT_EFFECTS>} */
const BASE_SCENE_EFFECTS = {
	crtDisplay: {brightness: 0.0},
};
/** @type {Partial<import('../lib/shaders/global-shader-overlay.js').DEFAULT_EFFECTS>} */
export const SCENE_EFFECTS = JSON.parse(JSON.stringify(BASE_SCENE_EFFECTS));
import p5 from "p5";
import {fetchNeighborhoodManifest, getStoriesByNeighborhood} from "../lib/data/scene-data.js";
import {DEBUG_DISABLE_PARALLAX, initMouseParallax, initScrollParallax} from "../lib/input/parallax.js";
import {initHeadTrackingParallax} from "../lib/input/head-tracking.js";
import {installPointerRemap} from "../lib/input/input-remap.js";
import {getSketchLoader} from "../sketches/index.js";

const DEFAULT_SCENE_SKETCHES = [{sketch: "snow", slot: "foreground"}];

export async function mount(container, params, data) {
	const {slug} = params;
	const neighborhood = data; // NeighborhoodData

	// Fetch manifest (includes parallax-config merge)
	const manifest = await fetchNeighborhoodManifest(neighborhood.scenePath, slug);
	applySceneEffectsOverride(manifest.sceneEffects);

	// ── Build DOM structure ─────────────────────────────────────────────────

	// Outer container — mirrors .neighborhood-container from the old page
	container.style.cssText = "height:100vh;background:#000;overflow-y:auto;overflow-x:visible;position:relative;";

	// Scene root — mirrors <div class="scene neighborhood-scene" data-scene-renderer …>
	const scene = document.createElement("div");
	scene.className = "scene neighborhood-scene";
	scene.dataset.sceneRenderer = "";
	scene.dataset.viewportAspect = "true";
	scene.dataset.headTracking = "true";
	if (manifest.depthCurve) scene.dataset.depthCurve = JSON.stringify(manifest.depthCurve);
	if (manifest.scrollDepthCurve) scene.dataset.scrollDepthCurve = JSON.stringify(manifest.scrollDepthCurve);
	scene.style.cssText = `width:100%;height:auto;aspect-ratio:${manifest.canvas.width}/${manifest.canvas.height};`;

	const layerMap = Object.fromEntries(manifest.layers.map((l) => [l.name, l]));
	const totalLayers = manifest.layers.length;

	// Slotted canvas placeholder (snow sketch goes here)
	const slotted = document.createElement("div");
	slotted.className = "scene__slotted";
	slotted.dataset.sceneSlotted = "";
	slotted.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;";
	const sceneSlotOutlet = document.createElement("div");
	sceneSlotOutlet.className = "scene__scene-slot-outlet";
	sceneSlotOutlet.dataset.sceneSlotOutlet = "";
	sceneSlotOutlet.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:1000;";

	const sceneSketches = Array.isArray(manifest.sceneSketches) && manifest.sceneSketches.length > 0 ? manifest.sceneSketches : DEFAULT_SCENE_SKETCHES;
	for (const entry of sceneSketches) {
		if (!entry || entry.enabled === false) continue;
		if (typeof entry.sketch !== "string" || entry.sketch.length === 0) continue;
		const sketchContainer = document.createElement("div");
		sketchContainer.className = "sketch-canvas";
		sketchContainer.dataset.sketchContainer = "";
		sketchContainer.dataset.sketch = entry.sketch;
		if (typeof entry.slot === "string" && entry.slot.length > 0) {
			sketchContainer.dataset.slot = entry.slot;
		}
		if (entry.data && typeof entry.data === "object") {
			sketchContainer.dataset.sketchData = JSON.stringify(entry.data);
		}
		slotted.appendChild(sketchContainer);
	}

	const neighborhoodOverlayContainer = document.createElement("div");
	neighborhoodOverlayContainer.className = "sketch-canvas";
	neighborhoodOverlayContainer.dataset.sketchContainer = "";
	neighborhoodOverlayContainer.dataset.sketch = "neighborhood";
	neighborhoodOverlayContainer.dataset.slot = "foreground";
	neighborhoodOverlayContainer.dataset.interactive = "true";
	neighborhoodOverlayContainer.style.pointerEvents = "auto";
	const navStories = getStoriesByNeighborhood(slug).map((s) => ({slug: s.id, title: s.title}));
	neighborhoodOverlayContainer.dataset.sketchData = JSON.stringify({
		slug,
		name: neighborhood.name ?? slug,
		navStories,
	});
	slotted.appendChild(neighborhoodOverlayContainer);

	const scenePath = `/assets/scenes/${slug}/layers`;

	// Build layer containers (mirrors SceneRenderer.astro layer loop)
	manifest.layers.forEach((layer, index) => {
		const layerDepth = totalLayers > 1 ? index / (totalLayers - 1) : 0.5;
		const parentLayer = layer.clipped && layer.clippedTo ? layerMap[layer.clippedTo] : null;

		const layerContainer = document.createElement("div");
		layerContainer.className = "scene__layer-container";
		layerContainer.style.zIndex = layer.zIndex;
		layerContainer.dataset.parallaxSpeed = layer.parallaxSpeed ?? 0;
		layerContainer.dataset.parallaxDepth = layerDepth;

		// Media element (img or video), possibly clipped
		const mediaEl = createLayerMedia(layer, parentLayer, scenePath);
		layerContainer.appendChild(mediaEl);
		const layerEffects = Array.isArray(manifest.layerEffects?.[layer.name]) ? manifest.layerEffects[layer.name] : [];
		for (const effect of layerEffects) {
			if (!effect || effect.enabled === false) continue;
			if (typeof effect.sketch !== "string" || effect.sketch.length === 0) continue;
			if (layer.type === "video" || layer.clipped) continue;
			const mode = effect.mode === "overlay" ? "overlay" : "recopie";
			const sketchLayerContainer = document.createElement("div");
			sketchLayerContainer.className = "sketch-canvas";
			sketchLayerContainer.dataset.sketchContainer = "";
			sketchLayerContainer.dataset.sketch = effect.sketch;
			sketchLayerContainer.dataset.slot = layer.name;
			sketchLayerContainer.dataset.sketchData = JSON.stringify({
				imagePath: layer.file.startsWith("/") || layer.file.startsWith("http") ? layer.file : `${scenePath}/${layer.file}`,
				mode,
				effects: resolveLayerEffectShaders(effect),
			});
			const zOffset = Number.isFinite(effect.zOffset) ? effect.zOffset : 2;
			sketchLayerContainer.style.cssText = `
				left: var(--layer-center-left);
				top: var(--layer-center-top);
				width: var(--layer-width);
				height: var(--layer-height);
				transform: translate(-50%, -50%);
				z-index: ${layer.zIndex + zOffset};
				--layer-center-left: ${layer.position.centerLeft}%;
				--layer-center-top: ${layer.position.centerTop}%;
				--layer-width: ${layer.position.width}%;
				--layer-height: ${layer.position.height}%;
			`;
			if (mode === "overlay") {
				sketchLayerContainer.style.opacity = String(typeof effect.opacity === "number" ? effect.opacity : 0.7);
				sketchLayerContainer.style.mixBlendMode = effect.mixBlendMode ?? "screen";
			} else {
				// Keep source layer visible until sketch reports it is ready.
				sketchLayerContainer.style.opacity = "0";
				sketchLayerContainer.style.mixBlendMode = effect.mixBlendMode ?? "normal";
				const recopieOpacity = String(typeof effect.opacity === "number" ? effect.opacity : 1);
				sketchLayerContainer.addEventListener(
					"layer-sketch-ready",
					() => {
						mediaEl.style.opacity = "0";
						sketchLayerContainer.style.opacity = recopieOpacity;
					},
					{once: true},
				);
			}
			slotted.appendChild(sketchLayerContainer);
		}

		// Interactive zone
		if (layer.interactive && layer.interaction) {
			layerContainer.appendChild(createInteractiveZone(layer, slug));
		}

		// Slot outlet for canvas sketches
		const outlet = document.createElement("div");
		outlet.className = "scene__layer-slot-outlet";
		outlet.dataset.slotOutlet = layer.name;
		outlet.style.cssText = "position:absolute;inset:0;pointer-events:none;";
		layerContainer.appendChild(outlet);

		scene.appendChild(layerContainer);
	});
	scene.appendChild(sceneSlotOutlet);
	scene.appendChild(slotted);

	container.appendChild(scene);

	// ── Distribute slotted content into layer outlets ────────────────────────
	distributeSlottedContent(scene);

	// Images / videos / mask PNGs must be ready before CRT “tube on” (router runs after mount returns)
	await waitForNeighborhoodAssets(scene);

	// PSD bottom alignment — scroll height is meaningful only after bitmaps decoded
	if (container.scrollHeight > container.clientHeight) {
		container.scrollTop = container.scrollHeight;
	}
	await waitFrames(2);

	// ── Mount p5 sketches (snow + neighborhood overlay) ─────────────────────
	const sketchInstances = [];
	const sketchEls = [...scene.querySelectorAll("[data-sketch-container]")];
	for (const sketchEl of sketchEls) {
		const sketchName = sketchEl.dataset.sketch;
		if (!sketchName) continue;
		const sketchMod = await getSketchLoader(sketchName);
		if (!sketchMod) {
			console.warn(`[neighborhood] unknown sketch "${sketchName}" — skipped`);
			continue;
		}
		const createSketch = sketchMod.default;
		if (typeof createSketch !== "function") continue;
		try {
			sketchInstances.push(new p5(createSketch(sketchEl), sketchEl));
		} catch (error) {
			console.error(`[neighborhood] sketch mount failed for "${sketchName}"`, error);
		}
	}

	// ── Parallax ──────────────────────────────────────────────────────────────
	const layers = scene.querySelectorAll(".scene__layer-container");

	let sceneDisposed = false;
	let cleanupParallax = () => {};
	if (!DEBUG_DISABLE_PARALLAX) {
		const scrollCleanup = initScrollParallax(layers, container);

		initHeadTrackingParallax(layers, {
			allowDeviceOrientationFallback: true,
			allowMouseFallback: true,
			scrollContainer: null,
		})
			.then((cleanup) => {
				if (sceneDisposed) {
					cleanup?.();
					scrollCleanup?.();
					return;
				}
				cleanupParallax = () => {
					cleanup?.();
					scrollCleanup?.();
				};
			})
			.catch(() => {
				if (sceneDisposed) {
					scrollCleanup?.();
					return;
				}
				const mouseCleanup = initMouseParallax(layers);
				cleanupParallax = () => {
					mouseCleanup?.();
					scrollCleanup?.();
				};
			});
	}

	// ── Pointer remapping (aligns click areas with CRT-warped visuals) ──────────
	const cleanupPointerRemap = installPointerRemap(container);

	return {
		unmount() {
			sceneDisposed = true;
			cleanupParallax();
			cleanupPointerRemap();
			for (const instance of sketchInstances) instance.remove();
		},
	};
}

/**
 * Build shader-effects payload from layer effect entry.
 * Supports new generic `effects` plus legacy `pixelSort`.
 *
 * @param {Record<string, any>} effect
 * @returns {Record<string, object>}
 */
function resolveLayerEffectShaders(effect) {
	if (effect.effects && typeof effect.effects === "object" && !Array.isArray(effect.effects)) {
		return effect.effects;
	}
	if (effect.pixelSort && typeof effect.pixelSort === "object") {
		return {
			pixelSort: {
				...effect.pixelSort,
				enabled: effect.pixelSort.enabled ?? true,
			},
		};
	}
	return {};
}

/**
 * Reset SCENE_EFFECTS to defaults, then apply per-neighborhood overrides from scene-config.
 * SceneRouter reads the same exported object reference before mount() and applies it after mount().
 *
 * @param {Record<string, object>|undefined} overrides
 */
function applySceneEffectsOverride(overrides) {
	for (const key of Object.keys(SCENE_EFFECTS)) {
		delete SCENE_EFFECTS[key];
	}
	for (const [key, value] of Object.entries(BASE_SCENE_EFFECTS)) {
		SCENE_EFFECTS[key] = {...value};
	}
	if (!overrides || typeof overrides !== "object") return;
	for (const [key, patch] of Object.entries(overrides)) {
		if (!patch || typeof patch !== "object") continue;
		SCENE_EFFECTS[key] = {...(SCENE_EFFECTS[key] ?? {}), ...patch};
	}
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function createLayerMedia(layer, parentLayer, scenePath) {
	const imagePath = layer.file.startsWith("/") || layer.file.startsWith("http") ? layer.file : `${scenePath}/${layer.file}`;

	const style = `
		--layer-center-left: ${layer.position.centerLeft}%;
		--layer-center-top: ${layer.position.centerTop}%;
		--layer-width: ${layer.position.width}%;
		--layer-height: ${layer.position.height}%;
		--layer-opacity: ${typeof layer.opacity === "number" ? layer.opacity : 1};
		--layer-blend: ${layer.blendMode ?? "normal"};
	`;

	const isClipped = Boolean(layer.clipped && parentLayer);

	if (!isClipped) {
		const el = layer.type === "video" ? document.createElement("video") : document.createElement("img");
		el.className = `layer ${layer.type === "video" ? "layer--video" : "layer--image"}`;
		el.style.cssText = style;
		if (layer.type === "video") {
			el.src = imagePath;
			el.autoplay = true;
			el.loop = true;
			el.muted = true;
			el.playsInline = true;
		} else {
			el.src = imagePath;
			el.alt = layer.name;
		}
		return el;
	}

	// Clipped layer
	const parentLeftCorner = parentLayer.position.centerLeft - parentLayer.position.width / 2;
	const parentTopCorner = parentLayer.position.centerTop - parentLayer.position.height / 2;
	const childRelCenterLeft = ((layer.position.centerLeft - parentLayer.position.centerLeft) / parentLayer.position.width) * 100;
	const childRelCenterTop = ((layer.position.centerTop - parentLayer.position.centerTop) / parentLayer.position.height) * 100;
	const childRelWidth = (layer.position.width / parentLayer.position.width) * 100;
	const childRelHeight = (layer.position.height / parentLayer.position.height) * 100;
	const clipMaskPath = `${scenePath}/${parentLayer.file}`;

	const wrapper = document.createElement("div");
	wrapper.className = "clipped-wrapper";
	wrapper.style.cssText = `
		position: absolute;
		left: ${parentLeftCorner}%;
		top: ${parentTopCorner}%;
		width: ${parentLayer.position.width}%;
		height: ${parentLayer.position.height}%;
		overflow: hidden;
		-webkit-mask-image: url(${clipMaskPath});
		mask-image: url(${clipMaskPath});
		-webkit-mask-mode: luminance;
		mask-mode: luminance;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
		-webkit-mask-size: 100% 100%;
		mask-size: 100% 100%;
		-webkit-mask-position: left top;
		mask-position: left top;
	`;

	const childStyle = `
		position: absolute;
		left: ${childRelCenterLeft}%;
		top: ${childRelCenterTop}%;
		transform: translate(-50%, -50%);
		width: ${childRelWidth}%;
		height: ${childRelHeight}%;
		opacity: ${typeof layer.opacity === "number" ? layer.opacity : 1};
		mix-blend-mode: ${layer.blendMode ?? "normal"};
		max-width: none;
		max-height: none;
		object-fit: cover;
	`;

	const el = layer.type === "video" ? document.createElement("video") : document.createElement("img");
	el.className = `layer ${layer.type === "video" ? "layer--video" : "layer--image"}`;
	el.style.cssText = childStyle;
	if (layer.type === "video") {
		el.src = imagePath;
		el.autoplay = true;
		el.loop = true;
		el.muted = true;
		el.playsInline = true;
	} else {
		el.src = imagePath;
		el.alt = layer.name;
	}
	wrapper.appendChild(el);
	wrapper.dataset.maskSrc = clipMaskPath;
	return wrapper;
}

function createInteractiveZone(layer, currentSlug) {
	const style = `
		--layer-center-left: ${layer.position.centerLeft}%;
		--layer-center-top: ${layer.position.centerTop}%;
		--layer-width: ${layer.position.width}%;
		--layer-height: ${layer.position.height}%;
		--layer-z: ${layer.zIndex + 1};
	`;

	const isNav = layer.interaction.type === "navigate";

	if (isNav) {
		const a = document.createElement("a");
		a.href = layer.interaction.target;
		a.className = "zone zone--navigate";
		a.dataset.zoneType = "navigate";
		a.style.cssText = style;

		if (layer.interaction.hoverImage) {
			const img = document.createElement("img");
			img.src = layer.interaction.hoverImage;
			img.className = "zone__hover";
			img.alt = "";
			a.appendChild(img);
		}

		a.addEventListener("click", (e) => {
			e.preventDefault();
			const target = layer.interaction.target;
			// Detect story navigation (/story/:slug)
			const storyMatch = target.match(/^\/story\/([^/]+)/);
			if (storyMatch) {
				sceneNavigate("story", {slug: storyMatch[1]});
			} else {
				sceneNavigate("overworld");
			}
		});

		return a;
	}

	const btn = document.createElement("button");
	btn.className = "zone zone--state";
	btn.dataset.zoneType = "state";
	btn.style.cssText = style;
	return btn;
}

function distributeSlottedContent(scene) {
	const outlet = scene.querySelector("[data-scene-slotted]");
	const sceneOutlet = scene.querySelector("[data-scene-slot-outlet]");
	if (!outlet) return;
	Array.from(outlet.children).forEach((child) => {
		const targetName = child.dataset.slot;
		if (!targetName) {
			if (sceneOutlet) sceneOutlet.appendChild(child);
			return;
		}
		const target = scene.querySelector(`[data-slot-outlet="${targetName}"]`);
		if (target) {
			if (child.dataset.interactive === "true") {
				target.style.pointerEvents = "auto";
			}
			target.appendChild(child);
			return;
		}
		if (child.dataset.interactive === "true" && sceneOutlet) {
			sceneOutlet.style.pointerEvents = "auto";
		}
		if (sceneOutlet) sceneOutlet.appendChild(child);
	});
}

/** @param {number} n */
async function waitFrames(n) {
	for (let i = 0; i < n; i++) {
		await new Promise((r) => requestAnimationFrame(r));
	}
}

/**
 * Wait until layer images/videos and CSS mask PNGs are loaded so the CRT “tube on”
 * reveals a fully laid-out scene (router runs transition after mount resolves).
 *
 * @param {HTMLElement} scene
 */
async function waitForNeighborhoodAssets(scene) {
	const imgs = /** @type {HTMLImageElement[]} */ ([...scene.querySelectorAll("img")]);
	const videos = /** @type {HTMLVideoElement[]} */ ([...scene.querySelectorAll("video")]);
	const maskEls = [...scene.querySelectorAll("[data-mask-src]")];
	const maskUrls = [...new Set(maskEls.map((el) => el.dataset.maskSrc).filter(Boolean))];

	const imgTasks = imgs.map((img) => whenImageReady(img));
	const videoTasks = videos.map((v) => whenVideoReady(v));
	const maskTasks = maskUrls.map((url) => preloadImageUrl(url));

	await Promise.all([...imgTasks, ...videoTasks, ...maskTasks]);
}

/** @param {HTMLImageElement} img */
function whenImageReady(img) {
	if (!img.src) return Promise.resolve();
	if (img.complete) {
		return decodeImageSafe(img);
	}
	return new Promise((resolve) => {
		img.addEventListener(
			"load",
			() => {
				void decodeImageSafe(img).finally(() => resolve());
			},
			{once: true},
		);
		img.addEventListener("error", () => resolve(), {once: true});
	});
}

/** @param {HTMLImageElement} img */
async function decodeImageSafe(img) {
	try {
		if (img.naturalWidth > 0 && "decode" in img) {
			await /** @type {HTMLImageElement & {decode(): Promise<void>}} */ (img).decode();
		}
	} catch {
		/* decode can fail for broken images — still resolve */
	}
}

/** @param {HTMLVideoElement} v */
function whenVideoReady(v) {
	if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
	return new Promise((resolve) => {
		v.addEventListener("loadeddata", () => resolve(), {once: true});
		v.addEventListener("error", () => resolve(), {once: true});
	});
}

/** @param {string} url */
function preloadImageUrl(url) {
	return new Promise((resolve) => {
		const im = new Image();
		im.onload = () => resolve();
		im.onerror = () => resolve();
		im.src = url;
	});
}

