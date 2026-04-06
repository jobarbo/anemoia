import fs from "node:fs";
import path from "node:path";

/** Percents above this are treated as mistaken pixel values (e.g. 1238px written as width). */
const MAX_REASONABLE_PERCENT_DIM = 500;

/**
 * position.width / height are always CSS % of the scene. Fix PSD exports that
 * drop raw pixel widths into the manifest (e.g. skybox width 1238 → should be ~64.5%).
 */
function normalizeManifestPositions(manifest) {
	const cw = manifest.canvas?.width;
	const ch = manifest.canvas?.height;
	if (!cw || !ch || !Array.isArray(manifest.layers)) return manifest;

	for (const layer of manifest.layers) {
		const p = layer.position;
		if (!p || typeof p.width !== "number" || typeof p.height !== "number") continue;

		if (p.width > MAX_REASONABLE_PERCENT_DIM) {
			p.width = (p.width / cw) * 100;
		}
		if (p.height > MAX_REASONABLE_PERCENT_DIM) {
			p.height = (p.height / ch) * 100;
		}
	}
	return manifest;
}

/**
 * Merge hand-authored parallax-config.json (if present) into the manifest.
 * The config file is never overwritten by psd-export, so it survives re-exports.
 */
function mergeParallaxConfig(manifest, manifestFsPath) {
	const configPath = manifestFsPath.replace(/manifest\.json$/, "parallax-config.json");
	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		const config = JSON.parse(raw);
		if (Array.isArray(config.depthCurve) && config.depthCurve.length === 4) {
			manifest.depthCurve = config.depthCurve;
		}
		if (Array.isArray(config.scrollDepthCurve) && config.scrollDepthCurve.length === 4) {
			manifest.scrollDepthCurve = config.scrollDepthCurve;
		}
	} catch {
		// File absent or invalid — silently ignore, curve stays undefined
	}
	return manifest;
}

/**
 * Load scene manifest from public folder at build time.
 * Falls back to a default manifest when the file does not exist (e.g. before PSD export).
 */
export async function loadManifest(scenePath, options = {}) {
	const publicDir = path.join(process.cwd(), "public");
	const fsPath = path.join(publicDir, scenePath.replace(/^\//, ""));
	try {
		const raw = fs.readFileSync(fsPath, "utf-8");
		const manifest = JSON.parse(raw);
		normalizeManifestPositions(manifest);
		return mergeParallaxConfig(manifest, fsPath);
	} catch {
		const slug = scenePath.split("/").filter(Boolean).slice(-2)[0] ?? "default";
		return getDefaultManifest(slug, options.firstStorySlug);
	}
}

const PLACEHOLDER_BG = "/assets/placeholder/background.png";
const PLACEHOLDER_FG = "/assets/placeholder/foreground.png";

function getDefaultManifest(_sceneSlug, firstStorySlug) {
	return {
		canvas: {width: 1920, height: 1080},
		layers: [
			{
				name: "background",
				file: PLACEHOLDER_BG,
				zIndex: 0,
				position: {left: 0, top: 0, width: 100, height: 100},
				parallaxSpeed: 0.05,
				interactive: false,
			},
			{
				name: "foreground",
				file: PLACEHOLDER_FG,
				zIndex: 1,
				position: {left: 0, top: 0, width: 100, height: 100},
				parallaxSpeed: 0.15,
				interactive: true,
				interaction: {
					type: "navigate",
					target: `/story/${firstStorySlug ?? "la-memoire"}`,
					hoverImage: null,
				},
			},
		],
	};
}
