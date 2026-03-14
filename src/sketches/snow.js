/**
 * p5.js sketch: full-viewport snow overlay.
 * Receives the container element; canvas is sized to window.
 * @param {HTMLElement} container
 * @returns {(sketch: import("p5")) => void} p5 sketch callback
 */
export default function (container) {
	return (sketch) => {
		let snow = [];

		sketch.setup = () => {
			const canvas = sketch.createCanvas(window.innerWidth, window.innerHeight, sketch.WEBGL);
			canvas.parent(container);

			for (let i = 0; i < 200; i++) {
				snow.push({
					x: sketch.random(-sketch.width / 2, sketch.width / 2),
					y: sketch.random(-sketch.height / 2, sketch.height / 2),
					z: sketch.random(1, 5),
				});
			}
		};

		sketch.draw = () => {
			sketch.clear();
			sketch.noStroke();
			sketch.fill(255, 255, 255, 150);

			for (let particle of snow) {
				sketch.circle(particle.x, particle.y, particle.z);

				particle.y += particle.z * 0.5;
				particle.x += sketch.sin(sketch.frameCount * 0.01 + particle.y) * 0.5;

				if (particle.y > sketch.height / 2) {
					particle.y = -sketch.height / 2;
					particle.x = sketch.random(-sketch.width / 2, sketch.width / 2);
				}
			}
		};

		sketch.windowResized = () => {
			sketch.resizeCanvas(window.innerWidth, window.innerHeight);
		};
	};
}
