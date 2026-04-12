import {GlobalShaderOverlay} from "./global-shader-overlay.js";

/**
 * @param {string | HTMLElement | null} target
 * @returns {(() => void) | undefined}
 */
export function mountDomOverlay(target) {
	const container = typeof target === "string" ? document.querySelector(target) : target;
	if (!(container instanceof HTMLElement)) return undefined;

	const overlay = new GlobalShaderOverlay();
	overlay.mount(container);

	let destroyed = false;
	const cleanup = () => {
		if (destroyed) return;
		destroyed = true;
		overlay.destroy();
	};

	window.addEventListener("pagehide", cleanup, {once: true});
	return cleanup;
}