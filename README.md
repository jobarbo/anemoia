# Anemoia

A web-based point-and-click art installation evoking nostalgia through scenes built from photo collages, AI-generated imagery, shaders, music and short stories. Built with [Astro](https://astro.build).

**By Olivier Laforest and Jonathan Barbeau.**

---

## Tech Stack

Application code is written in **vanilla JavaScript** (no TypeScript) to keep it simple and accessible to artists.

- **Astro** — Static site generator, pages and view transitions
- **Content collections** — Neighborhoods (JSON) and stories (Markdown)
- **SCSS** — Styles with BEM-style blocks, variables and mixins
- **GSAP** — Animations and parallax
- **Locomotive Scroll** — Smooth scrolling on story pages
- **p5.js** — Canvas overlays (snow, effects, etc.)
- **PSD Export** — Node script to export Photoshop layers and positions

---

## Project Structure

\`\`\`
├── public/
│   └── assets/
│       └── scenes/           # Runtime scene assets (one folder per scene)
│           └── <slug>/
│               ├── manifest.json   # Layer positions (from PSD export)
│               ├── layers/         # Exported PNGs
│               └── ambient.mp3     # Scene audio (optional)
├── src/
│   ├── components/
│   │   ├── scene/            # SceneRenderer, SceneLayer, InteractiveZone
│   │   ├── effects/          # SketchCanvas (p5)
│   │   └── ui/               # BackButton
│   ├── content/
│   │   └── config.ts         # Content collection schemas
│   ├── data/
│   │   ├── neighborhoods/
│   │   │   └── index.json    # Neighborhood list and map positions
│   │   └── stories/          # Markdown files (one per story)
│   ├── layouts/
│   │   └── GameLayout.astro  # Shared layout, audio, router
│   ├── lib/
│   │   ├── types.ts          # Shared TypeScript types (Manifest, Layer, etc.)
│   │   ├── transitions.ts    # View transition config
│   │   └── load-manifest.ts  # Scene manifest loader with fallback
│   ├── pages/
│   │   ├── index.astro       # Splash
│   │   ├── overworld.astro   # Map
│   │   ├── neighborhood/[slug].astro
│   │   └── story/[slug].astro
│   ├── scripts/              # Parallax, etc.
│   ├── sketches/             # p5 sketches (TypeScript)
│   └── styles/               # Global SCSS, variables, mixins
└── tools/
    └── psd-export.mjs        # PSD → manifest.json + layer PNGs
\`\`\`

**Where to place assets**

- **\`public/assets/scenes/<slug>/\`** — One folder per scene. Place here: \`manifest.json\`, \`layers/*.png\`, and optionally \`ambient.mp3\`. This is the single source of truth for runtime scene assets.
- **\`src/assets/\`** — For images processed by Astro's build-time optimization (e.g. the overworld map). Scene layer images are served from \`public/\` after PSD export.

---

## Commands

| Command           | Action                                              |
| ----------------- | --------------------------------------------------- |
| \`npm install\`   | Install dependencies                                |
| \`npm run dev\`   | Start the dev server at \`localhost:4321\`          |
| \`npm run build\` | Build the site for production into \`./dist/\`      |
| \`npm run preview\` | Preview the production build locally              |

---

## Adding a New Neighborhood

1. **Create the scene folder**
   \`public/assets/scenes/<slug>/\` (e.g. \`public/assets/scenes/saint-roch/\`).

2. **Export the PSD** (see "PSD Layer Export" below) into that folder to get \`manifest.json\` and \`layers/*.png\`.
   If you skip this step, the app will use a default manifest (placeholder layers) until the real files are added.

3. **Optional:** add \`ambient.mp3\` to the same folder.

4. **Register the neighborhood** in \`src/data/neighborhoods/index.json\`:

\`\`\`json
{
"id": "my-neighborhood",
"name": "My Neighborhood",
"slug": "my-neighborhood",
"description": "Short description.",
"scenePath": "/assets/scenes/my-neighborhood/manifest.json",
"audioSrc": "/assets/scenes/my-neighborhood/ambient.mp3",
"stories": ["my-story"],
"position": {"x": 50, "y": 40}
}
\`\`\`

- \`position.x\` and \`position.y\` are percentages for the pin on the overworld map (0–100).
- \`stories\` is an array of story slugs (filenames without \`.md\`).

---

## Adding a New Story

1. **Create a Markdown file** in \`src/data/stories/\`, e.g. \`src/data/stories/my-story.md\`:

\`\`\`markdown
---
title: My Story Title
neighborhood: my-neighborhood
audioSrc: /assets/scenes/my-neighborhood/ambient.mp3
order: 1
---

Story body in Markdown.
\`\`\`

2. **Link it to the neighborhood** by adding its slug to the \`stories\` array in \`src/data/neighborhoods/index.json\` (see above).

---

## PSD Layer Export

Use the Node script to export layer images and a manifest from a Photoshop file:

\`\`\`bash
node tools/psd-export.mjs <path-to-file.psd> [output-folder]
\`\`\`

Example:

\`\`\`bash
node tools/psd-export.mjs ./designs/saint-roch.psd ./public/assets/scenes/saint-roch
\`\`\`

This will:

- Create \`output-folder/layers/\` and export each visible layer as a PNG.
- Write \`output-folder/manifest.json\` with the canvas size and per-layer data: \`name\`, \`file\`, \`zIndex\`, \`position\` (percent), \`parallaxSpeed\`, \`interactive\`.
- Auto-generate \`parallaxSpeed\` from \`zIndex\`: closer layers move more, distant layers stay more stable.

You can then edit \`manifest.json\` to set \`interactive: true\` and add an \`interaction\` block (e.g. \`type: "navigate"\`, \`target: "/story/my-story"\`, optional \`hoverImage\`) for clickable zones.

---

## Adding a New p5 Sketch

1. **Create the sketch** in \`src/sketches/\`, e.g. \`src/sketches/rain.ts\`, exporting a default function that takes a container and returns the p5 sketch function (see \`snow.ts\` for the template).

2. **Register it** in \`src/sketches/index.ts\`:

\`\`\`ts
const sketchLoaders = {
snow: () => import("./snow"),
rain: () => import("./rain"),
};
\`\`\`

3. **Use it in a scene** with \`<SketchCanvas sketch="rain" />\` (e.g. in a \`SceneRenderer\` slot).

---

## Styles (SCSS)

- **Variables:** \`src/styles/_variables.scss\` (\`$color-bg\`, \`$color-accent\`, \`$font-primary\`, etc.). Auto-injected via Astro config.
- **Mixins:** \`src/styles/_mixins.scss\` (e.g. \`flex-center\`, \`absolute-fill\`). Also auto-injected.
- **Conventions:** Prefer BEM-style block names (e.g. \`.scene\`, \`.scene__layer-container\`, \`.zone--navigate\`). Keep scene layer and zone layout/positioning in \`SceneRenderer.astro\`; child components only handle their own rendering (e.g. hover).

---

## Contributing

To add or modify content:

- **Scenes and images** — Use the PSD export workflow and place assets in \`public/assets/scenes/<slug>/\`.
- **Stories** — Add or edit Markdown in \`src/data/stories/\` and reference them in \`src/data/neighborhoods/index.json\`.
- **Audio** — Place \`ambient.mp3\` (or other files) in the scene folder and set \`audioSrc\` in the neighborhood entry or story frontmatter.
- **New neighborhoods** — Add an entry to \`src/data/neighborhoods/index.json\` and make sure the scene folder and manifest exist (or rely on the default manifest in the meantime).

Run \`npm run dev\` to work locally and \`npm run build\` to verify a production build.
