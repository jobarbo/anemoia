/**
 * Registry of sketch names → dynamic import.
 * Add new sketches here; then use <SketchCanvas sketch="your-name" />.
 */
const sketchLoaders = {
	splash: () => import("./splash.js"),
	snow: () => import("./snow.js"),
	rain: () => import("./rain.js"),
	overworld: () => import("./overworld.js"),
	story: () => import("./story.js"),
};

export function getSketchLoader(name) {
	return name in sketchLoaders ? sketchLoaders[name]() : null;
}

export function getKnownSketchNames() {
	return Object.keys(sketchLoaders);
}
