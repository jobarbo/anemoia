# Anemoia

Installation artistique web de type point-and-click qui évoque la nostalgie à travers des scènes construites à partir de collages photo, d’images générées, de shaders, de musique et de courtes histoires. Construite avec [Astro](https://astro.build).

**Par Olivier Laforest et Jonathan Barbeau.**

---

## Stack technique

Le code applicatif est en **JavaScript vanilla** (pas de TypeScript) pour rester simple et accessible aux artistes.

- **Astro** — Générateur de site statique, pages et transitions de vue
- **Content collections** — Quartiers (JSON) et histoires (Markdown)
- **SCSS** — Styles avec blocs type BEM, variables et mixins
- **GSAP** — Animations et parallaxe
- **Locomotive Scroll** — Défilement fluide sur les pages d’histoires
- **p5.js** — Overlays canvas (neige, effets, etc.)
- **Export PSD** — Script Node pour exporter les calques et positions Photoshop

---

## Structure du projet

```
├── public/
│   └── assets/
│       └── scenes/           # Assets de scène à l’exécution (un dossier par scène)
│           └── <slug>/
│               ├── manifest.json   # Positions des calques (depuis l’export PSD)
│               ├── layers/        # PNG exportés
│               └── ambient.mp3     # Audio de scène (optionnel)
├── src/
│   ├── components/
│   │   ├── scene/            # SceneRenderer, SceneLayer, InteractiveZone
│   │   ├── effects/          # SketchCanvas (p5)
│   │   └── ui/               # AudioPlayer, BackButton
│   ├── content/
│   │   └── config.ts         # Schémas des content collections
│   ├── data/
│   │   ├── neighborhoods/
│   │   │   └── index.json    # Liste des quartiers et positions sur la carte
│   │   └── stories/         # Fichiers Markdown (un par histoire)
│   ├── layouts/
│   │   └── GameLayout.astro  # Layout partagé, audio, routeur
│   ├── lib/
│   │   ├── types.ts          # Types TypeScript partagés (Manifest, Layer, etc.)
│   │   ├── transitions.ts   # Config des transitions de vue
│   │   └── load-manifest.ts  # Chargement ou fallback du manifest de scène
│   ├── pages/
│   │   ├── index.astro       # Splash
│   │   ├── overworld.astro   # Carte
│   │   ├── neighborhood/[slug].astro
│   │   └── story/[slug].astro
│   ├── scripts/              # Parallaxe, etc.
│   ├── sketches/             # Sketches p5 (TypeScript)
│   └── styles/               # SCSS global, variables, mixins
└── tools/
    └── psd-export.mjs        # PSD → manifest.json + PNG des calques
```

**Où placer les assets**

- **`public/assets/scenes/<slug>/`** — Un dossier par scène. Y mettre : `manifest.json`, `layers/*.png`, et optionnellement `ambient.mp3`. C’est la source unique des assets de scène à l’exécution.
- **`src/assets/`** — Pour les images qui passent par l’optimisation au build Astro (ex. carte overworld). Les images des calques de scène sont servies depuis `public/` après l’export PSD.

---

## Commandes

| Commande          | Action                                           |
| ----------------- | ------------------------------------------------ |
| `npm install`     | Installer les dépendances                        |
| `npm run dev`     | Démarrer le serveur de dev sur `localhost:4321`  |
| `npm run build`   | Construire le site en production dans `./dist/`  |
| `npm run preview` | Prévisualiser le build en local                  |

---

## Ajouter un nouveau quartier

1. **Créer le dossier de scène**  
   `public/assets/scenes/<slug>/` (ex. `public/assets/scenes/saint-roch/`).

2. **Exporter le PSD** (voir « Export des calques PSD » plus bas) dans ce dossier pour obtenir `manifest.json` et `layers/*.png`.  
   Si vous ne le faites pas, l’app utilisera un manifest par défaut (calques de remplacement) jusqu’à l’ajout des vrais fichiers.

3. **Optionnel :** ajouter `ambient.mp3` dans le même dossier.

4. **Enregistrer le quartier** dans `src/data/neighborhoods/index.json` :

```json
{
  "id": "my-neighborhood",
  "name": "Mon quartier",
  "slug": "my-neighborhood",
  "description": "Courte description.",
  "scenePath": "/assets/scenes/my-neighborhood/manifest.json",
  "audioSrc": "/assets/scenes/my-neighborhood/ambient.mp3",
  "stories": ["my-story"],
  "position": { "x": 50, "y": 40 }
}
```

- `position.x` et `position.y` sont des pourcentages pour l’épingle sur la carte overworld (0–100).
- `stories` est un tableau de slugs d’histoires (noms de fichiers sans `.md`).

---

## Ajouter une nouvelle histoire

1. **Créer un fichier Markdown** dans `src/data/stories/`, ex. `src/data/stories/my-story.md` :

```markdown
---
title: Titre de mon histoire
neighborhood: my-neighborhood
audioSrc: /assets/scenes/my-neighborhood/ambient.mp3
order: 1
---

Le corps de l’histoire en Markdown.
```

2. **La lier au quartier** en ajoutant son slug au tableau `stories` dans `src/data/neighborhoods/index.json` (voir ci-dessus).

---

## Export des calques PSD

Utiliser le script Node pour exporter les images des calques et un manifest depuis un fichier Photoshop :

```bash
node tools/psd-export.mjs <chemin-vers-fichier.psd> [dossier-sortie]
```

Exemple :

```bash
node tools/psd-export.mjs ./designs/saint-roch.psd ./public/assets/scenes/saint-roch
```

Cela va :

- Créer `dossier-sortie/layers/` et exporter chaque calque visible en PNG.
- Écrire `dossier-sortie/manifest.json` avec la taille du canvas et les données par calque : `name`, `file`, `zIndex`, `position` (pourcent), `parallaxSpeed`, `interactive`.

Vous pouvez ensuite éditer `manifest.json` pour mettre `interactive: true` et ajouter `interaction` (ex. `type: "navigate"`, `target: "/story/my-story"`, optionnel `hoverImage`) pour les zones cliquables.

---

## Ajouter un nouveau sketch p5

1. **Créer le sketch** dans `src/sketches/`, ex. `src/sketches/rain.ts`, en exportant une fonction par défaut qui prend un conteneur et retourne la fonction sketch p5 (voir `snow.ts` pour le modèle).

2. **L’enregistrer** dans `src/sketches/index.ts` :

```ts
const sketchLoaders = {
  snow: () => import("./snow"),
  rain: () => import("./rain"),
};
```

3. **L’utiliser dans une scène** avec `<SketchCanvas sketch="rain" />` (ex. dans un slot de `SceneRenderer`).

---

## Styles (SCSS)

- **Variables :** `src/styles/_variables.scss` (`$color-bg`, `$color-accent`, `$font-primary`, etc.). Elles sont injectées automatiquement via la config Astro.
- **Mixins :** `src/styles/_mixins.scss` (ex. `flex-center`, `absolute-fill`). Également injectés automatiquement.
- **Conventions :** Privilégier des noms de blocs type BEM (ex. `.scene`, `.scene__layer-container`, `.zone--navigate`). Garder le layout/positionnement des calques et zones de scène dans `SceneRenderer.astro` ; les composants enfants gèrent uniquement leur rendu (ex. hover).

---

## Contribuer

Pour ajouter ou modifier du contenu :

- **Scènes et images** — Utiliser le workflow d’export PSD et placer les assets dans `public/assets/scenes/<slug>/`.
- **Histoires** — Ajouter ou modifier du Markdown dans `src/data/stories/` et les référencer dans `src/data/neighborhoods/index.json`.
- **Audio** — Placer `ambient.mp3` (ou autres fichiers) dans le dossier de scène et définir `audioSrc` dans le quartier ou le frontmatter de l’histoire.
- **Nouveaux quartiers** — Ajouter une entrée dans `src/data/neighborhoods/index.json` et s’assurer que le dossier de scène et le manifest existent (ou s’appuyer sur le manifest par défaut en attendant).

Lancer `npm run dev` pour travailler en local et `npm run build` pour vérifier un build de production.
