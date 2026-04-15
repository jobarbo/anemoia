/**
 * Story scene — wraps story.js p5 sketch for the SPA scene router.
 */

/** Use global shader defaults. */
export const SCENE_EFFECTS = {};

import p5 from "p5";
import {installPointerRemap} from "../lib/input/input-remap.js";
import {getSketchLoader} from "../sketches/index.js";

export async function mount(container, _params, data) {
	const sketchMod = await getSketchLoader("story");
	if (!sketchMod) throw new Error("Missing story sketch loader");
	const createSketch = sketchMod.default;

	container.dataset.sketchData = JSON.stringify(data);

	const sketchFn = createSketch(container);
	const instance = new p5(sketchFn, container);

	const cleanupPointerRemap = installPointerRemap(container);

	return {
		unmount() {
			cleanupPointerRemap();
			delete container.dataset.sketchData;
			instance.remove();
		},
	};
}
