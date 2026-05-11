import fs from "node:fs";
import path from "node:path";
import PSD from "psd";
import {syncStackParallaxFromDepth} from "../src/lib/scene/layer-stacks.js";

const PSD_PATH = process.argv[2];
const OUTPUT_DIR = process.argv[3] || path.dirname(PSD_PATH);

if (!PSD_PATH) {
	console.error("Usage: node tools/psd-export.mjs <path-to-psd> [output-dir]");
	process.exit(1);
}

function sanitizeLayerName(raw) {
	return raw
		.trim()
		.replace(/[^a-zA-Z0-9-]/g, "-")
		.toLowerCase();
}

/**
 * Direct scene children: unwrap a single top-level group (e.g. saint-roch) so its children are roots.
 * @param {import("psd").Layer} tree
 */
function getSceneRootChildren(tree) {
	const roots = tree.children();
	if (roots.length === 1 && roots[0].isGroup()) {
		return roots[0].children().slice().reverse();
	}
	return roots.slice().reverse();
}

const main = async () => {
	console.log(`Parsing PSD: ${PSD_PATH}`);
	const psd = PSD.fromFile(PSD_PATH);
	psd.parse();

	const tree = psd.tree();
	const exported = tree.export();
	const canvasWidth = exported.document?.width ?? psd.header?.cols ?? psd.header?.width;
	const canvasHeight = exported.document?.height ?? psd.header?.rows ?? psd.header?.height;

	const manifest = {
		canvas: {width: canvasWidth, height: canvasHeight},
		layers: [],
	};

	const exportDir = path.join(OUTPUT_DIR, "layers");
	if (!fs.existsSync(exportDir)) {
		fs.mkdirSync(exportDir, {recursive: true});
	}

	/**
	 * @param {import("psd").Layer} node
	 * @param {{ nextZ: number, lastUnclippedName: string | null }} state
	 * @param {string | null} sceneGroupId - shared container id for all leaves under a scene-root group; null = solo
	 */
	const processNode = async (node, state, sceneGroupId) => {
		if (node.isGroup()) {
			const groupState = {...state};
			for (const child of node.children().reverse()) {
				await processNode(child, groupState, sceneGroupId);
			}
			// Merge counters back so layers *after* this group (e.g. foreground velos)
			// get a higher zIndex than leaves inside the group.
			state.nextZ = groupState.nextZ;
			state.lastUnclippedName = groupState.lastUnclippedName;
			return;
		}

		if (!node.visible()) return;
		if (node.width === 0 || node.height === 0) return;

		const name = sanitizeLayerName(node.name);
		const fileName = `${name}.png`;
		const outputPath = path.join(exportDir, fileName);

		await node.layer.image.saveAsPng(outputPath);

		const centerLeftPercent = ((node.left + node.width / 2) / canvasWidth) * 100;
		const centerTopPercent = ((node.top + node.height / 2) / canvasHeight) * 100;
		const widthPercent = (node.width / canvasWidth) * 100;
		const heightPercent = (node.height / canvasHeight) * 100;

		const rawBlendMode = node.layer?.blendMode?.mode ?? node.layer?.blendMode ?? "normal";
		const blendMode = String(rawBlendMode).replace(/_/g, "-");

		const rawOpacity = typeof node.layer?.opacity === "number" ? node.layer.opacity : 1;
		const opacity = rawOpacity > 1 ? rawOpacity / 255 : rawOpacity;

		const clipped = Boolean(node.layer?.clipped);
		const clipTarget = clipped ? state.lastUnclippedName : undefined;

		if (!clipped) {
			state.lastUnclippedName = name;
		}

		manifest.layers.push({
			name,
			file: fileName,
			zIndex: state.nextZ++,
			position: {
				centerLeft: centerLeftPercent,
				centerTop: centerTopPercent,
				width: widthPercent,
				height: heightPercent,
			},
			parallaxSpeed: 0.1,
			interactive: false,
			blendMode,
			opacity,
			clipped,
			clippedTo: clipTarget,
			...(sceneGroupId ? {sceneGroupId} : {}),
		});
	};

	const state = {
		nextZ: 0,
		lastUnclippedName: null,
	};

	for (const node of getSceneRootChildren(tree)) {
		if (node.isGroup()) {
			const gid = sanitizeLayerName(node.name);
			await processNode(node, state, gid);
		} else {
			await processNode(node, state, null);
		}
	}

	syncStackParallaxFromDepth(manifest.layers);

	const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
	console.log(`Exported ${manifest.layers.length} layers to ${exportDir}`);
	console.log(`Manifest saved to ${manifestPath}`);
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
