# WorkforceAP site-wide UI/UX audit — October 11, 2026

This report records the read-only audit baseline at `7c4c8e3ff3ced1b0f4e0d4cd37ab29ba147c9ee2` and its bounded, evidence-backed follow-up checks. Route counts describe source entries and generated outputs, not distinct fully tested user journeys.

## Coverage

The source census assigns every Next page implementation to an audit lane: 264 production entries and 63 internal fixtures. The full route-level record is in [production-route-coverage-2026-10-11.csv](production-route-coverage-2026-10-11.csv). The public Astro build emitted 70 non-redirect outputs from 34 exact source owners; its per-output record is in [astro-route-coverage-2026-10-11.csv](astro-route-coverage-2026-10-11.csv).

| Area | Inventory | Rendered evidence |
| --- | ---: | --- |
| Astro marketing | 70 generated public outputs | 210 initial renders at 375, 768 and 1440 px; all returned HTTP 200 with a title and one H1. A static Astro preview establishes output rendering, not final Next/Vercel route precedence. |
| Public and public-adjacent Next | 29 entries | Six auth screens rendered on a synthetic loopback fixture at 375, 768 and 1440 px in light and dark preference (36 checks). `/apply` responsive and invalid-submit focus evidence was reused from the earlier baseline at 320, 375, 390, 768 and 1440 px in both themes. Other apply subroutes, legacy redirects, and token/session/data-dependent states remain source-only or fixture-limited as recorded in the CSV. |
| Member, employer and partner | 110 entries | 33 available synthetic fixtures rendered at 375, 768 and 1440 px in both themes (198 checks): 28 member, 2 employer and 3 partner fixtures. Component fixtures and workflow analogues do not establish every production page composition or authenticated state. |
| Admin, counselor, leader, coach, applications, mentor and org | 125 entries | 126 initial browser checks across 19 synthetic staff variants and two public states, plus six focused interaction checks. Route-specific ownership and evidence types are in the production CSV. |

The initial-state total is 570 viewport checks (210 Astro, 36 auth, 198 portal fixture, 126 staff/public). It is not a count of distinct fully tested pages or a claim that all accessibility, authenticated workflows, or provider integrations passed. Separate initial-state, component, analogue, source-only, auth-limited, and data-limited evidence explicitly in the route CSV.

Astro generated `/es/`, `/fr/`, and `/pt/` home outputs, but no other localized page paths. `marketing/astro.config.mjs` and `scripts/vercel-build.cjs` define ownership: Astro generates `marketing/dist`, the build copies those files into Next `public/`, and Next is then built. Static Astro previews do not prove canonical deployed precedence. The supported-prefix behavior tracked as WAP-294 is excluded from duplicate findings here.

## Confirmed findings and follow-ups

| Issue | Observed behavior | Follow-up record |
| --- | --- | --- |
| [WAP-295](https://linear.app/mikebeezy/issue/WAP-295/member-job-filters-make-mobile-drawer-operable-with-keyboard-and-touch) | The mobile Jobs filter panel blocked pointer and keyboard access and did not contain background scrolling. | PR [#2783](https://github.com/workforceap/workforceap-beta/pull/2783); exact checks and production health were verified on merged source `7c4c8e3`. |
| [WAP-296](https://linear.app/mikebeezy/issue/WAP-296/member-profile-align-identity-and-compact-notificationlanguage) | Profile identity alignment and oversized preference cards weakened desktop hierarchy and pushed Language down the page. | PR [#2782](https://github.com/workforceap/workforceap-beta/pull/2782); exact checks and production health were verified on merged source `7c4c8e3`. |
| [WAP-297](https://linear.app/mikebeezy/issue/WAP-297/shared-notification-switch-assess-low-unchecked-thumbtrack-contrast-in) | The unchecked shared Toggle thumb and track had insufficient contrast in both themes. | PR [#2784](https://github.com/workforceap/workforceap-beta/pull/2784); follow the issue's release thread for combined production verification. |
| [WAP-294](https://linear.app/mikebeezy/issue/WAP-294/locale-homepage-urls-serve-english-root-content-in-production) | Supported locale homepage requests could be handled as the English root page by middleware. | PR [#2787](https://github.com/workforceap/workforceap-beta/pull/2787) merged at `77796f0`; eight hosted locale/English homepage checks passed. Combined production acceptance remains pending in the [release thread](https://linear.app/mikebeezy/document/october-11-2026-workforceap-release-and-acceptance-5820e26cda08). This audit does not duplicate or broaden the finding. |
| [WAP-298](https://linear.app/mikebeezy/issue/WAP-298/mentor-application-restore-instruction-and-back-text-contrast-in-dark) | Mentor application intro and Back link were difficult to read on the dark canvas. | PR [#2785](https://github.com/workforceap/workforceap-beta/pull/2785); follow the issue's release thread for combined production verification. |
| [WAP-299](https://linear.app/mikebeezy/issue/WAP-299/cookie-consent-accept-restore-label-contrast-on-the-stable-dark-mode) | The dark-mode label had 2.779:1 contrast against the fixed crimson fill. | PR [#2786](https://github.com/workforceap/workforceap-beta/pull/2786); follow the issue's release thread for combined production verification. |
| [WAP-300](https://linear.app/mikebeezy/issue/WAP-300/program-comparison-lets-the-whole-page-pan-sideways-at-tablet-widths) | At 768 and 1024 px, the whole page could pan horizontally. When the comparison table was internally panned, its rendered Compare column was 100.4 px wide while the Track sticky offset was 56 px, overlapping 44.4 px and obscuring text. | Candidate containment keeps document width at the viewport while retaining table pan; the shared fixed 104 px Compare width and Track offset remove the overlap. Targeted regression checks cover 768/1024 desktop interaction and 375 px cards. See the [browser regression](../../tests/e2e/program-comparison-overflow.spec.ts). |

WAP-295 and WAP-296 passed their exact release checks and a completed 15-minute production observation window at merged source `7c4c8e3`. Later selected fixes have separate issue and release records; see the [October 11 release document](https://linear.app/mikebeezy/document/october-11-2026-workforceap-release-and-acceptance-5820e26cda08) for current release status and [WAP-6](https://linear.app/mikebeezy/issue/WAP-6/workforceap-require-five-role-action-and-persistence-acceptance) for outstanding authenticated role, seeded-record and persistence acceptance. This audit snapshot makes no additional production-acceptance claim.

## Findings that did not justify a production change

- Mobile Reporting tabs scroll horizontally; keyboard navigation reached Coursera and Exports and brought each into view in both themes. An overflow cue is optional discoverability polish.
- The employer Jobs fixture omitted the production page opener. Source review confirmed the real page renders `EmployerPageOpener` and its H1, so the proposed missing-heading finding was withdrawn.
- An auth redirect loop occurred only under one local fixture recipe. Bounded canonical production probes resolved successfully; no production redirect-loop issue is claimed.
- A transient Portuguese homepage screenshot appeared clipped. A fresh reduced-motion render with font readiness and text-range geometry showed complete badge, heading, and mission copy; no locale visual defect was reproduced.

## Confirmed component finding with route acceptance still open

- [WAP-301](https://linear.app/mikebeezy/issue/WAP-301/member-phone-navigation-fully-reveal-keyboard-focused-tabs): independent review confirmed on the production `MemberPortalTopNav` using the synthetic `/dev/member/jobs` shell at 375px that the keyboard-focused Job Board link is only 16.7% visible, with its focus ring clipped. Seven forward/backward keyboard targets were clipped in the independent sweep. The rail uses proximity snap and centers the active item only on pathname changes. The fixture's extra Skip to navigation link affects only the starting Tab count. The protected `/dashboard/jobs` route was not authenticated, so this confirms the shared component behavior but not the authenticated production route or all member route states. A narrow keyboard-focus visibility correction is tracked in WAP-301.

## Limits

Synthetic fixtures establish only the components and states they render. They do not establish authenticated production role behavior, database loaders, real record variants, saved changes, email delivery, or provider success. Fixture shells may omit production openers or role-specific composition. No real applications, account changes, messages, or external provider actions were submitted. The current construction duration wording remains pending owner verification. Live Sentry access was unavailable; empty deployment logs have unknown request coverage and do not establish zero production errors.

The full route evidence is in the two CSVs beside this report. Supporting audit artifacts and screenshots were retained in the shared audit workspace; raw screenshots are not copied into the source repository.
