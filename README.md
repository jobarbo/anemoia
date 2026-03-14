# Anemoia

A web-based point-and-click art installation that evokes nostalgia through scenes built from photo collages, generated imagery, shaders, music, and short stories. Built with [Astro](https://astro.build).

**By Olivier Laforest and Jonathan Barbeau.**

---

## Tech stack

- **Astro** — Static site generator, pages, and view transitions
- **Content collections** — Neighborhoods (JSON) and stories (Markdown)
- **SCSS** — Styles with BEM-style blocks, variables, and mixins
- **GSAP** — Animations and parallax
- **Locomotive Scroll** — Smooth scroll on story pages
- **p5.js** — Canvas overlays (e.g. snow, effects)
- **PSD export** — Node script to export Photoshop layers and positions

---

## Project structure

```
├── public/
│   └── assets/
│       └── scenes/           # Runtime scene assets (one folder per scene)
│           └── <slug>/
│               ├── manifest.json   # Layer positions (from PSD export)
│               ├── layers/        # Exported PNGs
│               └── ambient.mp3     # Optional scene audio
├── src/
│   ├── components/
│   │   ├── scene/            # SceneRenderer, SceneLayer, InteractiveZone
│   │   ├── effects/          # SketchCanvas (p5)
│   │   └── ui/               # AudioPlayer, BackButton
│   ├── content/
│   │   └── config.ts         # Content collection schemas
│   ├── data/
│   │   ├── neighborhoods/
│   │   │   └── index.json    # Neighborhood list and map positions
│   │   └── stories/         # Markdown files (one per story)
│   ├── layouts/
│   │   └── GameLayout.astro  # Shared layout, audio, router
│   ├── lib/
│   │   ├── types.ts          # Shared TypeScript types (Manifest, Layer, etc.)
│   │   ├── transitions.ts    # View transition configs
│   │   └── load-manifest.ts  # Load or fallback scene manifest
│   ├── pages/
│   │   ├── index.astro       # Splash
│   │   ├── overworld.astro    # Map
│   │   ├── neighborhood/[slug].astro
│   │   └── story/[slug].astro
│   ├── scripts/              # Parallax, etc.
│   ├── sketches/             # p5 sketches (TypeScript)
│   └── styles/               # Global SCSS, variables, mixins
└── tools/
    └── psd-export.mjs        # PSD → manifest.json + layer PNGs
```

**Where assets go**

- **`public/assets/scenes/<slug>/`** — One folder per scene. Put here: `manifest.json`, `layers/*.png`, and optional `ambient.mp3`. This is the single source of truth for scene assets at runtime.
- **`src/assets/`** — Use for images that need Astro’s build-time optimization (e.g. overworld map). Scene layer images are served from `public/` after PSD export.

---

## Commands

| Command           | Action                              |
| ----------------- | ----------------------------------- |
| `npm install`     | Install dependencies                |
| `npm run dev`     | Start dev server at `localhost:4321`|
| `npm run build`   | Build production site to `./dist/`   |
| `npm run preview` | Preview the build locally            |

---

## Adding a new neighborhood

1. **Create the scene folder**  
   `public/assets/scenes/<slug>/` (e.g. `public/assets/scenes/saint-roch/`).

2. **Export your PSD** (see “Exporting PSD layers” below) into that folder so you get `manifest.json` and `layers/*.png`.  
   If you skip this, the app will use a default manifest (placeholder layers) until you add real files.

3. **Optional:** Add `ambient.mp3` in the same folder.

4. **Register the neighborhood** in `src/data/neighborhoods/index.json`:

```json
{
  "id": "my-neighborhood",
  "name": "My Neighborhood",
  "slug": "my-neighborhood",
  "description": "Short description.",
  "scenePath": "/assets/scenes/my-neighborhood/manifest.json",
  "audioSrc": "/assets/scenes/my-neighborhood/ambient.mp3",
  "stories": ["my-story"],
  "position": { "x": 50, "y": 40 }
}
```

- `position.x` and `position.y` are percentages for the pin on the overworld map (0–100).
- `stories` is an array of story slugs (file names without `.md`).

---

## Adding a new story

1. **Create a Markdown file** in `src/data/stories/`, e.g. `src/data/stories/my-story.md`:

```markdown
---
title: My Story Title
neighborhood: my-neighborhood
audioSrc: /assets/scenes/my-neighborhood/ambient.mp3
order: 1
---

Your story body in Markdown.
```

2. **Link it from the neighborhood** by adding its slug to the `stories` array in `src/data/neighborhoods/index.json` (see above).

---

## Exporting PSD layers

Use the Node script to export layer images and a manifest from a Photoshop file:

```bash
node tools/psd-export.mjs <path-to-file.psd> [output-dir]
```

Example:

```bash
node tools/psd-export.mjs ./designs/saint-roch.psd ./public/assets/scenes/saint-roch
```

This will:

- Create `output-dir/layers/` and export each visible layer as a PNG.
- Write `output-dir/manifest.json` with canvas size and per-layer data: `name`, `file`, `zIndex`, `position` (percent), `parallaxSpeed`, `interactive`.

You can then edit `manifest.json` to set `interactive: true` and add `interaction` (e.g. `type: "navigate"`, `target: "/story/my-story"`, optional `hoverImage`) for clickable zones.

---

## Adding a new p5 sketch

1. **Create the sketch** in `src/sketches/`, e.g. `src/sketches/rain.ts`, exporting a default function that takes a container and returns the p5 sketch function (see `snow.ts` for the pattern).

2. **Register it** in `src/sketches/index.ts`:

```ts
const sketchLoaders = {
  snow: () => import("./snow"),
  rain: () => import("./rain"),
};
```

3. **Use it in a scene** with `<SketchCanvas sketch="rain" />` (e.g. in a slot of `SceneRenderer`).

---

## Styles (SCSS)

- **Variables:** `src/styles/_variables.scss` (`$color-bg`, `$color-accent`, `$font-primary`, etc.). These are auto-injected via Astro config.
- **Mixins:** `src/styles/_mixins.scss` (e.g. `flex-center`, `absolute-fill`). Also auto-injected.
- **Conventions:** Prefer BEM-style block names (e.g. `.scene`, `.scene__layer-container`, `.zone--navigate`). Keep layout/positioning for scene layers and zones in `SceneRenderer.astro`; child components handle only their own visuals (e.g. hover).

---

## Contributing

To add or change content:

- **Scenes and images** — Use the PSD export workflow and place assets under `public/assets/scenes/<slug>/`.
- **Stories** — Add or edit Markdown in `src/data/stories/` and reference them in `src/data/neighborhoods/index.json`.
- **Audio** — Place `ambient.mp3` (or other files) in the scene folder and set `audioSrc` in the neighborhood or story frontmatter.
- **New neighborhoods** — Add an entry to `src/data/neighborhoods/index.json` and ensure the scene folder and manifest exist (or rely on the default manifest until then).

Run `npm run dev` to work locally and `npm run build` to confirm a production build.
