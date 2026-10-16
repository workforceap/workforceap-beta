# Staff reporting and intake audit reconciliation — October 15, 2026

## Evidence and scope

The two newly supplied audit files are byte-identical (79,368 bytes). They still audit `30afca15acf2b12acf758ba64b38fdbeef450724`, compile 40 findings, and append a separate 21-item enhancement roadmap. The 23 earlier findings are reconciled in [the expanded audit receipt](expanded-platform-audit-2026-10-15.md). PR #2805 is now deployed at `0e5b603bf7895ef42b747c5f65247c90c9241aa3`; its public readiness probe returned HTTP 200 and matching version with healthy database/Redis at 22:57:48 UTC.

This fresh staff branch starts at that deployed revision. The following are prepared source changes, not claims of release or live learner acceptance. The PR will record the immutable tested revision, final checks, merge and deployment. No named learner counts, duplicate-account claims, inferred funding, or unsupported course terms are accepted from the older snapshot.

## New staff findings

| Finding | Validated disposition and bounded correction |
| --- | --- |
| ADM-05, expanded | Application-only screening was already added to Admin Today and the screening page in #2805; Counselor Today still needed the same actual evidence within its existing caseload. Public no-account screenings are a separate store with two saved snapshot formats, no member foreign key and no staff review status. The screening page now exposes a separate organization-scoped public-contact section, reached from Admin Today and notification links. Its contacts never acquire member identity, eligibility decisions, pending-review counts or counselor assignments by email matching. |
| ADM-07 | Benefit requests and older training-access records now have read-only visibility on the member's Program tab, constrained to the selected active member and organization. A request status does not grant provider access. Partner signup records have no durable tenant/partner foreign key; a separately guarded platform-admin intake view exposes their actual saved fields without inferred joins or conversion actions. Organization admins retain only their authorized partner data. Existing authorized lab-review and chapter routes gain contextual navigation. The report's laptop/childcare benefit examples are not supported by the current benefit API. |
| ADM-08 | Confirmed assignment/date omissions affect provisioning, attention and saved-risk populations, reporting counts, program grouping and several labels. One current-assignment read model and SQL relation follow the unchanged resolver. Historical board cohorts and placement-time attribution keep their own enrollment-history relation; they are not rewritten as today's primary assignment. Learner/credential/survey label fixes retain records. A separate training-dashboard arbitrary-history fallback is removed, with recorded unassigned activity still visible and assigned-program progress unknown. |
| ADM-09 | Diagnostics now includes primary-only assignments, treats aliases as equivalent, and labels its bounded scan as partial. Deliberately cleared history-only accounts are not falsely called enrollment drift. No automatic enrollment repair is added. |
| ADM-10 | All three partner-referral aggregates need explicit tenant predicates, because their model is not automatically covered by the tenant proxy. The default staff-only Users directory and enrolled-program cards are documented view contracts with visible management links, not missing-control bugs. The zero-enrollment empty copy is corrected to describe enrollments rather than claim the catalog is absent. |
| ADM-11 | Blanket sidebar ungating is rejected: the rail policy is tested and some destinations also enforce platform-admin access in their server/API paths. Only authorized existing-route discovery is added. |
| COUN-01 | Duplicate placement recording is a real unique-key crash. An atomic conflict-safe insert now returns a clear 409 for an existing record, preserving its contents, verification and history, and emitting no success effects for the rejected write. New records remain unverified. The proposed automatic verification/status changes are not justified by recording a placement; the suggested verification-at/by columns do not exist. |
| COUN-02 | Enrolled-only admin caseload remains intentional. Primary-only confirmed assignments are now included, unresolved history remains excluded, and legacy Overview figures/badges use the same resolver. This does not widen caseloads to all applicants. |
| COUN-03 | Program-change requests now snapshot the actual confirmed assignment instead of only the leftover legacy pointer. No enrollment is changed by submitting a request. |
| COUN-04 | Partner packet enrollment and missing-date notes now agree with the same assignment used for training completion. Chapter discovery uses existing roles; supplied leaders must be active users in the actor's organization. A new leader-picker workflow is not part of this correction. |

## Assignment and reporting contract

Current assignment means an actual primary enrollment; otherwise an enrollment matching the saved legacy program through canonical/alias equivalence; otherwise a legacy-only assignment when no enrollment rows exist. An arbitrary nonprimary historical row or observed provider progress never creates an assignment. Dates belong to that exact resolved enrollment, with same-program legacy compatibility only where appropriate. Unknown progress remains unknown.

Historical reporting uses saved enrollment rows and immutable curriculum versions, preserving effective cohort dates and program attribution at placement time. Current-assignment SQL and historical-enrollment SQL are separate. Callers retain organization, active-member, staff/fixture, lifecycle and reporting-period exclusions.

## Validation and limits

Focused behavioral suites cover source-aware screening and request visibility, placement conflicts, counselor scopes/Overview, program-change snapshots, partner packets, tenant aggregates/navigation, diagnostics, reporting and program labels. Actual disposable PostgreSQL 16 tests compare the SQL relation with the unchanged resolver and execute analytics/board consumer queries. Integrated gates and independent review are recorded on the PR after source freeze; no production data or configuration has been changed by this branch.

The marketing findings are handled separately in the public-site branch. Roadmap items are proposals, not instructions to bypass staff authorization, provision on GET, infer assignments/funding, mutate reviewed billing documents, or broaden signer policy. Existing approved-course/terms and operational release gates remain in force.
