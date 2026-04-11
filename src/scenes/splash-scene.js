/**
 * Splash scene — wraps the existing splash.js p5 sketch for the SPA scene router.
 */

/** Use global shader defaults — splash.js manages its own internal ShaderEffects pipeline. */
export const SCENE_EFFECTS = {};

import p5 from "p5";
import {sceneNavigate} from "../lib/router/scene-nav.js";

export async function mount(container) {
	const sketchMod = await import("../sketches/splash.js");
	const createSketch = sketchMod.default;

	const sketchFn = createSketch(container);
	const instance = new p5(sketchFn, container);

	// splash.js dispatches "splash:complete" when the boot sequence finishes.
	// Use scene-nav (lazy) to avoid circular import with scene-router.
	const onComplete = () => {
		sceneNavigate("overworld");
	};
	document.addEventListener("splash:complete", onComplete, {once: true});

	return {
		unmount() {
			document.removeEventListener("splash:complete", onComplete);
			instance.remove();
		},
	};
}
