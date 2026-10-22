# WorkforceAP portal experience review

This directory contains a portable, offline design review of WorkforceAP’s portal routes. Build and open `index.html` to navigate the proposed member, counselor, employer, partner, admin, group/shared and entry experiences. Every displayed identity and record is synthetic. The review does not authenticate, contact application APIs, send messages, publish content or change production.

## Appearance and clarity

The appearance pass keeps WorkforceAP’s crimson, gold and Inter typography while
reducing the canvas wash and giving content a solid reading surface. Warm member
pages and denser staff workspaces keep their existing structure. Text, form
outlines and sticky navigation have stronger separation from their backgrounds.

Use **Appearance → Light, System or Dark** in the review toolbar. System is the
default and follows operating-system changes. The choice persists independently
of the real application’s preference and synchronizes across open review tabs.
Switching appearance changes the palette without rebuilding the workspace, so
unsaved fields, text selections and simulated voice-session state stay intact.
If storage is unavailable, the picker continues to work for the current view.
The inline build scopes appearance to its own root instead of changing its host.

`THEME-VERIFICATION.md` records the exact tested artifacts, rendered checks and
the distinction between this proposal and the companion application CSS fix.

## Preserve the whole feature set

Every review screen now exposes **View existing features**, with concrete
obligations and links to the actual implementation. **All screens & journeys →
Feature preservation** searches the requirements across member, counselor,
employer, partner, admin, shared and entry workspaces. The two
`*-feature-contracts.json` files supply this contract. The builder rejects
unmapped routes, duplicate family IDs, unsupported statuses and missing source
evidence at the pinned application revision.

The current application feature baseline is
`f8a12f527810ba8c1e08840a762358b0fd86e4f1`; the original route/schema inventory
keeps its older provenance below. A family checklist documents source behavior.
It does not establish that every field, server branch or provider was executed.
See [FEATURE-PRESERVATION.md](FEATURE-PRESERVATION.md) for the patch boundary,
functional regression results and remaining acceptance work.

### Skill Mapper

The dedicated Skill Mapper review includes occupation search, six-axis radar,
member-versus-target overlay, exact score tables, skill bars, gaps, training
suggestions, recent lookups and JSON/CSV sample exports. Search covers ten local
occupation examples. All scores are synthetic; history lasts for the current
open review. A copyable report remains available if downloads are blocked.

The actual application's O*NET search, profile construction, résumé extraction,
saved tool history and PDF export remain in their existing components and APIs.
The static review does not call those services. Theme switching repaints the
chart without replacing the selected occupation or the search input.

## Voice is part of the workspace

The review includes the source application's voice-first AI Career Tools workspace, with Coaches, Practice, Resume and All Tools views. Readiness, résumé coaching, mock interviews and Lilley each have a session surface and a purpose-specific companion panel. Career & Business is the broader legacy entry to Lilley, not an additional independent agent. Staff, employer and partner assistants stay in their own workspaces; no admin assistant is invented.

Voice sessions are explicitly simulated. Consent, session state, transcripts, interruption, mute, text fallback, reconnecting and résumé-suggestion decisions operate in local memory. The review never opens the microphone, acquires video, calls an AI provider, submits session completion or sends email. `VOICE-REVIEW.md` maps the screens and explains the source-specific retention boundaries.

## Source identity and coverage

The route inventory, source links, journey contracts and model are pinned to [`workforceap/workforceap-beta` at `efc27e4a4ebeba09b5261e7b1c36463d01925017`](https://github.com/workforceap/workforceap-beta/commit/efc27e4a4ebeba09b5261e7b1c36463d01925017). The inventory was recovered and checked against that repository source. It is not derived from the dated GBrain mirror.

There are **266 route contracts**, including **42 parameterized routes**, with no missing route source files in the inventory.

| Source route kind | Count |
| --- | ---: |
| Page | 222 |
| Redirect | 24 |
| Alias with legacy view | 9 |
| Conditional page | 9 |
| Role router | 1 |
| Not-found route | 1 |
| **Total** | **266** |

| Review group | Routes |
| --- | ---: |
| Member | 73 |
| Counselor | 21 |
| Employer | 21 |
| Partner | 14 |
| Admin | 100 |
| Group and shared | 10 |
| Entry and public handoffs | 27 |

Groups describe route organization, not an authorization grant. The mentor dashboard is `/dashboard/mentor`, conditional on an authenticated linked Mentor record; there is no invented standalone mentor workspace.

`journeys.json` defines **15 cross-screen acceptance journeys with 70 steps**. These are acceptance specifications, not a claim that every step ran against an authenticated deployment. `screen-definitions.json` supplies **133 source-grounded domain schema families for 156 list/form/detail routes**, including billing, agreements, Coursera, consent, sessions, referrals, screening, templates and operations. Its 354 example rows are explicitly synthetic; form schemas are read-only. Specialized model-backed views cover the remaining interaction examples.

## Build and verify locally

Use the existing repository lockfile and installed dependencies. The builder embeds the repository’s portal tokens and the Inter font assets from the pinned Prisma dependency; it does not download fonts or require a Next server.

From the repository root:

```sh
node docs/mockups/portal-review/build.mjs
```

For the in-conversation presentation, build the same route and interaction model as a scoped fragment:

```sh
node docs/mockups/portal-review/build-inline.mjs --output=/absolute/path/wap-portal-voice-review.html
```

The inline build uses the conversation's supplied icon runtime, fits its frame without a fixed viewport shell, and pages the full screen catalog. It keeps all 266 route contracts and the same synthetic data model. Its default view is AI Career Tools so the voice experience is visible immediately.

The generated HTML and screenshot output are intentionally untracked; the portable HTML is delivered as a review attachment. Open the generated `docs/mockups/portal-review/index.html` directly in a browser. The optional `--output=/absolute/path/review.html` argument writes an additional portable copy.

With the repository Playwright dependency and Chromium available:

```sh
node docs/mockups/portal-review/verify-model.mjs
node docs/mockups/portal-review/verify-voice.mjs
node docs/mockups/portal-review/verify-theme.mjs
node docs/mockups/portal-review/verify-skill-mapper.mjs
WAP_REVIEW_EVIDENCE_DIR=/tmp/wap-portal-review-smoke node docs/mockups/portal-review/verify.mjs --smoke
WAP_REVIEW_EVIDENCE_DIR=/tmp/wap-portal-review-full node docs/mockups/portal-review/verify.mjs --capture
```

The full verifier checks every route at 1440, 768 and 375 pixels in light and dark themes, with reduced motion. It checks titles, route resolution, overflow, control names and page errors, then exercises the defined local interaction regressions. `--capture` saves desktop and mobile screenshots for each route in the light theme. JSON results and screenshots go to the selected evidence directory. The verifier blocks unexpected network requests and fails when a checked assertion fails.

Build both HTML variants before running `verify-theme.mjs`. That suite checks
appearance persistence, system changes, tab synchronization, unavailable storage,
draft/session continuity, targeted contrast and inline scope at 1440 and 375
pixels. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using an existing Chromium
binary instead of Playwright’s installed browser.

Rebuild after changing source, definitions or styles. Review the actual results for the exact generated artifact; a previous passing report is not evidence for later edits.

For the companion appearance-only application patch, run its bounded parsed-code
check against the application worktree (not against this documentation branch):

```sh
node docs/mockups/portal-review/verify-app-preservation.mjs \
  --app=/absolute/path/to/application-worktree \
  --base=f8a12f527810ba8c1e08840a762358b0fd86e4f1 \
  --head=0f0ba157740a4dd8142614477efadc142eaf1069
```

This guard compares JSX syntax outside literal color/background values and CSS
outside paint properties. It also retains imports, at-rules and resource URLs,
and rejects other runtime file changes. It complements the actual behavioral
suites and rendered appearance checks; it does not establish live service health.

`verify-skill-mapper.mjs` exercises the dedicated module at 375, 768 and 1440
pixels in both themes and both root modes. It checks search, both chart views,
numeric gaps, history, downloaded report contents, keyboard tabs, reset and
draft continuity while rejecting network requests. The assembled review's
interaction suite also checks the feature catalog and assembled preview module
wiring. Run `verify.mjs --interactions-only` to exercise those interactions
without repeating the route sweep.

## What the evidence establishes

See `VOICE-VERIFICATION.md` for the voice extension's exact artifact hashes,
full and focused browser results, and the boundary between this review and live acceptance.

| Layer | Meaning |
| --- | --- |
| This static review | Proposed navigation, information architecture, domain layouts, synthetic state handling and selected in-memory interactions. It does not replace React application screens. |
| Separate production-component changes | Focused application fixes, such as résumé load recovery and message continuity, have their own immutable diffs, mocked tests and component screenshots. Their results are not inferred from this prototype. |
| Hosted acceptance | Authenticated roles, tenant scope, private documents, provider access, production data freshness, delivery reconciliation and exact-deployment behavior require separately authorized acceptance. They remain unverified by this directory. |

The state controls demonstrate loading, confirmed empty, unavailable, restricted, saved, conflict and uncertain-result states. A visual saved-state example is not persistence evidence. Model receipts are local synthetic records with delivery unattempted. In-memory edits reset on reload. Read-only domain forms do not collect passwords, record consent, provision accounts, sign documents, run billing or publish profiles.

## Data and concurrent work

Read `data-strategy.md` for source ownership, role/tenant boundaries, timestamps, truthful absence versus unavailability, write/retry semantics, fixture isolation and observability. `route-acceptance-matrix.csv` covers every inventoried route; source and coverage receipts are adjacent JSON files.

The ownership review preserved existing work in PRs [#2827](https://github.com/workforceap/workforceap-beta/pull/2827) (Portal C), [#2831](https://github.com/workforceap/workforceap-beta/pull/2831) (counselor scope), [#2833](https://github.com/workforceap/workforceap-beta/pull/2833) (Phase 0 protections), [#2835](https://github.com/workforceap/workforceap-beta/pull/2835) (fixture/readiness/aggregate correction), and [#2513](https://github.com/workforceap/workforceap-beta/pull/2513) (employer empty states). `pr-overlap-files.json` records the inspected file ownership. This isolated directory does not merge, overwrite or substitute for those changes; refresh their heads before integration.

The reported suppression lookup HTTP 401 is a separate operational incident. The review does not establish API-key permissions, suppression webhook coverage or live delivery reconciliation. No provider operation or settings change is needed to build or inspect this artifact.

Nothing in this directory asserts that a site was deployed, production screens were replaced, CI passed, or the complete live service was certified flawless. Publication and release decisions require their own exact-head evidence and the repository’s normal prepush/CI gates.

## Font attribution

The portable output embeds unmodified Inter font files distributed with the pinned dependency. See `FONT-LICENSE.txt` for the SIL Open Font License and upstream attribution.
