# WAP Practice Arcade kit: developer notes

For people (or agents) who change the kit. Game authors only need `AUTHORING.md`.
The signatures below were taken from the code on 2026-11-15; the code is the truth if they drift.

## File map

| Path | What it is |
|---|---|
| `index.html`, `hub.mjs`, `hub.css` | Hub page: one card per program game, from `games/registry.mjs`. No 3D. |
| `play.html` | The game page. Only boots `kit/shell.mjs`. |
| `kit/shell.mjs`, `kit/ui.css` | All DOM screens (map, coach card, play sheet, feedback, results, settings, text mode), hearts, stars, streak, saving, sound, and the `window.__arcade` test hook. |
| `kit/engine.mjs` | Renderer, camera (focus solver, punch, shake, idle drift, insets), quality ladder, tap picking, frame loop. |
| `kit/look.mjs` | Moods, lights, materials, `accentSet`, text textures, `kit.label`. |
| `kit/mechanics/<id>.mjs` | The five mechanics: `gate`, `sort`, `order`, `lane`, `match`. Pure rules plus a 3D view. Tests beside each. |
| `kit/worlds/<id>.mjs` | The nine worlds. `react.mjs` wraps each so it flashes on right and wrong answers. |
| `kit/props.mjs`, `kit/props2.mjs` | The 26 prop builders (ids are listed in `schema.mjs` as `PROP_IDS`). |
| `kit/schema.mjs` | `validateGame(def)` and `LIMITS`. Pure, no DOM. |
| `kit/dev/lab.html` | Dev-only preview page for worlds, moods, props and camera focus boxes. |
| `games/<id>/game.mjs` | Data-only game definitions. `games/registry.mjs` lists the 20 program games for the hub. |
| `data/source/*.json` | Course packs extracted from the repo's curriculum files by `tools/extract-content.mjs`. |
| `data/lesson-map.json` | Written by `validate --all`: every program course mapped to its game and level. |
| `tools/` | `serve`, `validate`, `smoke`, `sheet`, `hub-check`, `browser`. See `tools/README.md`. |

## Engine (`createEngine(canvas, {reduced, quality, mood, accent, onLost, onQuality, onPick})`)

- `STAGE = {x0:-3, x1:3, z0:-6, z1:2, top:1.7}`. +z is toward the camera. Worlds keep this volume clear.
- `engine.setFocus(box | null, opts)`: box `{x0, x1, z0, z1, y0 = 0, y1 = 1.2}`, opts `{pitch = 40 (25..65), yaw = 0 (-20..20), margin = .06, ease = .6}`.
  Fits the box in the canvas at any aspect ratio; re-solved on resize; `null` is the whole stage. Snaps under reduced motion.
- `engine.setInsets(...)`: the shell tells the engine how much of the canvas a sheet covers, so the action stays in the visible band.
- `engine.punch(amount)`, `engine.shake(amount)`, `engine.flash(...)`: camera and light feedback. All calm or off under reduced motion.
- `engine.pxPerUnit(vector3)`: CSS px per world unit at a point. On-screen text height is `label.fontSize * engine.pxPerUnit(pos)`.
- `engine.setAccent(hex)`, `engine.setMood(id)`, `engine.accent`, `engine.focus`, `engine.view`, `engine.kit`, `engine.reduced`, `engine.quality`.
- Frame dt is never negative or NaN and is capped at 0.05 s. Pixel ratio is capped at 2. A lost WebGL context calls `onLost` (the shell switches to text mode).

## Look

- Moods: `day`, `dusk`, `night` (`MOODS`, `moodOf`). Each has sky, fog, exposure, light settings and `glow`, a suggested multiplier for accent emissive strength.
- `accentSet(hex) -> {hex, base, bright, dark, soft}` (THREE.Color values).
- `kit.label(text, opts) -> THREE.Group` with `.setText(text)`, `.dispose()`, `.fontSize`, `.lines`. Word-wraps, never cuts text.
  opts: `w`, `h` (world units), `maxLines`, `billboard` (`false | true | 'y'`), `bg`, `fg`, `accent`, `align`, `maxFont`, `minFont`, `depth`, `back`, `lit`.
  Use it for every 3D sign so text looks the same everywhere.

## Mechanic plugin

```
{id, label, howTo(level) -> string[],
 rules: {init(level, {seed, timed}), view(state), act(state, choiceId), tick(state, dt), hint(state), done(state)},
 createView(ctx) -> {sync(state), event(ev), update(dt), dispose()}}
```

- `view(state)` returns `{card: {title, lines, kicker?} | null, prompt, choices: [{id, label, done, kind?}], progress: {done, total}, timer: {left, total} | null}`.
  A choice with `kind: 'secondary'` is a quiet text button with no number (match uses it for "Pick a different one"); `hint()` never returns it.
- `act` and `tick` return `{state, events}`. Events: `right` (with `why`; the shell adds `streak`), `wrong` and `timeout` (with `correctLabel`, `why`, `review`), `step`, `round`, `done`.
  The shell also sends `{type: 'resume'}` to the view when a blocking feedback sheet is dismissed: hold the wrong state until then.
- View ctx: `{THREE, engine, look, world, theme, level, props, reduced, accent}`. Tappable 3D objects set `userData.choiceId`.
- Rules are pure and seeded. Mechanics never touch the DOM. The shell owns hearts (three mistakes end the level), stars, the streak, the sheet and saving.
- gate and sort honour a per-item `prop` (`item.prop || level.prop || 'block'`).

## World plugin

`{id, label, build(ctx) -> {group, update?(dt), event?(ev), dispose?()}}` with ctx `{THREE, look, kit, theme, quality, mood, reduced, accent}`.

## Shell

- URL: `play.html?game=<id>[&level=<level-id>][&text=1][&world=][&mood=][&accent=rrggbb][&quality=low|medium|high]`.
- Storage (all best effort): `wap-arcade-v1:<game-id>` = `{best: {<level-id>: stars}}`, `wap-arcade-v1:settings`, `wap-arcade-v1:last` = `{game, level}`.
- First level of a game is untimed; others give about 20 s per decision unless "No timer" is on. Text mode is untimed. Time stops while any sheet is open and when the tab is hidden.
- Keys: 1-6 pick, arrows move between choices, Enter or Space confirms, Escape or P pauses.
- Test hook `window.__arcade`: `ready`, `error`, `screen()`, `levelIds()`, `startLevel(id)`, `begin()`, `view()`, `hint()`, `choose(id)`, `dismiss()`, `result()`, `textMode()`, `glOk()`; debug extras `pause()`, `resume()`, `quality()`, `stats()`, `engine()`, `streak()`. The smoke tool drives the game only through this.

## Checks

Run from the arcade root with Node 24. No installs, no network.

```
node --test kit/schema.test.mjs kit/mechanics/*.test.mjs kit/worlds/*.test.mjs kit/dev/*.test.mjs
node tools/validate.mjs --all            # schema, one level per course, writes data/lesson-map.json
node tools/smoke.mjs <game-id> [--quick] # plays every level in a headless browser, screenshots into evidence/<game-id>/
node tools/smoke.mjs --all --jobs 4
node tools/sheet.mjs <game-id>           # contact sheets of the play screenshots
node tools/hub-check.mjs                 # hub page checks and screenshots
node tools/serve.mjs [port] [--host 0.0.0.0]   # default 127.0.0.1:8770
```

The headless browser uses the machine's real GPU by default; `ARCADE_SOFTWARE_GL=1` forces the software renderer and
`ARCADE_EVIDENCE=<dir>` sends screenshots somewhere else.
