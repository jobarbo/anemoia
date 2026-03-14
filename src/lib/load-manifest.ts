import fs from "node:fs";
import path from "node:path";
import type { SceneManifest } from "./types";

/**
 * Load scene manifest from public folder at build time.
 * Falls back to a default manifest when the file does not exist (e.g. before PSD export).
 */
export async function loadManifest(
	scenePath: string,
	options?: { firstStorySlug?: string }
): Promise<SceneManifest> {
	const publicDir = path.join(process.cwd(), "public");
	const fsPath = path.join(publicDir, scenePath.replace(/^\//, ""));
	try {
		const raw = fs.readFileSync(fsPath, "utf-8");
		return JSON.parse(raw) as SceneManifest;
	} catch {
		const slug = scenePath.split("/").filter(Boolean).slice(-2)[0] ?? "default";
		return getDefaultManifest(slug, options?.firstStorySlug);
	}
}

// Placeholder images used when no PSD manifest exists (in public so they never 404)
const PLACEHOLDER_BG = "/assets/placeholder/background.png";
const PLACEHOLDER_FG = "/assets/placeholder/foreground.png";

function getDefaultManifest(
	_sceneSlug: string,
	firstStorySlug?: string
): SceneManifest {
	return {
		canvas: { width: 1920, height: 1080 },
		layers: [
			{
				name: "background",
				file: PLACEHOLDER_BG,
				zIndex: 0,
				position: { left: 0, top: 0, width: 100, height: 100 },
				parallaxSpeed: 0.05,
				interactive: false,
			},
			{
				name: "foreground",
				file: PLACEHOLDER_FG,
				zIndex: 1,
				position: { left: 0, top: 0, width: 100, height: 100 },
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
