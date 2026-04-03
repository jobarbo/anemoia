import gsap from "gsap";
import {clamp} from "../lib/utils.js";

/** Set `true` to skip mouse, head, and scroll-driven layer offsets (layout / PSD alignment tests). */
export const DEBUG_DISABLE_PARALLAX = true;

const DEFAULT_SPEED = 0.1;
const BASE_TRANSLATE_DISTANCE = 50;
const MIN_DEPTH_MULTIPLIER = 1.12;
const MAX_DEPTH_MULTIPLIER = 8;

function getDepthMultiplier(depth) {
	const normalizedDepth = clamp(depth, 0, 1);
	// Compress distant layers and expand foreground separation for a more natural parallax falloff.
	return MIN_DEPTH_MULTIPLIER + Math.pow(normalizedDepth, 2.2) * (MAX_DEPTH_MULTIPLIER - MIN_DEPTH_MULTIPLIER);
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

function parallaxYPixels(normalizedY, speed) {
	const ny = clamp(toFiniteNumber(normalizedY, 0), -1, 1);
	return ny * speed * BASE_TRANSLATE_DISTANCE;
}

/** Same vertical offset scale as mouse/head tracking Y (per layer speed and depth). */
function computeLayerParallaxOffsetY(layer, normalizedY) {
	const baseSpeed = parseNumericAttr(layer, "data-parallax-speed") ?? DEFAULT_SPEED;
	const depth = parseNumericAttr(layer, "data-parallax-depth") ?? 0.5;
	const speed = baseSpeed * getDepthMultiplier(depth);
	return parallaxYPixels(normalizedY, speed);
}

export function createParallaxUpdater(layers) {
	return (xPercent, yPercent) => {
		const normalizedX = clamp(toFiniteNumber(xPercent, 0), -1, 1);
		const normalizedY = clamp(toFiniteNumber(yPercent, 0), -1, 1);

		layers.forEach((layer) => {
			const baseSpeed = parseNumericAttr(layer, "data-parallax-speed") ?? DEFAULT_SPEED;
			// Depth ranges 0..1 where 0 = far background and 1 = near foreground.
			const depth = parseNumericAttr(layer, "data-parallax-depth") ?? 0.5;
			const depthMultiplier = getDepthMultiplier(depth);
			const speed = baseSpeed * depthMultiplier;
			const targetX = normalizedX * speed * BASE_TRANSLATE_DISTANCE;
			const targetY = parallaxYPixels(normalizedY, speed);

			gsap.to(layer, {
				"--parallax-x": targetX,
				"--parallax-y": targetY,
				duration: getLayerDuration(depth),
				ease: "power2.out",
				overwrite: "auto",
				modifiers: {
					"--parallax-x": toPixelValue,
					"--parallax-y": toPixelValue,
				},
			});
		});
	};
}

export function initParallaxFromInput(layers, subscribeInput) {
	const updateParallax = createParallaxUpdater(layers);
	const unsubscribe = subscribeInput(updateParallax);

	return () => {
		if (typeof unsubscribe === "function") {
			unsubscribe();
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
	const applyScrollOffsets = () => {
		const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
		// Map scroll range to [-1, 1] like vertical head/mouse input so layer motion matches tracking intensity.
		const scrollNormalizedY = maxScroll <= 0 ? 0 : (scrollContainer.scrollTop / maxScroll - 0.5) * 2;

		layers.forEach((layer) => {
			const offsetY = computeLayerParallaxOffsetY(layer, scrollNormalizedY);
			gsap.set(layer, {"--parallax-scroll-y": `${offsetY}px`});
		});
	};

	scrollContainer.addEventListener("scroll", applyScrollOffsets, {passive: true});
	window.addEventListener("resize", applyScrollOffsets, {passive: true});

	let resizeObserver = null;
	if (typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(applyScrollOffsets);
		resizeObserver.observe(scrollContainer);
	}

	applyScrollOffsets();

	return () => {
		scrollContainer.removeEventListener("scroll", applyScrollOffsets);
		window.removeEventListener("resize", applyScrollOffsets);
		resizeObserver?.disconnect();
		layers.forEach((layer) => {
			gsap.set(layer, {"--parallax-scroll-y": "0px"});
		});
	};
}
