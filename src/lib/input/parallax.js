import gsap from "gsap";
import {clamp, evaluateCubicBezier} from "../utils/utils.js";

/** Set `true` to skip mouse, head, and scroll-driven layer offsets (layout / PSD alignment tests). */
export const DEBUG_DISABLE_PARALLAX = false;

const DEFAULT_SPEED = 0.1;

// Head / mouse tracking
const TRACKING_TRANSLATE_DISTANCE = 50;
const TRACKING_MIN_DEPTH_MULTIPLIER = 1.0;
const TRACKING_MAX_DEPTH_MULTIPLIER = 8;

// Vertical scroll parallax
const SCROLL_TRANSLATE_DISTANCE = 50;
const SCROLL_MIN_DEPTH_MULTIPLIER = 16;
const SCROLL_MAX_DEPTH_MULTIPLIER = 1.0;

/**
 * Maps normalised depth [0..1] to a speed multiplier [MIN..MAX].
 * When a depthCurve is provided (cubic-bezier [x1,y1,x2,y2] from parallax-config.json),
 * it replaces the built-in power curve so the distribution can be tuned per scene.
 */
function getDepthMultiplier(depth, depthCurve, minMultiplier, maxMultiplier) {
	const normalizedDepth = clamp(depth, 0, 1);
	const shaped = depthCurve ? evaluateCubicBezier(normalizedDepth, depthCurve) : Math.pow(normalizedDepth, 2.2);
	return minMultiplier + shaped * (maxMultiplier - minMultiplier);
}

function getLayerDuration(depth) {
	const normalizedDepth = clamp(depth, 0, 1);
	return 0.85 - normalizedDepth * 0.3;
}

function parseNumericAttr(element, name) {
	const raw = element.getAttribute(name);
	if (raw === null) return null;
	const value = parseFloat(raw);
	return Number.isFinite(value) ? value : null;
}

function toFiniteNumber(value, fallback = 0) {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : fallback;
	}
	if (typeof value === "string") {
		const parsed = parseFloat(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	return fallback;
}

function toPixelValue(value) {
	return `${toFiniteNumber(value)}px`;
}

function setLayerParallaxValue(layer, name, value) {
	layer.style.setProperty(name, toPixelValue(value));
}

function safeSetParallaxXY(layer, x, y) {
	setLayerParallaxValue(layer, "--parallax-x", x);
	setLayerParallaxValue(layer, "--parallax-y", y);
}

function parallaxYPixels(normalizedY, speed, translateDistance) {
	const ny = clamp(toFiniteNumber(normalizedY, 0), -1, 1);
	return ny * speed * translateDistance;
}

function getAdaptiveScrollNormalizedY(scrollContainer) {
	const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
	if (maxScroll <= 0) return 0;
	const fullRangeNormalizedY = (scrollContainer.scrollTop / maxScroll - 0.5) * 2;
	const scrollableFraction = clamp(maxScroll / Math.max(1, scrollContainer.scrollHeight), 0, 1);
	// Prevent over-amplification on tall/narrow viewports by scaling extremes to visible/scrollable proportion.
	return fullRangeNormalizedY * scrollableFraction;
}

/** Read a JSON curve attribute from the nearest [data-scene-renderer] ancestor. */
function readSceneCurveAttr(layers, attrName) {
	const scene = layers[0]?.closest("[data-scene-renderer]");
	if (!scene) return null;
	const raw = scene.getAttribute(attrName);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) && parsed.length === 4 ? parsed : null;
	} catch {
		return null;
	}
}

/** Depth curve for head/mouse parallax. */
function readSceneDepthCurve(layers) {
	return readSceneCurveAttr(layers, "data-depth-curve");
}

/** Depth curve for scroll parallax — falls back to the head/mouse curve if not set. */
function readSceneScrollDepthCurve(layers) {
	return readSceneCurveAttr(layers, "data-scroll-depth-curve") ?? readSceneDepthCurve(layers);
}

function computeScrollLayerOffsetY(layer, normalizedY, depthCurve) {
	const baseSpeed = parseNumericAttr(layer, "data-parallax-speed") ?? DEFAULT_SPEED;
	const depth = parseNumericAttr(layer, "data-parallax-depth") ?? 0.5;
	const speed = baseSpeed * getDepthMultiplier(depth, depthCurve, SCROLL_MIN_DEPTH_MULTIPLIER, SCROLL_MAX_DEPTH_MULTIPLIER);
	return parallaxYPixels(normalizedY, speed, SCROLL_TRANSLATE_DISTANCE);
}

export function createParallaxUpdater(layers) {
	const depthCurve = readSceneDepthCurve(layers);
	const layerConfigs = Array.from(layers).map((layer) => {
		const baseSpeed = parseNumericAttr(layer, "data-parallax-speed") ?? DEFAULT_SPEED;
		// Depth ranges 0..1 where 0 = far background and 1 = near foreground.
		const depth = parseNumericAttr(layer, "data-parallax-depth") ?? 0.5;
		const speed = baseSpeed * getDepthMultiplier(depth, depthCurve, TRACKING_MIN_DEPTH_MULTIPLIER, TRACKING_MAX_DEPTH_MULTIPLIER);
		return {
			layer,
			depth,
			speed,
			duration: getLayerDuration(depth),
		};
	});

	let normalizedX = 0;
	let normalizedY = 0;
	let rafId = null;
	let destroyed = false;

	const applyFrame = () => {
		rafId = null;
		if (destroyed) return;

		layerConfigs.forEach(({layer, speed, duration}) => {
			const targetX = normalizedX * speed * TRACKING_TRANSLATE_DISTANCE;
			const targetY = parallaxYPixels(normalizedY, speed, TRACKING_TRANSLATE_DISTANCE);

			try {
				gsap.to(layer, {
					"--parallax-x": targetX,
					"--parallax-y": targetY,
					duration,
					ease: "power2.out",
					overwrite: "auto",
					modifiers: {
						"--parallax-x": toPixelValue,
						"--parallax-y": toPixelValue,
					},
				});
			} catch {
				// Fallback to direct CSS vars if GSAP fails mid-frame.
				safeSetParallaxXY(layer, targetX, targetY);
			}
		});
	};

	const update = (xPercent, yPercent) => {
		normalizedX = clamp(toFiniteNumber(xPercent, 0), -1, 1);
		normalizedY = clamp(toFiniteNumber(yPercent, 0), -1, 1);
		if (rafId !== null) return;
		rafId = requestAnimationFrame(applyFrame);
	};

	update.destroy = () => {
		destroyed = true;
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	};

	return update;
}

export function initParallaxFromInput(layers, subscribeInput) {
	const updateParallax = createParallaxUpdater(layers);
	const unsubscribe = subscribeInput(updateParallax);

	return () => {
		if (typeof unsubscribe === "function") {
			unsubscribe();
		}
		if (typeof updateParallax.destroy === "function") {
			updateParallax.destroy();
		}
	};
}

export function initMouseParallax(layers) {
	return initParallaxFromInput(layers, (updateParallax) => {
		const handleMouseMove = (e) => {
			const xPercent = (e.clientX / window.innerWidth - 0.5) * 2;
			const yPercent = (e.clientY / window.innerHeight - 0.5) * 2;
			updateParallax(xPercent, yPercent);
		};

		document.addEventListener("mousemove", handleMouseMove);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
		};
	});
}

/**
 * Vertical scroll parallax for tall scenes (e.g. neighborhood). Uses --parallax-scroll-y so it stacks
 * with mouse/head offsets on --parallax-x / --parallax-y.
 */
export function initScrollParallax(layers, scrollContainer) {
	const depthCurve = readSceneScrollDepthCurve(layers);
	/** Scene root: its border box can grow after assets while the scrollport stays 100vh — observe both. */
	const sceneRoot = layers[0]?.closest("[data-scene-renderer]");
	let rafId = null;
	let destroyed = false;

	const applyScrollOffsets = () => {
		if (destroyed) return;
		rafId = null;
		// Adaptive normalization keeps perceived min/max offsets stable across viewport ratios.
		const scrollNormalizedY = getAdaptiveScrollNormalizedY(scrollContainer);

		layers.forEach((layer) => {
			const offsetY = computeScrollLayerOffsetY(layer, scrollNormalizedY, depthCurve);
			// Avoid gsap.set here: head/mouse parallax uses gsap.to(..., { overwrite: "auto" }) on the same
			// nodes and can stomp co-managed custom props; direct setProperty stacks safely with those tweens.
			setLayerParallaxValue(layer, "--parallax-scroll-y", offsetY);
		});
	};

	const scheduleApplyScrollOffsets = () => {
		if (destroyed || rafId !== null) return;
		rafId = requestAnimationFrame(applyScrollOffsets);
	};

	scrollContainer.addEventListener("scroll", scheduleApplyScrollOffsets, {passive: true});
	window.addEventListener("resize", scheduleApplyScrollOffsets, {passive: true});

	let resizeObserver = null;
	if (typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(scheduleApplyScrollOffsets);
		resizeObserver.observe(scrollContainer);
		if (sceneRoot instanceof Element) {
			resizeObserver.observe(sceneRoot);
		}
	}

	applyScrollOffsets();

	return () => {
		destroyed = true;
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		scrollContainer.removeEventListener("scroll", scheduleApplyScrollOffsets);
		window.removeEventListener("resize", scheduleApplyScrollOffsets);
		resizeObserver?.disconnect();
		layers.forEach((layer) => {
			setLayerParallaxValue(layer, "--parallax-scroll-y", 0);
		});
	};
}
