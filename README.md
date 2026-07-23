# Games

Small browser games. Static HTML, CSS, and ES modules — no framework, no build step,
no dependencies. Deployed on Cloudflare Workers as static assets.

## Structure

```
.
├── wrangler.jsonc        Cloudflare config; serves ./games as the site root
├── package.json          pins wrangler; no runtime dependencies
├── README.md
├── .gitignore
└── games/                everything below here is published
    ├── index.html        hub page listing every game
    ├── 404.html          custom not-found page
    ├── _headers          response headers
    ├── assets/
    │   └── theme.css     shared tokens and site chrome
    ├── 2048/             built
    │   ├── index.html    markup only
    │   ├── game.css      board and tile styles
    │   ├── engine.js     pure rules, no DOM
    │   └── main.js       renderer, input, accessibility
    ├── tic-tac-toe/      placeholder
    │   └── index.html
    ├── ludo/             placeholder
    │   └── index.html
    └── chess/            placeholder
        └── index.html
```

`games/` is the web root, not a path segment — `games/2048/` is served at `/2048/`.
Every link in the HTML is absolute (`/assets/theme.css`, `/2048/`) and depends on
that, so the directory is only ever moved by also changing `assets.directory` in
`wrangler.jsonc`. Anything placed inside `games/` is publicly reachable.

Each game is a folder with its own `index.html`, so it gets a clean path: `/2048/`,
`/chess/`, and so on. Nothing is shared between games except `assets/theme.css`,
which means one game can never break another.

## Local development

The games use ES modules, which browsers refuse to load over `file://`. Serve
`games/` — not the repo root — so the absolute paths resolve:

```sh
npm install   # once
npm run dev   # wrangler dev, matches production behaviour
```

Or without Node at all, since there is nothing to build:

```sh
python3 -m http.server 8000 --directory games
```

Then open the printed URL (`http://localhost:8000` for the Python one). The Python
server won't apply `_headers` or the custom 404 — use `npm run dev` to check those.

## Deploying

The repo is connected to Cloudflare Workers Builds, so every push to `main`
deploys. `wrangler.jsonc` is the whole configuration: there is no build command
and nothing to compile, so the build just uploads `games/`.

`wrangler` is pinned to an exact version in `package.json` rather than floating,
so a wrangler release can't change a build nobody touched. Upgrading is a
deliberate edit to that version, not something that happens on the next push.

`_headers` sets response headers, and `not_found_handling: "404-page"` is what
makes `404.html` serve on an unknown path — without it Workers returns a bare 404.

To deploy from your machine instead:

```sh
npx wrangler deploy
```

## Adding a game

Every game implements the same contract, which is what keeps this repo from turning
into four unrelated apps:

```js
export function newGame()             // -> state
export function apply(state, move)    // -> new state, pure
export function legalMoves(state)     // -> Move[]
export function stuck(state)          // -> boolean
```

The engine never touches the DOM. `main.js` reads state and writes to the page.
That split is what makes undo a state stack, makes an AI opponent a search over
`apply`, and makes the rules testable without a browser.

Steps:

1. `mkdir games/<game>` and copy `games/2048/index.html` as a starting shell.
2. Write `engine.js` first, with no DOM references at all.
3. Write `main.js` to render it.
4. Change the entry in `games/index.html` from `Soon` to `Play`.

## Theme

Monochrome. Hairline borders, system font stack, tabular numerals. No gradients,
no shadows, no rounded corners, no colour beyond ink and paper. Dark mode follows
the operating system via `prefers-color-scheme`.

All tokens live at the top of `games/assets/theme.css`. Changing the five colour
variables there restyles every game at once.

## Accessibility

Not optional here — it's the reason the games render as DOM elements rather than
`<canvas>`. Each game ships with:

- full keyboard control, with visible focus rings
- a live region announcing score and state changes
- a hidden text mirror of the board that screen readers can browse
- `prefers-reduced-motion` support

## Licence

MIT.
