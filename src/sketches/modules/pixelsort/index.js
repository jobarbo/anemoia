import {ShaderEffects} from "../../../lib/shaders/shader-effects.js";

const DEFAULT_PIXEL_SORT = {
	enabled: true,
	angle: 0.0,
	threshold: 0.0,
	sortAmount: 0.3,
	sampleCount: 8.0,
	invert: 1.0,
	sortMode: 2.0,
	timeMultiplier: 1.3,
	resolutionScale: 0.25,
};

function readSketchData(container) {
	const raw = container.dataset.sketchData;
	if (!raw) return {imagePath: "", mode: "recopie", pixelSort: {}};
	try {
		const parsed = JSON.parse(raw);
		return {
			imagePath: parsed.imagePath ?? "",
			mode: parsed.mode === "overlay" ? "overlay" : "recopie",
			pixelSort: parsed.pixelSort && typeof parsed.pixelSort === "object" ? parsed.pixelSort : {},
		};
	} catch {
		return {imagePath: "", mode: "recopie", pixelSort: {}};
	}
}

function getContainerSize(container) {
	const rect = container.getBoundingClientRect();
	return {
		width: Math.max(1, Math.round(rect.width || 0)),
		height: Math.max(1, Math.round(rect.height || 0)),
	};
}

function getRenderSize(displayWidth, displayHeight, resolutionScale) {
	const scale = Number.isFinite(resolutionScale) ? Math.max(0.1, Math.min(1, resolutionScale)) : 1;
	return {
		width: Math.max(1, Math.round(displayWidth * scale)),
		height: Math.max(1, Math.round(displayHeight * scale)),
	};
}

export default function (container) {
	const {imagePath = "", mode = "recopie", pixelSort: pixelSortOverrides = {}} = readSketchData(container);
	const pixelSortConfig = {...DEFAULT_PIXEL_SORT, ...pixelSortOverrides};
	const shaders = new ShaderEffects({
		effects: {
			pixelSort: pixelSortConfig,
		},
	});
	let layerImage = null;
	let mainCanvas;
	let shadersReady = false;
	let imageReady = imagePath.length === 0;
	let emittedReady = false;

	return (sketch) => {
		sketch.setup = () => {
			const {width: displayWidth, height: displayHeight} = getContainerSize(container);
			const {width, height} = getRenderSize(displayWidth, displayHeight, pixelSortConfig.resolutionScale);
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
					console.error("[pixelsort] shader load failed", error);
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
						console.error("[pixelsort] image load failed", error);
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
				// Overlay fallback when image is not yet ready: keep a very subtle animated base.
				mainCanvas.background(0, 0, 0, 0);
			}
			shaders.updateTime(0.016);
			shaders.apply();
		};

		sketch.windowResized = () => {
			if (!mainCanvas) return;
			const {width: displayWidth, height: displayHeight} = getContainerSize(container);
			const {width, height} = getRenderSize(displayWidth, displayHeight, pixelSortConfig.resolutionScale);
			mainCanvas.resizeCanvas(width, height);
			sketch.resizeCanvas(width, height);
			shaders.reinitializePipeline();
		};
	};
}
