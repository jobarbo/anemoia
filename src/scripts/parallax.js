import gsap from "gsap";

const DEFAULT_SPEED = 0.1;
const BASE_TRANSLATE_DISTANCE = 50;
const MIN_DEPTH_MULTIPLIER = 1.12;
const MAX_DEPTH_MULTIPLIER = 8;

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

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
			const targetY = normalizedY * speed * BASE_TRANSLATE_DISTANCE;

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
