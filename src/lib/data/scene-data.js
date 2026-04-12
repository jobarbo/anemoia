/**
 * Client-side helpers for neighborhood scene assets.
 *
 * The neighborhood route mounts a DOM scene and fetches its layer manifest
 * lazily from public assets.
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   slug: string,
 *   description?: string,
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
 *   audioSrc?: string,
 *   order: number,
 *   blocks: Array<{ type: 'h1'|'h2'|'p', text: string }>
 * }} StoryData
 */

/**
 * Fetch and parse the scene manifest for a neighborhood.
 * Manifests live in public/assets/scenes/<slug>/manifest.json
 * and are available at /assets/scenes/<slug>/manifest.json.
 *
 * Also applies the normalizeManifestPositions correction (large px values → %)
 * that was previously done server-side in load-manifest.js.
 *
 * @param {string} scenePath - e.g. "/assets/scenes/saint-roch/manifest.json"
 * @param {string} slug - neighborhood slug (used to fetch parallax-config.json)
 * @returns {Promise<object>}
 */
export async function fetchNeighborhoodManifest(scenePath, slug) {
	const [manifestRes, configRes] = await Promise.all([fetch(scenePath), fetch(scenePath.replace("manifest.json", "parallax-config.json"))]);

	if (!manifestRes.ok) throw new Error(`[scene-data] Failed to fetch manifest: ${scenePath}`);

	const manifest = await manifestRes.json();
	normalizeManifestPositions(manifest);

	if (configRes.ok) {
		const config = await configRes.json();
		if (Array.isArray(config.depthCurve) && config.depthCurve.length === 4) {
			manifest.depthCurve = config.depthCurve;
		}
		if (Array.isArray(config.scrollDepthCurve) && config.scrollDepthCurve.length === 4) {
			manifest.scrollDepthCurve = config.scrollDepthCurve;
		}
		if (config.layers && typeof config.layers === "object") {
			for (const name of Object.keys(config.layers)) {
				const layer = manifest.layers?.find((l) => l.name === name);
				if (layer) Object.assign(layer, config.layers[name]);
			}
		}
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
