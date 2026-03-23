import gsap from "gsap";

const DEFAULT_SPEED = 0.1;
const BASE_TRANSLATE_DISTANCE = 50;
const MIN_DEPTH_MULTIPLIER = 0.12;
const MAX_DEPTH_MULTIPLIER = 3;

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

export function initMouseParallax(layers) {
	const handleMouseMove = (e) => {
		const xPercent = (e.clientX / window.innerWidth - 0.5) * 2;
		const yPercent = (e.clientY / window.innerHeight - 0.5) * 2;

		layers.forEach((layer) => {
			const baseSpeed = parseNumericAttr(layer, "data-parallax-speed") ?? DEFAULT_SPEED;
			// Depth ranges 0..1 where 0 = far background and 1 = near foreground.
			const depth = parseNumericAttr(layer, "data-parallax-depth") ?? 0.5;
			const depthMultiplier = getDepthMultiplier(depth);
			const speed = baseSpeed * depthMultiplier;

			gsap.to(layer, {
				"--parallax-x": `${xPercent * speed * BASE_TRANSLATE_DISTANCE}px`,
				"--parallax-y": `${yPercent * speed * BASE_TRANSLATE_DISTANCE}px`,
				duration: getLayerDuration(depth),
				ease: "power2.out",
			});
		});
	};

	document.addEventListener("mousemove", handleMouseMove);

	return () => {
		document.removeEventListener("mousemove", handleMouseMove);
	};
}
