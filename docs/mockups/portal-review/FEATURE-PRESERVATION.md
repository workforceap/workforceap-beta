# WorkforceAP feature preservation during the appearance refresh

The existing application remains the implementation contract. The modern light
and dark presentation must retain its workflows, graph/data views, integrations,
access checks, saved history, exports, draft recovery and mobile actions.

This review adds a source-linked feature map to every inventoried screen. It
does not replace any application component with the static review. A layout-only
screen is an incomplete visualization of a workflow, never authorization to
remove that workflow from WorkforceAP.

## Source and patch boundary

| Evidence | Pinned revision |
| --- | --- |
| Current application feature baseline | `f8a12f527810ba8c1e08840a762358b0fd86e4f1` |
| Appearance-only application patch, draft PR #2842 | `0f0ba157740a4dd8142614477efadc142eaf1069` |
| Original route/schema inventory | `efc27e4a4ebeba09b5261e7b1c36463d01925017` |
| Previous portable theme review, draft PR #2841 | `6bfd7a05ab5fe62099f9fb3998ad40270bc872aa` |

The application patch changes **five runtime files**: three portal stylesheets
and literal background/foreground colors in `VoiceStudioKit` and
`ReadinessCoachReturnButton`. A parsed TypeScript/CSS comparison verifies that
the JSX outside those paint values, non-paint CSS, import/at-rule identities and
resource URLs are unchanged. Every other tracked runtime file is unchanged,
including routes, APIs, O*NET helpers, authorization, data models and navigation.

`verify-app-preservation.mjs` makes this bounded comparison repeatable. It rejects
unexpected runtime files and functional syntax changes. The check does not prove
live provider configuration, visual accessibility for every component or the
health of an authenticated deployment.

## Preservation scope across portals

The JSON contracts map **all 266 inventory routes** to **120 workflow families
and 319 concrete preservation obligations**. Every obligation cites application
source at the feature baseline.
The builder rejects missing source evidence and uncovered routes. Counts refer
to documented requirements, not end-to-end feature tests.

| Portal | Routes | Examples that must remain |
| --- | ---: | --- |
| Member | 73 | Skill Mapper/O*NET and graphs; résumé upload, scoring, rewriting and export; voice; training and Coursera; assessments/retakes; jobs/applications; saved results; messages and profile |
| Counselor | 21 | Assigned caseload, member casework, readiness, assessment review, handoffs, notes, conversations, submitted labs, sessions and placements |
| Employer | 21 | Job lifecycle/import, owned applicants, résumé snapshots, allowed hiring stages, interview details, matching, work queues and conversations |
| Partner | 14 | Referral/tier/consent visibility, outreach, assignments, invitations, training, verified outcomes, exports and eligible payouts |
| Admin | 100 | Queues and casework; staffing, providers, programs and training; Coursera operations; assessment/consent; billing/agreements; reporting/content/operations |
| Group/shared | 10 | Chapter/group boundaries, account/privacy, resources, navigation handoffs and coaching |
| Entry/handoffs | 27 | Authentication, safe redirects, staff MFA, applications, referrals, token expiry, consent/screening and recovery |

See [MEMBER-FEATURE-AUDIT.md](MEMBER-FEATURE-AUDIT.md) and
[STAFF-FEATURE-AUDIT.md](STAFF-FEATURE-AUDIT.md) for source-specific findings.
Families group related screens; they are not instructions to put every sibling
control onto every page.

The hosted review provides **View existing features** beside each screen and a
searchable **Feature preservation** tab under **All screens & journeys**.
Each family names integrations that the real application must keep and states
what the local preview does and does not simulate.

## Skill Mapper correction

The prior review routed Skill Mapper to a generic AI-tool form. The dedicated
review now restores the feature structure: occupation search, six-axis radar,
member-versus-target overlay, numeric score tables, skill bars, gaps, training
suggestions, local recent lookups and sample report export.

The static catalog contains ten sample occupations. Codes and course names are
source-referenced; scores, member profile and recommendations are explicitly
synthetic. JSON/CSV exports retain this provenance, and the copyable report works
when a host blocks downloads. Search text, selected occupation and local history
stay available across palette changes and review navigation. Global sample reset
clears this module too.

The actual app's O*NET API, member-profile construction, résumé extraction,
persisted results and PDF export are unchanged. Those services are not connected
to this offline ChatGPT Site. The six radar axes are WAP's model; the synthetic
comparison is not an assessment or an employment qualification decision.

## Verification

The current application patch passes **366 tests across 20 existing files** with
controlled dependencies. These cover Skill Mapper result/event handling, voice
navigation, résumé source/recovery, authorized assessment retakes, counselor
handoffs/thread access, employer transitions/interview editing, application
résumé snapshots, partner visibility, export/staff authorization, placement
evidence, attention-queue behavior and theme activation. There are no failed or
skipped tests in that run.

The separate parsed-code preservation guard passes for all five changed runtime
files. Independent review identified an at-rule validation gap in the guard;
the final version also compares imported CSS and resource references.

The final generated standalone artifact passes **1,596 route render checks**
(266 routes × 375/768/1440 pixels × light/dark) and **25 local interaction
checks**, with zero page errors or unexpected external requests. The full route
run includes the original 21 interactions; a separate interaction-only run on
the same artifact passes all 25. The four added checks cover the searchable
feature catalog, source obligations across all seven portal groups, Skill Mapper
charts and scores, and selected-role/search continuity through theme and route
changes plus global reset.
Both standalone and scoped builds pass **26 appearance checks**, including
draft/voice continuity, OS preference, storage failure and scope isolation.
These navigation/render checks do not establish application feature parity.

The Skill Mapper module passes **12 browser cases** covering all three widths,
both themes and standalone/scoped roots. Each case checks validation and empty
search; an actual painted radar; exact six-axis comparison and gaps; training;
JSON/CSV download contents and copy fallback; keyboard tabs; history; reset;
theme/draft/selection continuity; and no overflow, errors or network requests.
The module input hashes are in `feature-verification.json`.

Managed Sites browser review also exercised the assembled feature catalog,
O*NET search within preservation requirements, occupation selection, dual radar,
light/dark switching and the report's explicit synthetic provenance. Console
extension metadata errors came from the browser extension, not the application.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Standalone hosted document | 994885 | `abc9a2e1538956fcf2c6338ae745e8813081f58754cf81870b178c2fc8437b13` |
| Scoped inline document | 999515 | `ec5d6b39056d1e7740926bd398233032c9357a2ed116147cffeef5319bc0e48f` |

Repeated title-provenance labels are pooled to fit the inline size limit. All
266 source URLs and title labels round-trip exactly to the original inventory;
no route, record, source reference or feature was removed to reduce file size.

## Release and implementation gate

1. Preserve the existing React components, callbacks, queries, APIs and domain
   services when applying the visual design. Resolve every affected source
   obligation; a generic static form does not satisfy it.
2. Keep record identity, role/tenant/consent boundaries, safe navigation,
   submitted versus draft copies and failure/retry semantics. Preserve provider
   receipts separately from saved local state.
3. Retain all controls on mobile and in both themes. Check keyboard access,
   charts, tabular alternatives and draft continuity in the rendered component.
4. Run the relevant real component/API suites and repository prepush gate. Use
   authenticated deployment acceptance for live services, private documents,
   provider access, database scope and delivery before a production release.

This work publishes the private design review and proposes source changes in a
draft PR. It does not merge or deploy the application patch to workforceap.org.
