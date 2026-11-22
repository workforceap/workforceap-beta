# Packet Quest 3D (WAP Practice prototype)

Local prototype only. Original lesson, `providerLessonId: null`, not course credit, not reviewed, no AI calls, no production wiring, fictional data only, not published.

## Run
Any static server from this folder, e.g. `npx http-server .` or `python -m http.server`, then open `index.html`. (Serve `.mjs` as JavaScript.)

## Files
- `rules.mjs` — pure rules engine (`packet-quest-3d-v1`). Teaching rules: DNS lookup is separate from the page request; ping is not proof the page loads; gateway carries non-local traffic; same-subnet traffic crosses the switch only. Save key `wap-practice-3d-save-v1`, validated by `validateSave`.
- `look.mjs` — procedural PBR material/lighting/PMREM/quality-ladder kit (vendored `three.module.min.js` 0.187.0; no external models, textures, or HDRs).
- `scene.mjs` — semi-real server-room diorama: `MeshStandardMaterial` / `MeshPhysicalMaterial`, key light with soft shadows + fill + rim light, code-generated PMREM environment, ACES filmic tone mapping, sRGB output, pixel ratio capped at 2. Beveled rack/switch/router/server/desk/monitor/keyboard with sagging rubber cables, port rows, blinking LEDs, distinct colored-and-shaped hop lanes (including a separate DNS side path), numbered hop badges on the active route, and a visible boss glitch cage + scanbars on faulted devices.
- `game.mjs` — UI, quality toggle (`Low` / `Medium` / `High`, default `Medium`), cable legend, keyboard/button/3D picking, reduced-motion and WebGL-off text-mode fallback.

## Controls
Arrows pick a device, Enter selects (route tool) or repairs (repair tool), W toggles repair tool, L launch, P pause, T text mode, M sound, Quality buttons (`Low` / `Medium` / `High`). Every 3D action is also a button and a key.

## Tests
- `node --test rules.test.mjs` (6/6 unit tests)
- `PLAYWRIGHT_MODULE_PATH=<.../playwright> CHROME_PATH=<chrome.exe> node browser-check.mjs` (headed Chrome at 1280×900, 390×844, and 320×640: quality toggle, real startup low-end GPU detection, real render(dt) frame-budget downgrade, pause and document.hidden loop stop, zero resource growth across 3 retries, pixel variance + luminance range, real 3D canvas click picking, wrong-hop 3D red marker, lose-on-3-mistakes, ping-does-not-win, keyboard-only stage 1, hop badges, boss glitch effect, DNS side path with leader stem, in-scene labels >= 12 CSS px with zero overlap, reduced motion, full 3-stage WebGL-off fallback, zero console/page/network errors).

## Frame time (measured on this PC, headed Chrome 1280×900, Arc B570 only)
- GPU: `ANGLE (Intel, Intel(R) Arc(TM) B570 Graphics Direct3D11)`
- Rigel's independent uncapped probe (vsync off) on prior head: Packet Quest Low/High ~1.2/1.5 ms RAF. This round did not re-run the 300-frame probe; other GPUs remain unverified.
- Other GPUs, integrated laptop GPUs, mobile GPUs, and non-Chrome browsers are **unverified**.

## Not verified
Other GPUs (integrated/mobile GPUs), non-Chrome browsers (Firefox/Safari), real touch hardware, assistive screen readers, and instructional review of the lesson copy.
