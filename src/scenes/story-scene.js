/**
 * Story scene — wraps story.js p5 sketch for the SPA scene router.
 */
import p5 from "p5";

export async function mount(container, _params, data) {
	const sketchMod = await import("../sketches/story.js");
	const createSketch = sketchMod.default;

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
