/**
 * Registry of reusable sketch modules.
 */
const moduleLoaders = {
	snow: () => import("./snow/index.js"),
};

export function getModuleLoader(name) {
	return name in moduleLoaders ? moduleLoaders[name]() : null;
}

export function getKnownModuleNames() {
	return Object.keys(moduleLoaders);
}
