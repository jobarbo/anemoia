/**
 * Desktop scene — wraps desktop.js p5 sketch for the SPA scene router.
 */

/** Use global shader defaults. */
export const SCENE_EFFECTS = {};

import p5 from "p5";
import {getSketchLoader} from "../sketches/index.js";

export async function mount(container) {
	const sketchMod = await getSketchLoader("desktop");
	if (!sketchMod) throw new Error("Missing desktop sketch loader");
	const createSketch = sketchMod.default;

	const sketchFn = createSketch(container);
	const instance = new p5(sketchFn, container);

	return {
		unmount() {
			instance.remove();
		},
	};
}
