/**
 * Registry of sketch names → dynamic import.
 * Add new sketches here; then use <SketchCanvas sketch="your-name" />.
 */
const sketchLoaders = {
	splash: () => import("./splash/index.js"),
	snow: () => import("./modules/snow/index.js"),
	shader: () => import("./modules/shader/index.js"),
	pixelsort: () => import("./modules/pixelsort/index.js"),
	desktop: () => import("./desktop/index.js"),
	overworld: () => import("./overworld/index.js"),
	neighborhood: () => import("./neighborhood/index.js"),
	story: () => import("./story/index.js"),
};

export function getSketchLoader(name) {
	return name in sketchLoaders ? sketchLoaders[name]() : null;
}

export function getKnownSketchNames() {
	return Object.keys(sketchLoaders);
}
