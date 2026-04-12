---
name: Anemoia Codebase Refactor
overview: Audit and refactor the Anemoia art installation project to establish a clean, modular, DRY foundation that artists can easily extend with new scenes, neighborhoods, stories, and effects.
todos:
  - id: types
    content: Create src/lib/types.ts with shared interfaces (SceneManifest, Layer, Zone, Interaction)
    status: completed
  - id: fix-bugs
    content: "Fix $color-accent: #teal and favicon typo in GameLayout"
    status: completed
  - id: consolidate-css
    content: Remove duplicate layer/zone positioning CSS from SceneLayer and InteractiveZone (keep in SceneRenderer only)
    status: completed
  - id: move-transitions
    content: Move transitions.ts to src/lib/ and update all imports
    status: completed
  - id: manifest-loader
    content: Create src/lib/load-manifest.ts and remove hardcoded mock from [slug].astro
    status: completed
  - id: centralize-audio
    content: Move audio element into GameLayout props, delete AudioManager singleton
    status: completed
  - id: back-button
    content: Extract BackButton.astro component, use it across pages
    status: completed
  - id: dead-code
    content: Delete Layout.astro, audio-manager.ts, astro.svg
    status: completed
  - id: parallax-scene
    content: Move parallax init from [slug].astro into SceneRenderer.astro
    status: completed
  - id: ts-sketches
    content: Convert sketches to TypeScript, remove @ts-nocheck
    status: completed
  - id: simplify-pages
    content: Clean up all pages to be thin shells using the new shared modules
    status: completed
  - id: readme
    content: Write comprehensive contributor README.md
    status: completed
isProject: false
---

# Anemoia Codebase Refactor Plan

## Audit Summary

The codebase is a promising prototype with good instincts (content collections, component-based scenes, PSD export pipeline). However, it has accumulated inconsistencies from rapid prototyping that will hurt maintainability. Here are the key issues grouped by category.

### Bugs

- **Invalid SCSS:** `$color-accent: #teal;` in `[src/styles/_variables.scss](src/styles/_variables.scss)` -- `#teal` is not valid CSS. Should be `teal` or `#008080`.
- **Broken favicon ref:** `GameLayout.astro` references `/favview.svg` (typo) instead of `/favicon.svg`.

### DRY Violations

- **Duplicate CSS positioning:** Layer/zone position styles (using CSS custom properties) are defined three times -- in `[SceneLayer.astro](src/components/scene/SceneLayer.astro)`, `[InteractiveZone.astro](src/components/scene/InteractiveZone.astro)`, AND `[SceneRenderer.astro](src/components/scene/SceneRenderer.astro)`. The parent `SceneRenderer` already styles children `.layer` and `.zone` via descendant selectors, making the child component styles redundant or conflicting.
- **Audio element pattern:** Every page repeats `{audioSrc && <audio id='global-audio' src={audioSrc} loop ... />}`. This should be driven by data and handled by `GameLayout` or `AudioPlayer`.
- **Back navigation:** Each page has its own back link/button with inline styles. This could be a shared `BackButton` component.

### Dead / Conflicting Code

- `**Layout.astro` is unused -- only `GameLayout.astro` is referenced by any page. Remove it.
- `**AudioManager` class in `[src/scripts/audio-manager.ts](src/scripts/audio-manager.ts)` is a singleton that is never imported by any component. Pages use raw `<audio>` tags instead. Either adopt the manager or remove it.
- `**src/assets/astro.svg`** and `**src/assets/background.svg\*\` are starter-template leftovers.

### Separation of Concerns

- **Mock manifest hardcoded in a page:** `[neighborhood/[slug].astro](src/pages/neighborhood/[slug].astro)` contains a 20-line `mockManifest` object with fake layer data. Scene configuration should live in data files, not pages.
- `**transitions.ts` at `src/` root: Should live under `src/config/` or `src/lib/`.
- **Inline parallax init in page `<script>`:** The parallax bootstrap in `[slug].astro` should be part of the scene system, not ad hoc per page.

### Type Safety

- No TypeScript interfaces for the core data model (Manifest, Layer, Zone, Interaction). The `Layer` interface exists only as a local type inside `SceneRenderer.astro`. This should be shared.

### Asset Organization

- Scene images (`background.png`, `foreground.png`) sit at `src/assets/` root instead of inside their scene folder. The `src/assets/scenes/` subdirectories exist but are empty.
- Split between `public/assets/scenes/` (audio) and `src/assets/scenes/` (images) is confusing with no documented rule for which goes where.

---

## Proposed Directory Structure

```
src/
  components/
    scene/
      SceneRenderer.astro    # orchestrates layers + zones + slots
      SceneLayer.astro        # single image/video layer
      InteractiveZone.astro   # clickable zone (navigate/state)
    effects/
      SketchCanvas.astro      # p5 sketch overlay
    ui/
      AudioPlayer.astro       # play/pause toggle
      BackButton.astro        # NEW: reusable back navigation
  content/
    config.ts                 # content collection schemas
  data/
    neighborhoods/
      index.json
    stories/
      la-memoire.md
  layouts/
    GameLayout.astro          # sole layout (remove Layout.astro)
  lib/
    types.ts                  # NEW: shared TypeScript types (Manifest, Layer, Zone, etc.)
    transitions.ts            # MOVED from src/transitions.ts
    load-manifest.ts          # NEW: helper to load/validate scene manifests
  pages/
    index.astro
    overworld.astro
    neighborhood/[slug].astro
    story/[slug].astro
  scripts/
    parallax.ts
  sketches/
    index.ts                  # RENAME .js -> .ts
    snow.ts                   # RENAME .js -> .ts
  styles/
    _variables.scss
    _mixins.scss
    _reset.scss
    _typography.scss
    global.scss

public/
  assets/
    scenes/
      <slug>/
        manifest.json         # layer positions (output from psd-export)
        layers/               # exported PNGs
        ambient.mp3           # scene audio
tools/
  psd-export.mjs              # PSD -> manifest.json + PNGs
```

**Key rule (to document):** `public/assets/scenes/<slug>/` is the single source of truth for each scene's runtime assets (manifest, layer images, audio). `src/assets/` is reserved for images that need Astro's build-time optimization (e.g., the overworld map base image).

---

## Refactor Steps

### 1. Create shared types (`[src/lib/types.ts](src/lib/types.ts)`)

Define and export interfaces used across the codebase:

```typescript
export interface LayerPosition {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface Interaction {
	type: "navigate" | "state";
	target?: string;
	hoverImage?: string | null;
}

export interface Layer {
	name: string;
	file: string;
	zIndex: number;
	position: LayerPosition;
	parallaxSpeed: number;
	interactive: boolean;
	interaction?: Interaction;
	type?: "image" | "video";
}

export interface SceneManifest {
	canvas: {width: number; height: number};
	layers: Layer[];
}
```

### 2. Fix bugs

- Fix `$color-accent: #teal` to `$color-accent: teal` in `_variables.scss`.
- Fix favicon typo in `GameLayout.astro`: `favview.svg` -> `favicon.svg`.

### 3. Consolidate duplicate CSS

- Remove the `.layer` and `.zone` positioning CSS from `SceneLayer.astro` and `InteractiveZone.astro`. Keep it only in `SceneRenderer.astro` which already handles layout of its children via descendant selectors. Child components should only define their own internal styling (e.g., hover effects on zones).

### 4. Move `transitions.ts` to `src/lib/`

- Move from `src/transitions.ts` to `src/lib/transitions.ts`.
- Update all imports in pages.

### 5. Create manifest loader (`[src/lib/load-manifest.ts](src/lib/load-manifest.ts)`)

A small utility to either load a real `manifest.json` from the filesystem at build time, or fall back to a default/mock manifest. This eliminates the hardcoded mock from `[slug].astro`:

```typescript
import type {SceneManifest} from "./types";

export async function loadManifest(scenePath: string): Promise<SceneManifest> {
	// scenePath comes from neighborhood data, e.g. "/assets/scenes/saint-roch/manifest.json"
	const fsPath = `./public${scenePath}`;
	try {
		const raw = await import(`${fsPath}`, {with: {type: "json"}});
		return raw.default as SceneManifest;
	} catch {
		return getDefaultManifest();
	}
}
```

### 6. Centralize audio in `GameLayout`

Move the `<audio>` element logic into `GameLayout.astro` so pages only pass an `audioSrc` prop:

```astro
---
const { title = "Anemoia", audioSrc } = Astro.props;
---
<html lang="fr">
  <head>...</head>
  <body>
    <slot />
    {audioSrc && <audio id="global-audio" src={audioSrc} loop />}
    <AudioPlayer />
  </body>
</html>
```

Pages become: `<GameLayout title="..." audioSrc={neighborhood.audioSrc}>`. Remove the duplicate `AudioManager` singleton class in `src/scripts/audio-manager.ts`.

### 7. Create `BackButton` component

Extract the repeated back-button pattern into `[src/components/ui/BackButton.astro](src/components/ui/BackButton.astro)`:

```astro
---
const { href, label = "Retour" } = Astro.props;
---
<a href={href} class="back-btn">{label}</a>
<style lang="scss">
  .back-btn {
    position: fixed; top: 2rem; left: 2rem; z-index: 100;
    color: #fff; text-decoration: none;
    background: rgba(0,0,0,0.5); padding: 0.5rem 1rem; border-radius: 4px;
  }
</style>
```

### 8. Clean up dead code

- Delete `src/layouts/Layout.astro` (unused).
- Delete `src/scripts/audio-manager.ts` (unused singleton, replaced by layout-level audio).
- Delete `src/assets/astro.svg` (Astro starter leftover).

### 9. Integrate parallax into scene system

Move the parallax initialization from the inline `<script>` in `[slug].astro` into `SceneRenderer.astro` so any scene automatically gets parallax behavior. The scene renderer already renders all layers with `data-parallax-speed` attributes; it should also own the mouse-move listener.

### 10. Convert sketches to TypeScript

Rename `src/sketches/index.js` and `src/sketches/snow.js` to `.ts` and add proper types. Remove `@ts-nocheck` from `SketchCanvas.astro`.

### 11. Simplify pages

After steps 1-10, pages become thin shells:

- `**index.astro**`: Layout + splash content (no change needed beyond audio centralization).
- `**overworld.astro**`: Layout + map rendering from collection data.
- `**[slug].astro` (neighborhood): Layout + `SceneRenderer` fed by loaded manifest. No mock data, no inline parallax script.
- `**[slug].astro` (story): Layout + rendered markdown content + Locomotive Scroll init.

### 12. Write contributor README

Replace the default Astro README with a project-specific `README.md` covering:

- Project concept and tech stack
- Directory structure and conventions (where scenes, assets, stories, and audio go)
- How to add a new neighborhood (create folder in `public/assets/scenes/`, add entry to `neighborhoods/index.json`)
- How to add a new story (create `.md` file in `src/data/stories/`)
- How to export PSD layers (`node tools/psd-export.mjs <file.psd> <output-dir>`)
- How to add a new p5 sketch
- SCSS conventions (BEM naming, use of variables/mixins)
- Development commands (`npm run dev`, `npm run build`)
