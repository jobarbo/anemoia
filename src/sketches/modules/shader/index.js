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

const DEFAULT_EFFECTS = {
	pixelSort: {
		enabled: true,
		angle: 0.0,
		threshold: 0.0,
		sortAmount: 0.3,
		sampleCount: 8.0,
		invert: 1.0,
		sortMode: 2.0,
		timeMultiplier: 1.3,
		resolutionScale: 0.25,
	},
};

function readSketchData(container) {
	const raw = container.dataset.sketchData;
	if (!raw) return {imagePath: "", mode: "recopie", effects: {...DEFAULT_EFFECTS}};
	try {
		const parsed = JSON.parse(raw);
		const parsedEffects = resolveEffects(parsed);
		return {
			imagePath: parsed.imagePath ?? "",
			mode: parsed.mode === "overlay" ? "overlay" : "recopie",
			effects: parsedEffects,
		};
	} catch {
		return {imagePath: "", mode: "recopie", effects: {...DEFAULT_EFFECTS}};
	}
}

function resolveEffects(parsed) {
	if (parsed.effects && typeof parsed.effects === "object" && !Array.isArray(parsed.effects)) {
		return parsed.effects;
	}
	// Backward compatibility: old config used "pixelSort" directly.
	if (parsed.pixelSort && typeof parsed.pixelSort === "object") {
		return {
			pixelSort: {
				...DEFAULT_EFFECTS.pixelSort,
				...parsed.pixelSort,
				enabled: parsed.pixelSort.enabled ?? true,
			},
		};
	}
	return {...DEFAULT_EFFECTS};
}

function getContainerSize(container) {
	const rect = container.getBoundingClientRect();
	return {
		width: Math.max(1, Math.round(rect.width || 0)),
		height: Math.max(1, Math.round(rect.height || 0)),
	};
}

function getRenderSize(displayWidth, displayHeight, effects) {
	const scales = Object.values(effects)
		.map((effect) => Number(effect?.resolutionScale))
		.filter((value) => Number.isFinite(value));
	const baseScale = scales.length > 0 ? Math.min(...scales) : 1;
	const scale = Math.max(0.1, Math.min(1, baseScale));
	return {
		width: Math.max(1, Math.round(displayWidth * scale)),
		height: Math.max(1, Math.round(displayHeight * scale)),
	};
}

export default function (container) {
	const {imagePath = "", mode = "recopie", effects = {...DEFAULT_EFFECTS}} = readSketchData(container);
	const shaders = new ShaderEffects({effects});
	let layerImage = null;
	let mainCanvas;
	let shadersReady = false;
	let imageReady = imagePath.length === 0;
	let emittedReady = false;

	const sketchFn = (sketch) => {
		sketch.setup = () => {
			const {width: displayWidth, height: displayHeight} = getContainerSize(container);
			const {width, height} = getRenderSize(displayWidth, displayHeight, effects);
			mainCanvas = sketch.createGraphics(width, height, sketch.WEBGL);
			const canvas = sketch.createCanvas(width, height, sketch.WEBGL);
			canvas.parent(container);
			canvas.style("width", "100%");
			canvas.style("height", "100%");
			canvas.style("display", "block");
			canvas.style("pointer-events", "none");
			canvas.style("image-rendering", "pixelated");

			void shaders
				.loadShaders(sketch)
				.then(() => {
					shaders.setup(width, height, mainCanvas, sketch);
					shadersReady = true;
				})
				.catch((error) => {
					console.error("[shader] shader load failed", error);
					shadersReady = false;
				});

			if (imagePath) {
				sketch.loadImage(
					imagePath,
					(img) => {
						layerImage = img;
						imageReady = true;
					},
					(error) => {
						layerImage = null;
						console.error("[shader] image load failed", error);
					},
				);
			}
		};

		sketch.draw = () => {
			if (!mainCanvas || !shadersReady) return;
			if (!emittedReady && imageReady) {
				emittedReady = true;
				container.dispatchEvent(new CustomEvent("layer-sketch-ready"));
			}
			mainCanvas.clear();
			if (imageReady && layerImage && layerImage.width > 0 && layerImage.height > 0) {
				mainCanvas.image(layerImage, -mainCanvas.width / 2, -mainCanvas.height / 2, mainCanvas.width, mainCanvas.height);
			} else if (mode === "overlay") {
				mainCanvas.background(0, 0, 0, 0);
			}
			shaders.updateTime(0.016);
			shaders.apply();
		};

		sketch.windowResized = () => {
			if (!mainCanvas) return;
			const {width: displayWidth, height: displayHeight} = getContainerSize(container);
			const {width, height} = getRenderSize(displayWidth, displayHeight, effects);
			mainCanvas.resizeCanvas(width, height);
			sketch.resizeCanvas(width, height);
			shaders.reinitializePipeline();
		};
	};

	const destroy = () => {
		console.log("[shader sketch] destroy — calling shaders.destroy() + loseContext");
		shaders.destroy();
		loseP5Graphics(mainCanvas);
	};

	return {sketch: sketchFn, destroy};
}
