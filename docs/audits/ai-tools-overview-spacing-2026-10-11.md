# AI Career Tools overview spacing — 2026-10-11

The reported Resume / Interview / Profile copy is in `ToolkitPanel`, the All
Tools tab of `VoiceStudioKit`. This check used the existing
`/dev/member/toolkit?tab=toolkit&agent=resume` fixture, which renders the same
component, portal shell and stylesheet chain as the member hub. The source base
was `25b5ea57efeee426eca51813ebb00d9e6f33b901`.

## Reproduced cause

The original `min-width: 900px` viewport query created three columns even when
the expanded portal rail left only 716px of content at a 1024px window. Each
column was 226.7px wide, squeezing tool titles and clamping descriptions.
At 1024, 1280 and 1440, in both themes, the absolutely positioned connector
at 14px below the stage top intersected all three stage heading text boxes.
The heading/list gap was 10.39px and the heading/subtitle gap was 2.4px.
At 320px, the jump strip also clipped labels beside their numbered circles.

## Change

- Promote the three columns only when the toolkit container has 900px of
  available width. The base layout stays stacked without container queries.
- Keep desktop numbers and the connector above the stage heading copy.
- Use `--wa-pad-sm` for stage/list separation and row padding, with token-derived
  gaps between related copy. Overview descriptions wrap fully; both clamp
  properties are explicitly reset.
- Stack numbers above labels in the narrow jump strip, retaining its anchor
  destinations and touch targets.
- Scope row overrides to `.wa-kit-toolkit`; Career brief's shared base row/list
  styling remains unchanged. Component edits are documentation only.

## Browser evidence

System Chromium checked 12 original layout cases and 24 final scenarios. The
core matrix covered both light and dark themes:

| Window width | Available toolkit width | Final stages |
| --- | --- | --- |
| 320 | 252 | Stacked |
| 375 | 307 | Stacked |
| 768 | 700 | Stacked |
| 1024 | 716 | Stacked |
| 1280 | 972 | Three 312px columns |
| 1440 | 1132 | Three 365.3px columns |

Additional cases covered both themes with the following:

- A 1100px window with the saved expanded/collapsed rail preference: 792px
  stacks, while 952px uses three columns. This verifies content width rather
  than window width controls the layout.
- A 200% desktop zoom equivalent: 512 CSS pixels at device scale 2, equivalent
  to a 1024px window at 200%, leaving a 444px toolkit.
- Spanish locale cookies at 375 and 1024. Spanish shell/guidance rendered; the
  existing directory labels/descriptions remain English constants. This change
  does not claim to translate that copy.
- Disabling the size container at 1440 to simulate the CSS fallback: all stages
  stack and the jump strip remains available. This is a fallback simulation in
  Chromium, not certification of another browser engine.

All final scenarios returned 200 with no document overflow or heading/connector
intersections. All 13 tool titles, descriptions, destination hrefs and tags were
retained, with full text bounds inside their rows and no title/tag overlap.
Visible jump labels fit their targets, and 54 keyboard Enter anchor jumps reached
visible stage headings. Visibility checks use actual bounds and ancestor
visibility, rather than the inner list's computed display alone.

A synthetic Career brief next-action row outside the overview retained identical
computed row/body/description styles across the six matching viewport widths
in each theme. This checks the shared styling boundary, not an authenticated
Career brief journey. No source-mirroring tests were added for this CSS change.

There were no page exceptions or `MISSING_MESSAGE` / `aiToolsDiscovery` console
errors. The console was not completely clean: the harness deliberately blocked
Google Tag Manager and Vercel analytics/speed-insights requests, producing
`net::ERR_FAILED`. Signed-out fixture requests to help chat, notifications and
nav badges sometimes returned 401. Sanitized request locations and per-case
counts are retained in the browser measurements.

Before/after screenshots, measurements, the reproducible browser script and gate
logs are retained under `/workspace/artifacts/ai-tools-spacing-20261011/`.
The fixture uses a disposable loopback database. Provider traffic and writes
are blocked; there were no member mutations, sessions, applications or messages.
Real member authentication and Safari/iPhone behavior were not certified.
