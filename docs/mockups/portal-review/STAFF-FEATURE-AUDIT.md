# Staff, employer, partner and entry feature preservation

Reviewed against application source `f8a12f527810ba8c1e08840a762358b0fd86e4f1`.
The route inventory remains pinned to its original
`efc27e4a4ebeba09b5261e7b1c36463d01925017` revision. The inventory is navigation
evidence; this audit adds source-backed feature obligations for the redesign.

## Coverage and meaning

`staff-feature-contracts.json` contains **62 families and 154 obligations** covering
all **172** inventory routes in the assigned portal groups, exactly once:

| Portal group | Routes | Preservation scope |
| --- | ---: | --- |
| Admin | 100 | Casework, staff, training, providers, outcomes, billing, content and operations |
| Employer | 21 | Hiring intent, postings, applicants, matches, conversations and subscriptions |
| Partner | 14 | Referrals, outreach, training visibility, outcomes, exports and payouts |
| Group/shared | 10 | Canonical handoffs, privacy, chapter leadership and coaching |
| Entry/handoffs | 27 | Authentication, signup, applications, token links and public follow-up |

Each family lists exact inventory routes, concrete behaviors, source files,
integration boundaries and the current preview status. All cited files were
checked to exist in the application worktree. The inspected route/component
source matches current master except for the known later J5 billing update;
the billing contract was inspected in the current application worktree.

These are **family-level preservation obligations**, not evidence that every
field, server branch or provider has been executed. They do not certify live
permissions, database state, provider configuration or deployment health.
`structural` means the preview provides navigation and a layout representation;
`mixed` means some synthetic interactions operate locally. Neither status means
that the hosted static page connects to the real application service.

## Highest-impact gaps in the original static review

The application already has the following workflows. A simplified static screen
must not become a replacement specification that silently drops them.

| Area | Existing behavior that must remain | Original preview limitation |
| --- | --- | --- |
| Staff command center | Exact queue populations, paging, page-bound bulk selection, explicit eligibility attestation, partial failure recovery and retry of failed records | Sample queue/list navigation and a generic review receipt |
| Member record | Assessment history/retake, readiness, résumé, funding, WIOA review, consent, counselor/partner/subgroup assignment, notes, messages, service requests, Coursera approval and recorded placements | Generic record tabs and a short summary |
| Employer applicants | Allowed status transitions, confirmed hiring, interview date/time/place, submitted résumé snapshot, notes, history and employer ownership | Read-only sample detail and navigation |
| Employer matching | Match score/reasons, mutable candidate Kanban, match history, work-queue actions and rollback on failure | Generic tables; no real status update |
| Partner attention | Priority filters and pagination, outreach logging, assignee changes, draft preservation and workflow timeline | Structural sample table |
| Partner member visibility | Referral ownership, partner-type field restrictions, minor/FERPA visibility, curriculum progress and verified-placement detail | Small synthetic member summary |
| Partner reporting | Referral/outcomes/demographics/outcome-packet exports, unknowns, separate pending/verified placements and payout eligibility | Fixed charts/counts and layout examples |
| Coursera operations | Mappings, exact identity resolution, unmatched learners, B4B reconciliation, enrollment/provisioning queues, CSV imports and xAPI/health diagnosis | Structural tables and form examples |
| Billing | J5/J6 stages, readiness blockers, recipients, designated signer, version/archive history and release gates | Document layout only; no signing, creation or send |
| Email operations | Scheduled-job controls, template edits/previews, explicit test send and recovery of the original uncertain request | No provider requests or delivery events |
| Entry and token links | Safe return destinations, staff MFA, referral disclosure, validation, expiring/single-use identity-bound links and recovery states | Sample entry fields and route handoffs |

The JSON points to individual implementation files for each obligation. For
example, `components/employer/ApplicationStatusUpdater.tsx` and
`InterviewDetailsForm.tsx` own candidate transitions and interview details;
`components/partner/PartnerAttentionClient.tsx` owns outreach/assignment behavior;
`lib/partner/dataAccess.ts` owns partner visibility rules; and
`components/admin/EmailTemplatesClient.tsx` owns test-send retry state.

## Boundaries that are part of the feature

Preserve these with the UI, rather than treating them as optional implementation
details:

- **Identity and scope:** the admin tenant scope, linked employer/partner, selected
  member/job/application and actual role-switching rules. A card being hidden is
  not the authorization boundary.
- **Draft and failure recovery:** partial bulk-review results, uncertain email
  test receipts, outreach drafts, job status rollback and pending submissions.
- **Evidence states:** reported versus verified placement, uploaded versus
  reviewed certification, portal approval versus Coursera enrollment/progress,
  and saved/accepted/delivered/unknown notification states.
- **Private data projections:** partner-type restrictions and minors' consent
  rules also apply to totals, exports, milestones, messages and outreach.
- **Release gates and confirmation:** billing, enrollment agreements, privileged
  operations, account deletion, merging, hiring, revoking invitations and content
  publication keep their existing authorization and confirmation steps.
- **Legacy navigation:** canonical redirect destinations and locale-prefixed
  fallback pages continue to resolve the original record identifier.

## Existing behavioral suites for the redesign gate

These tests exercise application components or route handlers with controlled
dependencies. They are useful regression gates; they are not a live provider or
authenticated browser acceptance run.

| Suite | Behavior protected |
| --- | --- |
| `tests/components/admin-command-center-workflows.spec.tsx` | Exact queue counts, selection scope, partial failures, attestation and unknown health |
| `tests/components/employer-application-status-updater.spec.tsx` | Allowed transitions, stale-state feedback, hire confirmation and cancellation |
| `tests/components/employer-interview-details-form.spec.tsx` | Time-zone-preserving editing, saved values and inline failure recovery |
| `tests/api/employer-application-status-transitions.spec.ts` | Compare-and-set transitions, allowed effects and employer ownership |
| `tests/components/partner-attention-pagination.spec.tsx` | Queue paging, outreach drafts, assignee updates and stale-response protection |
| `tests/components/partner-milestones-placement-verification.spec.tsx` | Verified wins remain distinct from pending self-reports on desktop/mobile |
| `tests/api/partner-hidden-member-routes.spec.ts` | Consent-aware minors' visibility across outreach/referral actions |
| `tests/api/partner-employer-authz-matrix.spec.ts` | Cross-partner/cross-employer reads and writes are denied |
| `tests/api/export-download-authz-matrix.spec.ts` | Scoped exports and private résumé links |
| `tests/api/staff-mutation-authz-matrix.spec.ts` | Cross-organization mutation denial and same-organization positive controls |
| `tests/components/invites-kit-row-actions.spec.tsx` | Invitation actions stay available; revoke requires confirmation |
| `tests/components/admin-email-template-test-retry.spec.tsx` | Frozen requests survive lost responses, edits/reloads and actor changes |

This audit did not run these suites, mutate live data, contact providers or send
messages. Test receipts from the root verification run should accompany the
published redesign record. The original route-render sweep is separate evidence
and must not be described as functional parity.
