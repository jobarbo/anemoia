/**
 * Registry of sketch names → dynamic import.
 * Add new sketches here; then use <SketchCanvas sketch="your-name" />.
 */
const sketchLoaders = {
	snow: () => import("./snow.js"),
};

/** @param {string} name @returns {Promise<{ default: (container: HTMLElement) => (sketch: import("p5")) => void }> | null} */
export function getSketchLoader(name) {
	return name in sketchLoaders ? sketchLoaders[name]() : null;
}

export function getKnownSketchNames() {
	return Object.keys(sketchLoaders);
}
