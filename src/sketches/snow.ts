/**
 * p5.js sketch: full-viewport snow overlay.
 * Receives the container element; canvas is sized to window.
 */
import type p5 from "p5";

interface SnowParticle {
	x: number;
	y: number;
	z: number;
}

const snow = (container: HTMLElement) => {
	return (sketch: p5) => {
		const particles: SnowParticle[] = [];

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
			sketch.fill(255, 255, 255, 150);

			for (const particle of particles) {
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
};

export default snow;
