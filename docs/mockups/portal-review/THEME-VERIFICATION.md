# Theme and readability verification

Date: 2026-10-21. This is a portable design review with synthetic records. Its
results do not establish authenticated application or production acceptance.

## Design decisions

- Preserve WorkforceAP’s crimson, gold, Inter typography and role-specific
  navigation. The member canvas retains its existing warm neutral colors.
- Reduce the canvas wash to 5% crimson and 3% gold. Use a 96% canvas fill for the
  sticky header so content scrolling behind it does not compete with navigation.
- Use solid content surfaces and restrained elevation. Reserve strong color for
  primary actions, selected states and the existing coaching identities.
- Strengthen secondary text and editable control boundaries in both themes.
  On phones, keep the three review selectors visible and give coach choices a
  full-width layout.
- Expose Light / System / Dark. Keep theme updates independent of workspace
  rendering so changing appearance preserves in-progress work.

The preview's `theme-review.css` expresses this proposal in its own components.
The companion application patch is on `cook/portal-theme-clarity-20261021`, based
on master `f8a12f527810ba8c1e08840a762358b0fd86e4f1`. It fixes the shared portal
tokens and card cascade, including a dark-mode specificity error that erased
crimson/gold hero gradients, and uses fixed deep hero colors for white text in
Resume Studio and the readiness-coach action. It preserves the application’s
existing theme provider and preferences. This preview is not a React rendering
of that patch and does not substitute for its separate tests.

## Exact generated artifacts

The route/data source remains pinned to
`efc27e4a4ebeba09b5261e7b1c36463d01925017`. Appearance work extends the review at
`cdeaef8b706b002829bf49b27a88d9c26e06742c`; it does not silently refresh the
266-route inventory.

| Artifact | SHA-256 |
| --- | --- |
| Standalone HTML | `b85a88267a92aa7c21cac0179c3065c079de35c4f4cf94915a7368ce831fbfbc` |
| Scoped inline HTML | `8fa7d2a1d56ba06e296f5f0c0887dd96eacda00673d50b4e5e9c948e64f6c1b0` |

Browser: Chromium 153.0.8010.0. Runtime: Node 22. The same generated standalone
artifact was used for the appearance, full-route and focused voice checks.

## Results

| Check | Result |
| --- | --- |
| Appearance behavior, standalone and inline, 1440/375 px | 26 passed, 0 failed |
| Route matrix: 266 routes × 1440/768/375 px × light/dark | 1,596 passed, 0 failed |
| Existing portal interaction regressions | 21 passed, 0 failed |
| Focused voice regression suite, 1024/375 px | 4 passed, 0 failed |
| Browser page errors | 0 |
| Unexpected external requests | 0 |
| Instrumented media/provider calls in appearance and voice suites | 0 |
| Changed JavaScript lint and whitespace checks | Passed |

The appearance suite checks initial system preference, live OS changes,
independence of explicit preferences, reload persistence, cross-tab updates,
unavailable storage, actual input-node and selection continuity, résumé drafts,
active simulated voice sessions, mute state and transcript continuity. It also
checks that inline appearance does not mutate host document theme or controls.

Selected appearance, résumé, privacy and hero-description text pairs measured
at least 7.00:1. Required measurement targets fail the check if absent; disabled
primary voice actions retain their disabled appearance when hovered.
Editable voice-text and coach-picker boundaries measured 3.69:1 in light and
5.29:1 in dark. These are targeted rendered measurements, not a claim that all
text or every accessibility criterion was audited.

Desktop and phone screenshots of Home and AI Career Tools were inspected in
both themes. The inline suite is a same-document scope test without the
conversation host’s icon runtime; it does not establish full host-wrapper parity.

## Reproduce

Use the repository’s locked dependencies and Chromium. An optional
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an existing Chromium binary.

```sh
node docs/mockups/portal-review/build.mjs
node docs/mockups/portal-review/build-inline.mjs
WAP_REVIEW_EVIDENCE_DIR=/tmp/wap-theme-final node docs/mockups/portal-review/verify-theme.mjs
WAP_REVIEW_EVIDENCE_DIR=/tmp/wap-theme-routes node docs/mockups/portal-review/verify.mjs
WAP_REVIEW_EVIDENCE_DIR=/tmp/wap-theme-voice node docs/mockups/portal-review/verify-voice.mjs
```

The scripts emit JSON results and artifact hashes into their evidence directories.
Rebuild and rerun the relevant checks whenever an embedded source changes.
Documentation-only updates do not change these generated artifact hashes.

## Remaining boundary

This review has no authenticated accounts, live records, microphone access or
provider connections. The full production route matrix, real integrations and
deployment acceptance remain separate work. The companion application patch has
its own 12-case rendered CSS fixture and focused component/token tests; those
results are not inferred from the 266-route static review.
