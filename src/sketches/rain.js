/**
 * p5.js sketch: full-viewport rain overlay.
 * Receives the container element; canvas is sized to window.
 */
export default function (container) {
	return (sketch) => {
		const particles = [];

		sketch.setup = () => {
			const canvas = sketch.createCanvas(window.innerWidth, window.innerHeight, sketch.WEBGL);
			canvas.parent(container);

			for (let i = 0; i < 200; i++) {
				particles.push({
					x: sketch.random(-sketch.width / 2, sketch.width / 2),
					y: sketch.random(-sketch.height / 2, sketch.height / 2),
					z: sketch.random(1, 5),
				});
			}
		};

		sketch.draw = () => {
			sketch.clear();
			sketch.noStroke();
			sketch.fill(0, 0, 255, 150);

			for (const particle of particles) {
				sketch.circle(particle.x, particle.y, particle.z);
			}
		};

		sketch.windowResized = () => {
			sketch.resizeCanvas(window.innerWidth, window.innerHeight);
		};
	};
}
