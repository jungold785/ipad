# Repository Guidelines

## What This Project Is

`ipad` is a desk-widget dashboard for a **2013 iPad Air running iOS 12.5.7**
(2048 x 1536, landscape). It is a static site with **no build step and no npm
dependencies** - plain ES modules served as-is.

## Project Structure & Module Organization

```
docs/                  # the site root; this is what gets deployed
  index.html
  config.js            # runtime settings, edited by the user
  styles/main.css
  src/main.js          # layout builder and widget registry
  src/core/            # dom, format, storage helpers
  src/modules/<name>/  # one folder per widget: index.js
  photos/              # images plus manifest.json
  icons/
scripts/               # Node helpers, run on the machine or in CI
.github/workflows/     # GitHub Pages deployment
```

A widget exports an object with `id`, `area` (`main`, `side`, `strip`),
optional `title`/`grow`, and `mount(panel)` plus `tick()`. Widgets never import
each other; shared logic belongs in `src/core/`.

## Development Commands

- `python -m http.server 8000 --directory docs` - local preview, no install
- `node scripts/check-compat.mjs` - fail on iOS 12 unsupported browser features
- `node scripts/generate-assets.mjs` - regenerate icons and placeholder photos
- `node scripts/fetch-rss.mjs` - refresh `docs/data/rss.json`
- `scripts/deploy.ps1` - publish to GitHub Pages (login, commit, push, enable)

Open `http://<lan-ip>:8000` on the iPad over the same Wi-Fi. There is nothing
to compile.

## Coding Style & Naming Conventions

- ES5-flavoured JavaScript: `var`, `function`, string concatenation
- 2-space indent, single quotes, semicolons
- Files `camelCase.js`; widget folders `kebab-case/`
- Build DOM with the `h()` helper instead of `innerHTML`
- Colours come from CSS custom properties in `styles/main.css`

## Platform Constraints (iOS 12 Safari)

Hard requirements. Safari 12 lacks optional chaining, `??`, `dvh`/`svh`,
flexbox `gap`, CSS nesting, `:is()`, `aspect-ratio` and `clamp()`. Always
prefix `backdrop-filter` with `-webkit-`. The dashboard must stay usable
offline; only live widgets (weather, GitHub, RSS) touch the network.

## Testing Guidelines

There is no test runner yet. Run `node scripts/check-compat.mjs` before
committing, then verify by loading the page in Chrome plus a real Safari on
the iPad, at 1024 x 768 CSS pixels. Check every widget renders, the todo
persists across reloads, and the layout survives a portrait rotation.

## Commit & Pull Request Guidelines

Use Conventional Commits: `feat(widgets): add clock`, `fix(styles): align 4:3
layout`. One logical change per commit.

Pull requests need a short description and a screenshot captured **on the
iPad**, plus a note if the change affects the iOS 12 constraints above.

## Security & Configuration Tips

`docs/config.js` is served to the browser, so it must never contain secrets.
Machine-specific overrides go in `docs/config.local.js`, which is git-ignored.

