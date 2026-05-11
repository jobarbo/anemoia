/**
 * Story scene — wraps story.js p5 sketch for the SPA scene router.
 */

/** Use global shader defaults. */
export const SCENE_EFFECTS = {};

import p5 from "p5";
import {getNeighborhood, getStoriesByNeighborhood} from "../lib/data/scene-data.js";
import {installPointerRemap} from "../lib/input/input-remap.js";
import {getSketchLoader} from "../sketches/index.js";

export async function mount(container, _params, data) {
	const sketchMod = await getSketchLoader("story");
	if (!sketchMod) throw new Error("Chargeur de sketch narratif manquant");
	const createSketch = sketchMod.default;

	const hoodSlug = String(data.neighborhood ?? "").trim();
	const hood = hoodSlug ? getNeighborhood(hoodSlug) : undefined;
	const navStories = hoodSlug ? getStoriesByNeighborhood(hoodSlug).map((s) => ({slug: s.id, title: s.title})) : [];

	const payload = {
		...data,
		neighborhoodName: hood?.name ?? "",
		navStories,
		/** Quartier réel dans game-data (sinon pas de bouton « Ce quartier » dans la sidebar) */
		neighborhoodLinked: Boolean(hood),
	};

	container.dataset.sketchData = JSON.stringify(payload);

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
