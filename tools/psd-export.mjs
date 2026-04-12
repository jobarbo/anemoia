import fs from "node:fs";
import path from "node:path";
import PSD from "psd";

const PSD_PATH = process.argv[2];
const OUTPUT_DIR = process.argv[3] || path.dirname(PSD_PATH);
const MIN_PARALLAX_SPEED = 0.0;
const MAX_PARALLAX_SPEED = 0.6;
const PARALLAX_SPEED_CURVE = 1.6;

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function getParallaxSpeedForDepth(depth) {
	const normalizedDepth = clamp(depth, 0, 1);
	return MIN_PARALLAX_SPEED + Math.pow(normalizedDepth, PARALLAX_SPEED_CURVE) * (MAX_PARALLAX_SPEED - MIN_PARALLAX_SPEED);
}

if (!PSD_PATH) {
	console.error("Usage: node tools/psd-export.mjs <path-to-psd> [output-dir]");
	process.exit(1);
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

	const processNode = async (node, state) => {
		if (node.isGroup()) {
			// Each group keeps its own clipping context (clipped layers refer to the
			// last non-clipped layer inside the same group).
			const groupState = {...state};
			for (const child of node.children().reverse()) {
				await processNode(child, groupState);
			}
			return;
		}

		if (!node.visible()) return;
		if (node.width === 0 || node.height === 0) return;

		const name = node.name
			.trim()
			.replace(/[^a-zA-Z0-9-]/g, "-")
			.toLowerCase();
		const fileName = `${name}.png`;
		const outputPath = path.join(exportDir, fileName);

		// Save image
		await node.layer.image.saveAsPng(outputPath);

		// Calculate percentage-based bounds
		const leftPercent = (node.left / canvasWidth) * 100;
		const topPercent = (node.top / canvasHeight) * 100;
		const widthPercent = (node.width / canvasWidth) * 100;
		const heightPercent = (node.height / canvasHeight) * 100;

		// Calculate center position
		const centerLeftPercent = ((node.left + node.width / 2) / canvasWidth) * 100;
		const centerTopPercent = ((node.top + node.height / 2) / canvasHeight) * 100;

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
		});
	};

	const state = {
		nextZ: 0,
		lastUnclippedName: null,
	};

	for (const node of tree.children().reverse()) {
		// bottom-up for zIndex
		await processNode(node, state);
	}

	const maxZIndex = Math.max(manifest.layers.length - 1, 1);
	manifest.layers = manifest.layers.map((layer) => ({
		...layer,
		parallaxSpeed: getParallaxSpeedForDepth(layer.zIndex / maxZIndex),
	}));

	const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
	console.log(`Exported ${manifest.layers.length} layers to ${exportDir}`);
	console.log(`Manifest saved to ${manifestPath}`);
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
