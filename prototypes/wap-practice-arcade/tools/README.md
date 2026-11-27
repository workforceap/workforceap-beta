# Arcade tools

Run everything from the arcade root with Node 24. No installs; there is no network use.

## serve.mjs
`node tools/serve.mjs [port] [--host 0.0.0.0]` serves the root as static files (default `127.0.0.1:8770`, `Cache-Control: no-store`). Open `http://127.0.0.1:8770/play.html?game=<game-id>`. Other tools import `startServer({port = 0, host})` and get `{url, port, close()}`.

## validate.mjs
`node tools/validate.mjs [game-id ... | --all] [--json]`
Checks each `games/<id>/game.mjs` against `kit/schema.mjs` (limits are exported as `LIMITS`) and, when `data/source/<id>.json` exists, that there is exactly one level per course, in order, with matching `courseSlug` and `courseTitle`. Prints errors, warnings, level count, mechanics and item count; exits 1 on any error. `--all` with everything passing also writes `data/lesson-map.json` (deep links `play.html?game=<id>&level=<level-id>`).

## smoke.mjs
`node tools/smoke.mjs <game-id ... | --all> [--levels a,b] [--no-shots] [--quick] [--jobs N]`

Starts one throwaway server and one headless Chromium (real GPU by default, see browser.mjs), then drives `play.html` only through `window.__arcade`. Games run in parallel (`--jobs N`, default 3): one browser context per page, one shared server, and a 60 s ready timeout. The WebGL renderer string is printed once at the start, with a note when it is a software renderer.

Per level, at 390x844: a perfect run (asserted 3 stars, 0 mistakes) with a mid-play check, then a replay whose first answer is one deliberate wrong pick (not `hint()`, not a `kind: 'secondary'` choice). That pick shows the blocking "Not quite" sheet, and the run is asserted at 2 stars. Mid-play, the same level is also shown at 360x640. After the levels: a perfect run at 1280x800 once per mechanic the game uses, then `?text=1`, then WebGL blocked (the shell must switch to text mode by itself).

Checks: console and page errors, failed requests, sideways scroll, vertical scroll during play, 44px touch targets, clipped text, a non-blank canvas, and, during play in 3D mode:
- the canvas is at least 150 CSS px tall (at 390x844 and 360x640);
- no element of the play screen has a bounding box outside the viewport (2 px tolerance);
- no choice button is clipped by an ancestor or overlaps another choice button.

`--quick` runs only the 390x844 pass per level (play and wrong shots; no 360, 1280, text or WebGL-blocked passes). Exit 1 if any game fails.

Evidence goes to `<evidence>/<game-id>/`, where `<evidence>` is `$ARCADE_EVIDENCE` if set, else `ROOT/evidence`. While iterating, always point it at your own folder so parallel runs do not overwrite each other. Files (all .png unless noted):
- `map-390`, `coach-390`, `text-390`, and `results-390` (the first level's perfect 3-star run)
- `play-<level>-390`, `play-<level>-360`, `wrong-<level>-390` for every level
- `play-<mechanic>-1280` once per mechanic
- `fail.png` on failure
- `report.json`: renderer string, per level the mechanic, the perfect and wrong results, timings and canvas heights in CSS px, the extra passes, the screenshot list and the error if any.

`--no-shots` writes none of these.

`node tools/smoke.mjs --self-test` proves the browser path with a fake `__arcade` page that the browser serves itself, so it works with any `ARCADE_EVIDENCE`. It then runs the layout checks on deliberately broken pages (an element outside the viewport, a clipped choice button, overlapping choice buttons, a too-short canvas) and asserts that each one is reported, and that a clean page reports nothing (`_layout-checks` row). `--keep` leaves `<evidence>/_selftest/index.html` behind.

## sheet.mjs
`node tools/sheet.mjs <game-id ...> [--out dir]`

Builds `sheet-390.png` and `sheet-360.png`: a contact sheet of every `play-*-390.png` (and `-360`) of the game, 260 px wide thumbnails in rows of up to 5, the level id under each. It loads the PNGs in a headless page and screenshots it. It reads the same evidence folder as smoke (`ARCADE_EVIDENCE` honoured) and writes next to the shots, or into `<dir>/<game-id>/` with `--out`. Run smoke first.

## browser.mjs
`launch()` returns a playwright-core chromium browser on the machine's real GPU (D3D11 via ANGLE). `ARCADE_SOFTWARE_GL=1` or `launch({software: true})` forces the slow software renderer, which is also the fallback if the GPU launch fails. It uses `PLAYWRIGHT_CORE` if set, else the first `C:/Users/mabro/workforceap-beta/.worktrees/*/node_modules/.pnpm/playwright-core@*/node_modules/playwright-core`, and throws a clear error if none exists. `glRenderer(page)` returns the WebGL renderer string a page gets, and `isSoftwareRenderer(str)` spots SwiftShader and similar. Judge visuals from GPU screenshots only.
