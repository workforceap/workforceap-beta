# WAP-298 mentor application foreground contrast

The public `/mentor/apply` instruction and Back link sat outside the white form card but used light-only marketing-depth foregrounds. On combined baseline `7c4c8e3ff3ced1b0f4e0d4cd37ab29ba147c9ee2`, actual dark 375 px screenshot samples measured the 15.2 px instruction at 3.441:1 and the 14 px Back link at 2.845:1. Normal text requires at least 4.5:1. [WAP-298](https://linear.app/mikebeezy/issue/WAP-298/mentor-application-restore-instruction-and-back-text-contrast-in-dark) records the finding and duplicate check.

The [instruction](../../app/mentor/apply/MentorApplyForm.tsx) now uses `--color-on-surface-variant`; [Back normal and hover](../../app/mentor/apply/mentor-apply.module.css) use the existing theme-aware `--color-marketing-rose-on-light`. The card's white surface, local label/field pairing, copy, required attributes, defaults, validation and submission handler remain intact. The candidate is based on merged WAP-297 (`42be2a95c697950cc9e3c5e84eb0f69ac1e32571`); no shared tokens are changed.

## Rendered verification

Actual Chromium checks compare baseline and candidate at 375 and 1440 × 900 in both themes. Each state includes normal, pointer hover and keyboard focus, with computed foregrounds, element bounds and viewport screenshots. Background samples are six pixels beyond the element's right edge, outside the four-pixel focus ring, on the local composited canvas.

| Theme | Instruction contrast | Back normal / hover / focus contrast |
| --- | --- | --- |
| Light | 9.315:1 | 4.949:1 |
| Dark | 10.840:1 | 8.173:1 |

All measured candidate pairs exceed 4.5:1 at both widths. Back retains its visible keyboard ring and its `/en/mentor` destination in the English fixture. Tab reaches Full Name next; an invalid submission keeps native required-field validation and sends no POST. The browser comparison checks the rendered form's field attributes, defaults, geometry, colors, surface and copy against baseline. These are public initial-state and validation checks, not provider-success or live submission acceptance.

Evidence is retained under `/workspace/artifacts/wap-sitewide-uiux-20261011/staff/`: `mentor-baseline-matrix.json`, `mentor-candidate-matrix.json`, `mentor-fix.cjs`, `mentor-matrix-contrast.py`, and `screenshots/mentor-{baseline,candidate}-{light,dark}-{375,1440}-{normal,hover,focus}.png`. Both isolated servers use placeholder database mode, loopback-only database/auth endpoints and empty provider settings. Fresh browser contexts allow only loopback GET/HEAD and explicitly guard API requests; no real member data or provider action is used.

Independent review, hosted CI and release acceptance remain separate gates. The wider staff audit inventories all 125 owned production page entries and distinguishes source-only, component-fixture, protected-route, auth-limited and data/state-limited coverage; this narrow fix does not close those coverage gaps.
