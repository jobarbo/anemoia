export const DEFAULT_MAX_RENDER_PIXELS = 900 * 900;

function clamp(value, min, max) {
	if (!Number.isFinite(value)) return min;
	return Math.min(max, Math.max(min, value));
}

/**
 * Compute a capped render resolution while preserving viewport aspect ratio.
 * The canvas can then be upscaled in CSS to fill the viewport.
 */
export function getViewportRenderSize(options = {}) {
	const displayWidth = Math.max(1, Math.round(window.innerWidth || 1));
	const displayHeight = Math.max(1, Math.round(window.innerHeight || 1));
	const renderScale = clamp(Number(options.renderScale ?? 1), 0.1, 1);
	const maxRenderPixels = Math.max(0, Math.round(Number(options.maxRenderPixels ?? DEFAULT_MAX_RENDER_PIXELS)));

	let renderWidth = displayWidth * renderScale;
	let renderHeight = displayHeight * renderScale;

	if (maxRenderPixels > 0) {
		const pixelCount = renderWidth * renderHeight;
		if (pixelCount > maxRenderPixels) {
			const factor = Math.sqrt(maxRenderPixels / pixelCount);
			renderWidth *= factor;
			renderHeight *= factor;
		}
	}

	return {
		displayWidth,
		displayHeight,
		renderWidth: Math.max(1, Math.round(renderWidth)),
		renderHeight: Math.max(1, Math.round(renderHeight)),
	};
}

export function fitCanvasToViewport(target, displayWidth, displayHeight) {
	if (typeof target?.style === "function") {
		target.style("width", `${displayWidth}px`);
		target.style("height", `${displayHeight}px`);
		target.style("display", "block");
		return;
	}
	const canvasEl = target?.canvas ?? target?.elt ?? null;
	if (!(canvasEl instanceof HTMLCanvasElement)) return;
	canvasEl.style.width = `${displayWidth}px`;
	canvasEl.style.height = `${displayHeight}px`;
	canvasEl.style.display = "block";
}
