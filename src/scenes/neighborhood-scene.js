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
import p5 from "p5";
import {fetchNeighborhoodManifest} from "../lib/scene-data.js";
import {sceneNavigate} from "../lib/scene-nav.js";
import {initMouseParallax, initScrollParallax} from "../scripts/parallax.js";
import {initHeadTrackingParallax} from "../scripts/head-tracking.js";

export async function mount(container, params, data) {
	const {slug} = params;
	const neighborhood = data; // NeighborhoodData

	// Fetch manifest (includes parallax-config merge)
	const manifest = await fetchNeighborhoodManifest(neighborhood.scenePath, slug);

	// ── Build DOM structure ─────────────────────────────────────────────────

	// Outer container — mirrors .neighborhood-container from the old page
	container.style.cssText = "height:100vh;background:#000;overflow-y:auto;overflow-x:visible;position:relative;";

	// Back button (above shader overlay)
	const backWrapper = createBackButton(slug);
	container.appendChild(backWrapper);

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

	const snowContainer = document.createElement("div");
	snowContainer.className = "sketch-canvas";
	snowContainer.dataset.sketchContainer = "";
	snowContainer.dataset.sketch = "snow";
	snowContainer.dataset.slot = "foreground";
	slotted.appendChild(snowContainer);
	scene.appendChild(slotted);

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

	container.appendChild(scene);

	// ── Distribute slotted content into layer outlets ────────────────────────
	distributeSlottedContent(scene);

	// ── Mount snow p5 sketch ─────────────────────────────────────────────────
	let snowInstance = null;
	const snowEl = scene.querySelector("[data-sketch-container]");
	if (snowEl) {
		const snowMod = await import("../sketches/snow.js");
		const createSketch = snowMod.default;
		snowInstance = new p5(createSketch(snowEl), snowEl);
	}

	// ── Parallax ──────────────────────────────────────────────────────────────
	const layers = scene.querySelectorAll(".scene__layer-container");

	// Scroll to bottom (PSD bottom alignment)
	requestAnimationFrame(() => {
		if (container.scrollHeight > container.clientHeight) {
			container.scrollTop = container.scrollHeight;
		}
	});

	let cleanupParallax = () => {};
	const scrollCleanup = initScrollParallax(layers, container);

	initHeadTrackingParallax(layers, {
		allowDeviceOrientationFallback: true,
		allowMouseFallback: true,
		scrollContainer: container,
	})
		.then((cleanup) => {
			cleanupParallax = () => {
				cleanup?.();
				scrollCleanup?.();
			};
		})
		.catch(() => {
			const mouseCleanup = initMouseParallax(layers);
			cleanupParallax = () => {
				mouseCleanup?.();
				scrollCleanup?.();
			};
		});

	// ── Audio ──────────────────────────────────────────────────────────────────
	handleAudio(neighborhood.audioSrc ?? null);

	return {
		unmount() {
			cleanupParallax();
			snowInstance?.remove();
			handleAudio(null);
		},
	};
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function createBackButton(slug) {
	const wrapper = document.createElement("div");
	wrapper.dataset.html2canvasIgnore = "true";
	Object.assign(wrapper.style, {
		position: "fixed",
		top: "0",
		left: "0",
		zIndex: "900002",
		pointerEvents: "auto",
	});

	const link = document.createElement("a");
	link.href = "/overworld";
	link.className = "back-btn";
	link.textContent = "← Retour à la carte";
	Object.assign(link.style, {
		display: "inline-block",
		padding: "0.6rem 1.2rem",
		color: "#8ace8a",
		fontFamily: "monospace",
		fontSize: "0.85rem",
		textDecoration: "none",
		background: "rgba(0,0,0,0.5)",
		backdropFilter: "blur(4px)",
	});

	link.addEventListener("click", (e) => {
		e.preventDefault();
		sceneNavigate("overworld");
	});

	wrapper.appendChild(link);
	return wrapper;
}

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
	if (!outlet) return;
	Array.from(outlet.children).forEach((child) => {
		const targetName = child.dataset.slot;
		if (!targetName) return;
		const target = scene.querySelector(`[data-slot-outlet="${targetName}"]`);
		if (target) target.appendChild(child);
	});
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

function handleAudio(src) {
	const audio = /** @type {HTMLAudioElement|null} */ (document.getElementById("global-audio"));
	if (!audio) return;
	if (!src) {
		audio.pause();
		audio.src = "";
		return;
	}
	if (audio.src !== new URL(src, location.href).href) {
		audio.src = src;
	}
	audio.loop = true;
	audio.play().catch(() => {});
}
