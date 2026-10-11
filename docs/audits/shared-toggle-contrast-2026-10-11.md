# Shared Toggle contrast — WAP-297

The shared kit Toggle's unchecked thumb blends into its track: Chromium measured
1.154:1 in light and 1.109:1 in dark, identically in warm and dense surfaces.
The input remains a labeled native checkbox, but the visible thumb position is
hard to distinguish for users with reduced vision. This predates the WAP-296
Profile layout change.

The fix changes only `.wa-kit-toggle-track`'s default background from the
low-contrast decorative `--wa-track` to the existing interactive
`--wa-control-border` token. The unchecked thumb/track pair measures 3.690:1 in
light and 5.294:1 in dark. The checked accent pair retains 6.473:1 and 5.479:1.
Do not change the global track token, which other decorative tracks consume.

Source consumers are member Profile, partner notification preferences, admin
feature flags, counselor roster's At-risk only filter and Resume Rewriter's ATS
keywords option. This is one shared CSS change; no API or data mutation changes.

`tests/e2e/kit-toggle-contrast.spec.ts` measures rendered colors, rather than
asserting a token name. It covers both states, themes and surface modes, the
44px label hit target, accessible checked state/name, keyboard focus ring and
zero thumb transition under reduced motion. It fails on the original unchecked
pair and passes on the patch. Browser screenshots and computed evidence are
recorded at `/workspace/artifacts/wap-sitewide-uiux-20261011/shared/`:
`switch-evidence.json` contains the baseline and browser-only candidate receipts;
`toggle-{light,dark}-{baseline,candidate}-{warm-focus,dense}.png` show the control.
Final source-patch screenshots and regression receipts use the `patched-*` prefix.

These checks use synthetic local fixtures without database/auth/provider access.
Outbound requests and writes are blocked. They establish rendered controls and
keyboard behavior, not authenticated settings saves or whole-platform compliance.
Release sequencing and hosted checks are recorded by the release coordinator.
