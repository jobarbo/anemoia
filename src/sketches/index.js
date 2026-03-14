/**
 * Registry of sketch names → dynamic import.
 * Add new sketches here; then use <SketchCanvas sketch="your-name" />.
 */
const sketchLoaders = {
	snow: () => import("./snow.js"),
	rain: () => import("./rain.js"),
};

export function getSketchLoader(name) {
	return name in sketchLoaders ? sketchLoaders[name]() : null;
}

export function getKnownSketchNames() {
	return Object.keys(sketchLoaders);
}
