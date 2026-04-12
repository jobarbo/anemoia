---
name: Anemoia Game Build
overview: 'Build "Anemoia" — a point-and-click art installation using Astro.js as the modular engine, across 4 phased steps: project foundation, PSD-to-web layer pipeline, interactivity & routing, and shader/animation layer.'
todos:
  - id: step1-structure
    content: "Step 1: Scaffold full project structure — pages, components, styles, scripts, data directories with naming conventions and SCSS setup"
    status: pending
  - id: step1-layout
    content: "Step 1: Set up BaseLayout.astro with ClientRouter, global SCSS, Lenis init and audio manager scaffold"
    status: pending
  - id: step1-assets
    content: "Step 1: Define asset conventions — neighborhoods folder structure, public/ for audio/video, src/assets/ for optimized images"
    status: pending
  - id: step2-psd-script
    content: "Step 2: Write Photoshop ExtendScript (export-layers.jsx) and psd.js Node alternative to generate layers.json manifest"
    status: pending
  - id: step2-layer-stack
    content: "Step 2: Build LayerStack.astro + ParallaxLayer.astro that consume layers.json and position layers using CSS percentage values"
    status: pending
  - id: step3-collections
    content: "Step 3: Set up content.config.ts with neighborhoods and stories collections (Zod schemas, glob loaders)"
    status: pending
  - id: step3-routing
    content: "Step 3: Create dynamic pages [neighborhood].astro and story/[slug].astro with getStaticPaths()"
    status: pending
  - id: step3-interactive
    content: "Step 3: Build InteractiveZone.astro hotspot system (hover image swap, navigate, toggle-light types)"
    status: pending
  - id: step4-canvas
    content: "Step 4: Add p5.js WEBGL canvas overlay to scene for post-processing shaders (rain, snow, atmospheric FX)"
    status: pending
  - id: step4-story-scroll
    content: "Step 4: Wire GSAP ScrollTrigger + Lenis in story view for Lost Odyssey-style pinned scroll reveal"
    status: pending
  - id: step4-transitions
    content: "Step 4: Add view transitions with transition:name morph between overworld → neighborhood → story"
    status: pending
isProject: false
---

# Anemoia — Art Installation Build Plan

## Current State

A bare Astro 5 project with one working parallax proof-of-concept (mouse-driven `Background.astro` + `Foreground.astro`), no SCSS, no content collections, no routing beyond two static pages.

---

## Step 1 — Project Foundation

### Integrations to Install

```bash
npm install -D sass
npm install gsap
npm install @studio-freight/lenis   # Lenis is the de-facto successor to Locomotive v5
```

Add to `astro.config.mjs`:

- `@astrojs/image` is already built-in (no plugin needed)
- Set `output: 'static'` (default, fine for an art installation)
- Consider enabling `vite.css.preprocessorOptions.scss` for global SCSS vars

### Project Structure

```
src/
├── assets/
│   ├── neighborhoods/
│   │   ├── saint-roch/          # One folder per neighborhood
│   │   │   ├── layers/          # Exported PNG layers from PSD
│   │   │   │   ├── 01-sky.png
│   │   │   │   ├── 02-buildings.png
│   │   │   │   └── ...
│   │   │   └── layers.json      # Layer manifest (from PSD export script)
│   │   └── vieux-port/
│   ├── overworld/               # Map photo(s)
│   └── ui/                      # Cursor, icons, logo
├── components/
│   ├── scene/
│   │   ├── LayerStack.astro     # Renders all layers from a manifest
│   │   ├── ParallaxLayer.astro  # Single z-indexed layer with parallax data attrs
│   │   └── InteractiveZone.astro # Hotspot overlay (hover/click)
│   ├── overworld/
│   │   └── NeighborhoodPin.astro
│   ├── story/
│   │   ├── StoryScroll.astro
│   │   └── AudioPlayer.astro
│   └── ui/
│       ├── Cursor.astro
│       └── Transition.astro
├── data/
│   ├── neighborhoods/           # .md files (content collection)
│   │   ├── saint-roch.md
│   │   └── vieux-port.md
│   └── stories/                 # .md files (content collection)
│       ├── saint-roch-01.md
│       └── vieux-port-01.md
├── layouts/
│   └── BaseLayout.astro         # ClientRouter lives here
├── pages/
│   ├── index.astro              # Splash / menu
│   ├── overworld.astro          # 2D map
│   ├── [neighborhood].astro     # Dynamic neighborhood view
│   └── story/
│       └── [slug].astro         # Dynamic story view
├── scripts/
│   ├── parallax.ts              # Mouse parallax logic (extracted from Scene.astro)
│   ├── audio.ts                 # Global audio manager
│   └── lenis.ts                 # Smooth scroll init
└── styles/
    ├── _variables.scss          # Colors, z-indexes, breakpoints
    ├── _mixins.scss
    ├── _reset.scss
    └── global.scss              # @use all partials
```

### Naming Conventions

**Files:** kebab-case for all files (`parallax-layer.ts`, `saint-roch.md`). PascalCase for Astro components (`LayerStack.astro`).

**CSS — BEM + SCSS:**

- Block: `.scene`, `.neighborhood`, `.story`, `.overworld`
- Element: `.scene__layer`, `.scene__interactive-zone`, `.story__paragraph`
- Modifier: `.scene__layer--sky`, `.scene__layer--foreground`, `.scene__layer--is-active`
- Z-index scale via SCSS variable map: `$z: (sky: 1, buildings: 2, midground: 3, foreground: 4, interactive: 5, canvas: 6, ui: 10)`

**TypeScript:** Strict mode on. Types defined in `src/types/` (`Layer`, `Neighborhood`, `Story`, `InteractiveZone`).

**JS conventions:** Vanilla TS for all interactivity. No framework JS (no React/Vue). GSAP for animation, Lenis for smooth scroll. Scripts imported as Astro `<script>` tags or as `client:only` islands if needed.

### Asset Management Rules

| Asset type              | Location                           | Notes                                                       |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------- |
| Photos / PNG layers     | `src/assets/`                      | Processed by Astro `<Image />` → WebP, lazy load            |
| Video loops             | `public/video/`                    | Served as-is; use `<video autoplay muted loop playsinline>` |
| Audio                   | `public/audio/`                    | Served as-is                                                |
| 3D models (.glb)        | `public/models/`                   | Served as-is; loaded via Three.js dynamically               |
| Layer manifests (.json) | `src/assets/neighborhoods/[slug]/` | Imported at build time                                      |

---

## Step 2 — PSD → Web Layer Pipeline

### Exporting Layer Positions from Photoshop

Yes — Photoshop supports ExtendScript (JSX) scripts that can iterate all layers and export a JSON manifest. Your colleague runs this once per scene.

**Script to run in Photoshop (`File > Scripts > Browse…`):**

```javascript
// export-layers.jsx (run in Photoshop)
var doc = app.activeDocument;
var docW = doc.width.as("px");
var docH = doc.height.as("px");
var layers = [];

function collectLayer(layer, index) {
	var b = layer.bounds;
	layers.push({
		name: layer.name,
		index: index, // z-order (0 = bottom)
		x: b[0].as("px"),
		y: b[1].as("px"),
		width: b[2].as("px") - b[0].as("px"),
		height: b[3].as("px") - b[1].as("px"),
		opacity: layer.opacity,
		visible: layer.visible,
		blendMode: layer.blendMode.toString(),
		xPct: (b[0].as("px") / docW) * 100, // percentage for responsive CSS
		yPct: (b[1].as("px") / docH) * 100,
		wPct: ((b[2].as("px") - b[0].as("px")) / docW) * 100,
		hPct: ((b[3].as("px") - b[1].as("px")) / docH) * 100,
	});
}

for (var i = doc.layers.length - 1; i >= 0; i--) {
	collectLayer(doc.layers[i], doc.layers.length - 1 - i);
}

var manifest = {docWidth: docW, docHeight: docH, aspectRatio: docW / docH, layers: layers};
// Write to file...
```

This outputs `layers.json` with normalized pixel + percentage positions for every layer.

**Alternative (no Photoshop needed): `psd.js` Node script**

```bash
npm install psd
node scripts/parse-psd.mjs path/to/scene.psd > src/assets/neighborhoods/saint-roch/layers.json
```

### Consuming the Manifest in Astro

The `LayerStack.astro` component imports the JSON and renders each layer with CSS custom properties derived from the manifest, keeping positions pixel-perfect relative to the scene container's aspect ratio:

```astro
---
// src/components/scene/LayerStack.astro
import type { LayerManifest } from '../../types';
interface Props { manifest: LayerManifest }
const { manifest } = Astro.props;
---
<div class="scene" style={`--aspect: ${manifest.docWidth}/${manifest.docHeight}`}>
  {manifest.layers.map((layer) => (
    <div
      class="scene__layer"
      data-layer={layer.name}
      style={`
        left: ${layer.xPct}%;
        top: ${layer.yPct}%;
        width: ${layer.wPct}%;
        z-index: ${layer.index};
        opacity: ${layer.opacity / 100};
      `}
    >
      <!-- <Image> for each layer PNG -->
    </div>
  ))}
</div>
```

The scene container uses `aspect-ratio: var(--aspect)` and `width: 100%` — layers stay perfectly positioned at any viewport width without hardcoded pixels.

---

## Step 3 — Routing & Interactivity

### Content Collections Schema

```typescript
// src/content.config.ts
import {defineCollection, z} from "astro:content";
import {glob} from "astro/loaders";

const neighborhoods = defineCollection({
	loader: glob({pattern: "**/*.md", base: "./src/data/neighborhoods"}),
	schema: z.object({
		name: z.string(),
		slug: z.string(),
		mapPosition: z.object({x: z.number(), y: z.number()}), // % on overworld map
		audioAmbient: z.string().optional(),
		layerManifest: z.string(), // path to layers.json
	}),
});

const stories = defineCollection({
	loader: glob({pattern: "**/*.md", base: "./src/data/stories"}),
	schema: z.object({
		title: z.string(),
		neighborhood: z.string(), // matches neighborhood slug
		audioNarration: z.string().optional(),
		order: z.number(),
	}),
});

export const collections = {neighborhoods, stories};
```

Adding a new neighborhood = drop a `.md` file + a layer folder. Zero code changes needed.

### Page Routing Architecture

```
/                    → index.astro         (Splash)
/overworld           → overworld.astro     (2D Map)
/[neighborhood]      → [neighborhood].astro (Neighborhood view, e.g. /saint-roch)
/story/[slug]        → story/[slug].astro  (Story scroll view)
```

Dynamic pages use `getStaticPaths()` fed from content collections.

### Interactive Zones

Each interactive hotspot on a neighborhood layer is defined in the neighborhood's `.md` frontmatter or a companion `zones.json`:

```json
{
	"zones": [
		{
			"id": "door-01",
			"layerName": "facade-building-a",
			"x": 42.5,
			"y": 61.2,
			"width": 5.2,
			"height": 9.8,
			"type": "navigate", // or "toggle-image" | "toggle-light" | "video"
			"action": "/story/saint-roch-01",
			"hoverImage": "door-open.png" // shown on hover (optional)
		}
	]
}
```

`InteractiveZone.astro` renders an absolutely-positioned `<button>` (accessible) over the layer, sized/positioned from the zone data. On hover it swaps to `hoverImage` (CSS or JS image swap). On click it navigates to `action`.

---

## Step 4 — Canvas, Shaders, Scroll & Transitions

### Canvas Layer for Post-Processing

A `<canvas>` element is rendered at `z-index: var(--z-canvas)` on top of each scene. p5.js in WEBGL mode runs on it and reads the scene's pixel data via `drawingContext.drawImage()` to apply per-layer GLSL shaders (rain, snow, chromatic aberration, light flicker, etc.).

> **Note:** For production-quality post-processing (bloom, depth-of-field per z-layer), Three.js `EffectComposer` gives you a more structured pipeline. p5.js WEBGL is simpler to get started with but has limits with multiple render passes. This is worth reconsidering if the shader work becomes complex.

### GSAP + Lenis in Story View

In `[story/[slug].astro](src/pages/story/[slug].astro)`:

```typescript
// src/scripts/story-scroll.ts
import Lenis from "@studio-freight/lenis";
import {gsap} from "gsap";
import {ScrollTrigger} from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis();
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));

// Pin + scrub — Lost Odyssey-style story reveal
const tl = gsap.timeline({
	scrollTrigger: {
		trigger: ".story",
		pin: true,
		start: "top top",
		end: "+=2000",
		scrub: 1.5,
		snap: {snapTo: "labels", duration: {min: 0.2, max: 2}, ease: "power2.inOut"},
	},
});

tl.addLabel("title")
	.from(".story__title", {opacity: 0, y: 40, duration: 1})
	.addLabel("verse-1")
	.from(".story__verse", {opacity: 0, x: -30, stagger: 0.3})
	.addLabel("image")
	.from(".story__image", {scale: 0.94, opacity: 0, duration: 1.2});
```

### Astro View Transitions

In `[BaseLayout.astro](src/layouts/BaseLayout.astro)`:

```astro
---
import { ClientRouter } from 'astro:transitions';
---
<html>
  <head>
    <ClientRouter />
  </head>
  <body><slot /></body>
</html>
```

Named transitions for shared morphing elements across views:

```astro
<!-- On /overworld — neighborhood card -->
<img src={cover} transition:name={`neighborhood-${slug}`} />

<!-- On /[neighborhood] — same image, now full-screen hero -->
<img src={cover} transition:name={`neighborhood-${slug}`} />
```

This creates an automatic morph animation between the map pin thumbnail and the full neighborhood view, without any custom JS.

Audio continuity across page changes:

```astro
<audio src={ambientAudio} autoplay loop transition:persist="ambient-audio" />
```

---

## Dependency Summary

| Package                     | Purpose                                          |
| --------------------------- | ------------------------------------------------ |
| `astro` (already installed) | Core framework                                   |
| `sass`                      | SCSS support                                     |
| `gsap`                      | All animation (ScrollTrigger, timelines, tweens) |
| `@studio-freight/lenis`     | Smooth scroll (modern Locomotive replacement)    |
| `p5`                        | WebGL canvas post-processing shaders             |
| `psd` (dev only)            | Parse .psd files for layer manifest generation   |
