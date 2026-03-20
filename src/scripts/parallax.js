import gsap from "gsap";

const DEFAULT_SPEED = 0.1;
const BASE_TRANSLATE_DISTANCE = 50;

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
			const depthMultiplier = 0.35 + depth * 1.85;
			const speed = baseSpeed * depthMultiplier;

			gsap.to(layer, {
				x: xPercent * speed * BASE_TRANSLATE_DISTANCE,
				y: yPercent * speed * BASE_TRANSLATE_DISTANCE,
				duration: 0.6,
				ease: "power2.out",
			});
		});
	};

	document.addEventListener("mousemove", handleMouseMove);

	return () => {
		document.removeEventListener("mousemove", handleMouseMove);
	};
}
