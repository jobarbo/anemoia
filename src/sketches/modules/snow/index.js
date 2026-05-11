/**
 * p5.js sketch: full-viewport snow overlay with optional post-process (grain via ShaderEffects).
 * Pattern: offscreen WEBGL buffer (mainCanvas) → ShaderPipeline → visible WEBGL canvas.
 */
import {ShaderEffects} from "../../../lib/shaders/shader-effects.js";

function loseP5Graphics(graphics) {
	if (!graphics) return;
	try {
		const gl = graphics.drawingContext;
		if (gl) {
			const ext = gl.getExtension("WEBGL_lose_context");
			if (ext) ext.loseContext();
		}
	} catch {
		// ignore
	}
}

export default function (container) {
	const shaders = new ShaderEffects({
		effects: {
			//grain: {enabled: true, amount: 0.06},
		},
	});
	const particles = [];
	let mainCanvas;

	const sketchFn = (sketch) => {
		sketch.setup = async () => {
			await shaders.loadShaders(sketch);

			const w = window.innerWidth;
			const h = window.innerHeight;

			mainCanvas = sketch.createGraphics(w, h, sketch.WEBGL);
			const canvas = sketch.createCanvas(w, h, sketch.WEBGL);
			canvas.parent(container);

			shaders.setup(w, h, mainCanvas, sketch);

			particles.length = 0;
			for (let i = 0; i < 1200; i++) {
				particles.push({
					x: sketch.random(-w / 2, w / 2),
					y: sketch.random(-h / 2, h / 2),
					z: sketch.random(1, 5),
				});
			}
		};

		sketch.draw = () => {
			const halfW = mainCanvas.width / 2;
			const halfH = mainCanvas.height / 2;

			mainCanvas.clear();
			mainCanvas.noStroke();
			mainCanvas.fill(255, 255, 255, 150);

			for (const particle of particles) {
				mainCanvas.circle(particle.x, particle.y, particle.z);

				particle.y += particle.z * 0.5;
				particle.x += sketch.sin(sketch.frameCount * 0.01 + particle.y) * 0.5;

				if (particle.y > halfH) {
					particle.y = -halfH;
					particle.x = sketch.random(-halfW, halfW);
				}
			}

			shaders.updateTime(0.016);
			shaders.apply();
		};

		sketch.windowResized = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			mainCanvas.resizeCanvas(w, h);
			sketch.resizeCanvas(w, h);
			shaders.reinitializePipeline();
		};
	};

	const destroy = () => {
		console.log("[snow sketch] destroy — calling shaders.destroy() + loseContext");
		shaders.destroy();
		loseP5Graphics(mainCanvas);
	};

	return {sketch: sketchFn, destroy};
}
