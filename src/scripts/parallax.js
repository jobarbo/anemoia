import gsap from "gsap";

export function initMouseParallax(layers) {
	const handleMouseMove = (e) => {
		const xPercent = (e.clientX / window.innerWidth - 0.5) * 2;
		const yPercent = (e.clientY / window.innerHeight - 0.5) * 2;

		layers.forEach((layer) => {
			const speedAttr = layer.getAttribute("data-parallax-speed");
			const speed = speedAttr ? parseFloat(speedAttr) : 0.1;

			gsap.to(layer, {
				x: xPercent * speed * 50,
				y: yPercent * speed * 50,
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
