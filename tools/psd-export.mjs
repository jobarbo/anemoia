import fs from 'node:fs';
import path from 'node:path';
import PSD from 'psd';

const PSD_PATH = process.argv[2];
const OUTPUT_DIR = process.argv[3] || path.dirname(PSD_PATH);

if (!PSD_PATH) {
  console.error("Usage: node tools/psd-export.mjs <path-to-psd> [output-dir]");
  process.exit(1);
}

const main = async () => {
  console.log(`Parsing PSD: ${PSD_PATH}`);
  const psd = PSD.fromFile(PSD_PATH);
  psd.parse();

  const tree = psd.tree();
  const canvasWidth = tree.document.width;
  const canvasHeight = tree.document.height;

  const manifest = {
    canvas: { width: canvasWidth, height: canvasHeight },
    layers: []
  };

  const exportDir = path.join(OUTPUT_DIR, 'layers');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const processNode = async (node, zIndex) => {
    if (node.isGroup()) {
      for (const child of node.children().reverse()) {
        await processNode(child, zIndex++);
      }
      return;
    }

    if (!node.visible()) return;
    if (node.width === 0 || node.height === 0) return;

    const name = node.name.trim().replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const fileName = `${name}.png`;
    const outputPath = path.join(exportDir, fileName);
    
    // Save image
    await node.layer.image.saveAsPng(outputPath);

    // Calculate percentage-based bounds
    const leftPercent = (node.left / canvasWidth) * 100;
    const topPercent = (node.top / canvasHeight) * 100;
    const widthPercent = (node.width / canvasWidth) * 100;
    const heightPercent = (node.height / canvasHeight) * 100;

    manifest.layers.push({
      name,
      file: fileName,
      zIndex,
      position: {
        left: leftPercent,
        top: topPercent,
        width: widthPercent,
        height: heightPercent
      },
      parallaxSpeed: 0.1,
      interactive: false
    });
  };

  let zIndex = 0;
  for (const node of tree.children().reverse()) { // bottom-up for zIndex
    await processNode(node, zIndex++);
  }

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Exported ${manifest.layers.length} layers to ${exportDir}`);
  console.log(`Manifest saved to ${manifestPath}`);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
