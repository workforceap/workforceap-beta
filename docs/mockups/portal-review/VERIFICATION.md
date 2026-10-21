# Verification receipt

This receipt describes the portable **synthetic design review**, not authenticated application acceptance.

- Repository base: `efc27e4a4ebeba09b5261e7b1c36463d01925017`.
- Generated HTML SHA-256: `7bb49b0b7137895c1d9e17a9e607789db7fd46212570f699bbb7e69189df2984`.
- Full browser matrix: **1,596 passed**, zero failed: 266 route contracts at 375/768/1440 px in light and dark themes, reduced motion enabled.
- Local interaction regressions: **21 passed**, zero failed.
- Browser page errors: **0**; external requests: **0**.
- Independent model suite: **16 passed**, zero failed.
- Route inventory: 266 source blobs matched the pinned base; missing, duplicate and invented-route fixtures are rejected.
- Journey contracts: 15 scenarios / 70 steps, all source routes valid; 80 source references checked.
- Domain schemas: 156 route definitions / 133 families / 354 synthetic rows, with 382 existing source paths.
- Knowledge tools: 18 Node tests and 12 Python tests passed. Knowledge verification checked 8,283 local links with zero failures.

The unchanged repository prepush uses `--passWithNoTests` for its related Vitest selection. This docs-only directory selects no application tests; its meaningful validation is the separate model and browser suites above. CI still runs the application build, unit, Vitest and database-contract lanes.

## Local interactions checked

- All 266 route contracts are discoverable in the catalog — **pass**.
- Skip link preserves selected counselor route — **pass**.
- Specific job links retain selected record identity — **pass**.
- Specific member links retain selected record identity — **pass**.
- Keep editing cannot submit a profile or discard its unsaved fields — **pass**.
- Profile updates are reflected in subsequent workspace identity — **pass**.
- Résumé failure state retains draft and saved preview updates — **pass**.
- Empty and unavailable remain distinct and recoverable — **pass**.
- Lab sharing requires explicit review and freezes the submitted copy — **pass**.
- Unconfirmed sample send preserves draft and reconciles the original request once — **pass**.
- Unknown route renders not found rather than home — **pass**.
- All seven standard data states render without page errors — **pass**.
- Route-local record filters recover when cleared — **pass**.
- Nested record routes and their parent keep member-002 identity — **pass**.
- Domain schemas retain their role and purpose — **pass**.
- Staff job review does not expose member-only application navigation — **pass**.
- Editing a selected job retains the row and publication state — **pass**.
- Unconfirmed-send recovery blocks a second request and preserves newer edits — **pass**.
- Sensitive domain forms remain read-only and never collect passwords — **pass**.
- Malformed record links recover without crashing or revealing a draft job — **pass**.
- Mobile navigation dialog supports keyboard focus and Escape — **pass**.

## Reproduction and capture

```sh
node docs/mockups/portal-review/build.mjs
node docs/mockups/portal-review/verify-model.mjs
WAP_REVIEW_EVIDENCE_DIR=/tmp/wap-review-validation node docs/mockups/portal-review/verify.mjs
WAP_REVIEW_EVIDENCE_DIR=/tmp/wap-review-screens node docs/mockups/portal-review/capture.mjs /tmp/wap-review-validation/review-results.json
```

The capture tool requires a passing full validation receipt and matches its HTML hash before capturing. It records a separate capture receipt and an explicitly combined manifest; it does not present capture as a second full interaction run. Screenshot delivery is separate from this source receipt.

## Limits

No authenticated Next route, real role session, hosted storage/provider, production authorization, email delivery, migration, provisioning or release was exercised by these scripts. The attached gallery and portable HTML are proposed mockups. Separate production fixes and their CI results are documented in PRs #2836 and #2837. Current source still requires the independent Portal C acceptance work in #2835 and coordination with #2827.
