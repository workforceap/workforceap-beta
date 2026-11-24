# Firewall Defender 3D (WAP Practice prototype)

Local prototype only. Original lesson, `providerLessonId: null`, not course credit, not reviewed, no AI calls, no production wiring, fictional data only (RFC 5737 addresses, `.test` domains), not published.

Topic: beginner cybersecurity (curriculum programs 3, 13 and 14 are the security tracks). 3 stages and a boss:

| Stage | Traffic | Concept taught |
|---|---|---|
| 1 Port Patrol | TCP/UDP packets | Rules match by port and protocol; deny by default |
| 2 Source Control | packets | First matching rule wins; source range and order matter |
| 3 Phish Filter | envelopes | Judge by evidence: sender domain, where the link really goes; urgency alone is not proof |
| 4 Boss: Stolen Keys | packets, envelopes, logins | Blocking a port does not fix a compromised account; reset it |

## Run
Any static server from this folder (serve `.mjs` as JavaScript), then open `index.html`. No build, no npm install.

## Controls
Click an incoming traffic item (or a row in the In-flight list), then click a pad (`Allow` / `Block` / `Reset`) in 3D or the buttons. Keys: arrows or `N` / `Shift+N` select, `A` allow, `B` block, `R` reset, `P` pause, `T` text mode, `M` sound, Quality buttons (`Low` / `Medium` / `High`, default `Medium`). Sound is off by default.
Selected traffic items have a yellow ring (`#ffe066`) and the prompt names the selected item. Feedback carries a `Previous packet` tag so a resolved call is never confused with the newly selected item's highlighted policy rule.

## Files
- `rules.mjs` — pure rules engine (no DOM). Save key `wap-practice-3d-security-save-v1`, validated by `validateSave`.
- `look.mjs` — procedural PBR material/lighting/PMREM/quality-ladder kit (vendored `three.module.min.js` 0.187.0; no external models, textures, or HDRs).
- `scene.mjs` — semi-real security gateway appliance + light barrier + protected server room + weighted 3D packet/envelope/login meshes. Right calls trigger a cyan/green shield burst; wrong calls and timeouts trigger a red wireframe cage + X bars on the object AND a red scar + X on the firewall barrier.
- `game.mjs` — UI, quality toggle, traffic wording, timer/XP/Best-stars explanation, reduced-motion and WebGL-off fallback.

## Tests
- `node --test rules.test.mjs` (34/34 unit tests)
- `PLAYWRIGHT_MODULE_PATH=<.../playwright> CHROME_PATH=<chrome.exe> node browser-check.mjs` (headed Chrome at 1280×900, 390×844, and 320×640: quality toggle, real startup low-end GPU detection, real render(dt) frame-budget downgrade, pause and document.hidden loop stop, zero resource growth across 3 live-item retries, pixel variance + luminance range, real 3D canvas click picking on item and floor-plate pad, wrong-call 3D marker + `Previous packet` tag, timeout lose + retry, keyboard-only stage 1, `#ffe066` selection ring, email domain & key hints >= 12 CSS px, boss login label >= 12 CSS px, pad bases clear of canvas bottom, feedback + selected evidence + Allow/Block/Reset above the 320×640 and 390×844 fold, reduced-motion outcomes, full 4-stage WebGL-off fallback, zero console/page/network errors).

## Frame time (measured on this PC, headed Chrome 1280×900, Arc B570 only)
- GPU: `ANGLE (Intel, Intel(R) Arc(TM) B570 Graphics Direct3D11)`
- Rigel's independent uncapped probe (vsync off) on prior head: Firewall Defender ~0.5/1.0 ms RAF. This round did not re-run the 300-frame probe; other GPUs remain unverified.
- Other GPUs, integrated laptop GPUs, mobile GPUs, and non-Chrome browsers are **unverified**.

## Not verified
Other GPUs (integrated/mobile GPUs), non-Chrome browsers (Firefox/Safari), real touch hardware, assistive screen readers, and instructional review of the lesson copy.
