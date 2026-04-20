/**
 * Overworld scene — wraps overworld.js p5 sketch for the SPA scene router.
 */

/** Use global shader defaults. */
export const SCENE_EFFECTS = {};

import p5 from "p5";
import {getSketchLoader} from "../sketches/index.js";

export async function mount(container, _params, data) {
	const sketchMod = await getSketchLoader("overworld");
	if (!sketchMod) throw new Error("Chargeur de sketch carte manquant");
	const createSketch = sketchMod.default;

	// Inject data the same way SketchCanvas.astro does: via data-sketch-data attribute
	container.dataset.sketchData = JSON.stringify(data);

	const sketchFn = createSketch(container);
	const instance = new p5(sketchFn, container);

	return {
		unmount() {
			delete container.dataset.sketchData;
			instance.remove();
		},
	};
}
