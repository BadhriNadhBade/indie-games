# Games

Small browser games. Static HTML, CSS, and ES modules — no framework, no build
step, no dependencies. Deployed on Cloudflare Workers as static assets.

Live at [play.badhrinadh.com](https://play.badhrinadh.com).

## Layout

```
wrangler.jsonc     Cloudflare config; serves ./games as the site root
package.json       pins wrangler; no runtime dependencies
games/             everything below here is published
├── index.html     hub page       ├── assets/theme.css   shared styles
├── 404.html       not-found      ├── _headers           response headers
└── 2048/  tic-tac-toe/  built — ludo/ and chess/ are placeholders
```

In tic-tac-toe the opponent is `badhri`, exported from its `engine.js`: a minimax
search over `apply` that plays every position out to the end, so it can't be
beaten and a draw is the best result available.

- **`games/` is the web root, not a path segment** — `games/2048/` serves at
  `/2048/`. Links in the HTML are absolute (`/assets/theme.css`), so moving the
  directory means also changing `assets.directory` in `wrangler.jsonc`.
- Anything inside `games/` is publicly reachable.
- Each game is a self-contained folder. Only `assets/theme.css` is shared, so one
  game can't break another.

## Local development

ES modules won't load over `file://`, so serve it over HTTP:

```sh
npm install && npm run dev     # wrangler dev — matches production
```

Or without Node: `python3 -m http.server 8000 --directory games`. That skips
`_headers` and the custom 404, so use `npm run dev` to check those.

## Deploying

- Every push to `main` deploys via Cloudflare Workers Builds. No build command —
  the build just uploads `games/`.
- Non-production branches don't build, so pull requests get no preview URL.
- `wrangler` is pinned to an exact version so a release can't change a build
  nobody touched.
- `not_found_handling: "404-page"` is what makes `404.html` serve on unknown
  paths; without it Workers returns a bare 404.
- Manual deploy: `npx wrangler deploy`.

## Adding a game

`engine.js` holds the rules and never touches the DOM; `main.js` renders state to
the page. That split is what makes undo a state stack and the rules testable
without a browser.

```js
export function newGame()             // -> state
export function apply(state, move)    // -> new state, pure
export function legalMoves(state)     // -> Move[]
export function stuck(state)          // -> boolean
```

Copy `games/2048/index.html` as a shell, write `engine.js` first, then `main.js`,
then flip the entry in `games/index.html` from `Soon` to `Play`.

## Theme and accessibility

Monochrome — hairline borders, system fonts, tabular numerals, no gradients or
shadows. Dark mode follows the OS. All tokens are at the top of
`games/assets/theme.css`; changing five variables restyles every game.

Games render as DOM elements rather than `<canvas>` so they ship with full
keyboard control, a live region for score changes, a hidden text mirror of the
board for screen readers, and `prefers-reduced-motion` support.

## Licence

MIT.
