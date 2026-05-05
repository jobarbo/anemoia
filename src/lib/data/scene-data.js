/**
 * Scene data access for the SPA router.
 *
 * At build time, `index.astro` embeds all content (neighborhoods, stories, manifest paths)
 * into a `<script type="application/json" id="game-data">` element.
 * This module reads that JSON and provides typed accessors to the rest of the app.
 *
 * Manifests (scene layer data) are loaded lazily via fetch() from public/.
 */

/** @type {{ neighborhoods: NeighborhoodData[], stories: Record<string, StoryData> } | null} */
let _cache = null;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   slug: string,
 *   description?: string,
 *   viewEnabled?: boolean,
 *   scenePath: string,
 *   audioSrc?: string,
 *   stories: string[],
 *   position: { x: number, y: number }
 * }} NeighborhoodData
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   neighborhood: string,
 *   returnTo?: 'desktop' | 'neighborhood',
 *   audioSrc?: string,
 *   order: number,
 *   blocks: Array<{ type: 'h1'|'h2'|'p', text: string }>
 * }} StoryData
 */

function loadCache() {
	if (_cache) return _cache;
	const el = document.getElementById("game-data");
	if (!el) throw new Error("[scene-data] #game-data element not found in DOM");
	_cache = JSON.parse(el.textContent);
	return _cache;
}

/** @returns {NeighborhoodData[]} */
export function getNeighborhoods() {
	return loadCache().neighborhoods;
}

/**
 * @param {string} slug
 * @returns {NeighborhoodData | undefined}
 */
export function getNeighborhood(slug) {
	return loadCache().neighborhoods.find((n) => n.slug === slug);
}

/**
 * @param {string} slug
 * @returns {StoryData | undefined}
 */
export function getStory(slug) {
	return loadCache().stories[slug];
}

/**
 * @param {string} neighborhood
 * @returns {StoryData[]}
 */
export function getStoriesByNeighborhood(neighborhood) {
	const stories = loadCache().stories;
	return Object.values(stories)
		.filter((s) => s.neighborhood === neighborhood)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Fetch and parse the scene manifest for a neighborhood.
 * Manifests live in public/assets/scenes/<slug>/manifest.json
 * and are available at /assets/scenes/<slug>/manifest.json.
 *
 * Also applies the normalizeManifestPositions correction (large px values → %)
 * that was previously done server-side in load-manifest.js.
 *
 * @param {string} scenePath - e.g. "/assets/scenes/saint-roch/manifest.json"
 * @param {string} slug - neighborhood slug
 * @returns {Promise<object>}
 */
export async function fetchNeighborhoodManifest(scenePath, slug) {
	const [manifestRes, sceneConfigRes] = await Promise.all([fetch(scenePath), fetch(scenePath.replace("manifest.json", "scene-config.json"))]);

	if (!manifestRes.ok) throw new Error(`[scene-data] Failed to fetch manifest: ${scenePath}`);

	const manifest = await manifestRes.json();
	normalizeManifestPositions(manifest);

	if (sceneConfigRes.ok) {
		applySceneConfig(manifest, await sceneConfigRes.json());
	}

	return manifest;
}

/** Mirrors load-manifest.js normalizeManifestPositions (client-side copy) */
const MAX_REASONABLE_PERCENT_DIM = 500;
function normalizeManifestPositions(manifest) {
	const cw = manifest.canvas?.width;
	const ch = manifest.canvas?.height;
	if (!cw || !ch || !Array.isArray(manifest.layers)) return;
	for (const layer of manifest.layers) {
		const p = layer.position;
		if (!p || typeof p.width !== "number" || typeof p.height !== "number") continue;
		if (p.width > MAX_REASONABLE_PERCENT_DIM) p.width = (p.width / cw) * 100;
		if (p.height > MAX_REASONABLE_PERCENT_DIM) p.height = (p.height / ch) * 100;
	}
}

/**
 * @param {Record<string, any>} manifest
 * @param {Record<string, any>} config
 */
function applySceneConfig(manifest, config) {
	const parallaxConfig = config.parallaxConfig ?? {};

	if (Array.isArray(parallaxConfig.depthCurve) && parallaxConfig.depthCurve.length === 4) {
		manifest.depthCurve = parallaxConfig.depthCurve;
	}
	if (Array.isArray(parallaxConfig.scrollDepthCurve) && parallaxConfig.scrollDepthCurve.length === 4) {
		manifest.scrollDepthCurve = parallaxConfig.scrollDepthCurve;
	}
	if (config.layers && typeof config.layers === "object") {
		for (const name of Object.keys(config.layers)) {
			const layer = manifest.layers?.find((l) => l.name === name);
			if (layer) Object.assign(layer, config.layers[name]);
		}
	}
	if (config.layerEffects && typeof config.layerEffects === "object") {
		manifest.layerEffects = {};
		for (const [layerName, entries] of Object.entries(config.layerEffects)) {
			if (!Array.isArray(entries)) continue;
			manifest.layerEffects[layerName] = entries.filter((entry) => entry && typeof entry === "object" && typeof entry.sketch === "string").map((entry) => ({...entry}));
		}
	}
	if (config.sceneEffects && typeof config.sceneEffects === "object") {
		manifest.sceneEffects = {};
		for (const [effectName, effectPatch] of Object.entries(config.sceneEffects)) {
			if (!effectPatch || typeof effectPatch !== "object") continue;
			manifest.sceneEffects[effectName] = {...effectPatch};
		}
	}
	if (Array.isArray(config.sceneSketches)) {
		manifest.sceneSketches = config.sceneSketches.filter((entry) => entry && typeof entry === "object" && typeof entry.sketch === "string").map((entry) => ({...entry}));
	}
}
