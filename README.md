# A/P x Deadly Soul Shopify themes

Two Shopify themes for the A/P and Deadly Soul clothing brands, plus a preview that runs them outside Shopify on a fake store.

| Theme | Folder | Look |
| --- | --- | --- |
| A/P x Deadly Soul | `Shopify-Themes/ap-x-deadly-soul-theme-1101` | Dark, holographic, game-inspired |
| Volume Studio | `Shopify-Themes/volume-studio-shopify-theme` | Bright orange and cream, with soft curves |

Both include 3D product models, a floating 3D model on the homepage, a Fit Lab and a gallery.

## Run it locally

Requires Node 20 or newer.

```bash
npm install
npm start
```

- A/P x Deadly Soul: http://localhost:4101
- Volume Studio: http://localhost:4102

Add `/__pages` to either address for a list of every page. Pages refresh when you save a theme file. Fake store data is in `Shopify-Themes/local-preview/mock-store.json`.

## Project layout

```
api/index.js              Vercel entry point
vercel.json               Vercel routing and included files
Shopify-Themes/
  ap-x-deadly-soul-theme-1101/
  volume-studio-shopify-theme/
  local-preview/          Preview server and fake store data
product-mockups/png/      Colour-option product images used by the preview
```

## Deploy the preview to Vercel

Each Vercel project serves one theme, so create two projects from this repo. No build settings need changing.

| Project | Environment variable |
| --- | --- |
| A/P x Deadly Soul | `THEME` = `ap` |
| Volume Studio | `THEME` = `volume` |

The hosted preview uses fake data. Checkout shows a notice, newsletter signups aren't saved, and each visitor's cart is kept in a browser cookie. Pages are marked `noindex` so they stay out of search results.

## Build the themes for Shopify

Vercel only hosts the preview. The live store runs on Shopify, so zip a theme with its folders at the top level of the zip:

```bash
mkdir -p Shopify-Themes/exports
cd Shopify-Themes/volume-studio-shopify-theme
zip -r -X ../exports/volume-studio-theme.zip assets config layout locales sections snippets templates -x '*.DS_Store'
```

Use the same command in the other theme folder, changing the zip name. Then upload it under Online Store > Themes > Add theme > Upload zip file.

The store also needs:

- **Products:** the catalogue, with the same handles as `mock-store.json`.
- **Collections:** handles `ap` and `deadly-soul`.
- **Pages:** handles `about`, `fit-lab` and `gallery`, using the templates `page.about`, `page.fit-lab` and `page.gallery`.

## Not in this repo

These stay on the original machine, either because of their size or because the site doesn't use them:

- `glb-files/`: original 3D models, about 60 MB each. The themes contain copies compressed to about 1 MB.
- `Source/`: client source files, including the product CSV.
- `fit-lab-models/`, `3d-cloth-website-2/`, and other unused mockups.
- `Shopify-Themes/exports/`: built theme zips.
# 3d-fashion-website
