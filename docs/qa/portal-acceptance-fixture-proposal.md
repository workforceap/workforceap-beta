# Run-owned portal acceptance fixture proposal

Status: proposed, not authorized for hosted creation. Prepared 2026-10-27 from
the current route loaders and Prisma schema at integration HEAD
`6e1214aca3e9f13af3c008e984b2b20e211c4800` plus the concurrent acceptance changes.
This document creates no records and grants no enrollment, mentor, catalog,
provider, or publication approval. Existing five-role lifecycle and recovery
requirements remain mandatory.

## Proposed minimum and decisions

| Surface | Proposed positive fixture | Decision still held |
| --- | --- | --- |
| Saved counselor result | One `AIToolResult` owned by the run's member, with synthetic text and `toolType=career_counselor` | Review the exact seeded text and fixture contract; no AI/provider call |
| Assigned program and practice lab | One run-member `CourseEnrollment` for `it-support-professional-certificate-ibm`, immutable `legacy-v1`; render `ticket-triage` | Staff-approved synthetic assignment only; never assign an existing member or migrate a curriculum |
| Module page | Existing ungated `digital-literacy-empowerment-class-course-1` with its exact program query | No new enrollment or catalog record needed; provider links are not followed |
| Mentor owner dashboard | One inactive, unapproved `Mentor` attached to the run's member; no sessions | Review this synthetic owner fixture; it is not approval to offer mentoring |
| Mentor profile/directory | The same mentor made active with an explicit approval timestamp | Approval and visibility in shared DEMO are held; current queries lack organization filtering |
| Other dynamic routes | Two checked-in content paths, plus one run-owned synthetic live job | Job publication/visibility in shared DEMO is a separate held choice |

Reversible proposed defaults are the inactive/unapproved mentor, no mentor
sessions or specialties, no saved lab work, no course progress, no provider
launch, and no live synthetic job until its exposure is approved. These defaults
leave the corresponding positive cases incomplete. Elapsed time does not turn
any held choice into approval. The delivery coordinator should present this
reviewable contract to the responsible staff/product/security owners; a boolean
in a submitted JSON file is not approval evidence.

## Exact identity and record contract

Use the existing run identity and the five Auth/app identities already recorded
by the durable journal. `memberId`, `adminId`, `employerId`, and `organizationId`
below are references resolved from that journal, never caller-chosen existing
records. Require their exact run email, role and organization before the seed
transaction. Keep the member's stored/effective role `member` and super-admin
false. A mentor relation does not justify changing its role to `mentor`.

During the plan step, allocate UUIDs once for `ids.counselorResult`,
`ids.enrollment`, `ids.mentor`, and, only if approved, `ids.job`. Include every
allocated UUID, exact scalar value, reference, timestamp, content hash, phase and
approval reference in the canonical fixture plan before computing `planHash`.
Persist that exact plan before creation; an existing run must never generate
replacement IDs or silently adopt rows with matching names. IDs alone are not
ownership proof. Read back the exact referenced graph and compare all fields.
`fixtureAsOf` is one UTC timestamp captured in the plan, reused on both Preview
deployments. Fixture rows share the DEMO database; do not create baseline and
candidate copies.

| Model | Exact minimum proposed values |
| --- | --- |
| `AIToolResult` | `id=ids.counselorResult`, `userId=memberId`, `toolType='career_counselor'`, `inputSummary='Synthetic portal acceptance: <runId>'`, `output='Synthetic career-coaching record for acceptance run <runId>. Practice identifying a career goal and one next action. No real counseling session or AI generation occurred.'`, `createdAt=fixtureAsOf`, `parentToolResultId=null` |
| `CourseEnrollment` | `id=ids.enrollment`, `organizationId=journal.organizationId`, `userId=memberId`, `programSlug='it-support-professional-certificate-ibm'`, `curriculumVersion='legacy-v1'`, `isPrimary=true`, `enrolledAt=fixtureAsOf`, `enrolledByAdminId=adminId`, `fundingSource=null`, `fundingNotes=null`, `workspaceEmail=null`, `workspaceEmailProvisioned=false`, `sponsoredByPartnerId=null` |
| `Mentor` owner-only state | `id=ids.mentor`, `userId=memberId`, `fullName='Synthetic acceptance mentor <runId>'`, `title='Acceptance fixture'`, `company='Synthetic DEMO fixture'`, `industry='Information technology'`, `bio='Synthetic portal acceptance profile. No real mentor service is offered.'`, `availableHours=0`, `totalHoursDonated=0`, `isActive=false`, `approvedAt=null`, `linkedinUrl=null` |
| `Mentor` approved-profile state, if separately approved | Same exact row; only `isActive=true` and `approvedAt=fixtureAsOf` may change, under a separately journaled fixture transition. No email/approval helper invocation. |

No `Organization`, `OrganizationProgramCatalog`, `Course`, provider mapping,
`CourseProgress`, `MemberProgramProgress`, `TrainingStudyPlan`,
`TrainingCourseWork`, billing, certificate, lab draft/submission/review, mentor
specialty or mentor session is required for these minimum rendering cases.
Their unexpected presence must remain a cleanup failure, not be swept into a
table-wide allowance.

The enrollment must use the existing canonical
`upsertEquivalentCourseEnrollment(tx, ...)` writer, inside the journal's atomic
fixture transaction. First prove the run member has **zero** existing
enrollments and progress. Supply the exact `create` fields above and no updates;
require `assignmentOutcome='created'`, returned ID `ids.enrollment`, exact
curriculum, and exactly one primary enrollment. Refuse an existing or concurrently
created equivalent assignment. Do not change `User.enrolledProgram`, infer
enrollment from Coursera data, add a direct `courseEnrollment.create` shortcut,
or relax the writer guard.

## Why these records match the current loaders

- Saved-result lookup requires the exact result ID **and** authenticated
  `userId` **and** `toolType='career_counselor'`. The model cascades from User;
  its optional parent/feedback relationships must remain absent. See
  [saved-result page](../../app/(portal)/dashboard/counselor/[id]/page.tsx) and
  [Prisma schema](../../prisma/schema.prisma), `AIToolResult` at line 1122.
- Program selection reads `CourseEnrollment`, primary first. It does not require
  populating the legacy user pointer. See
  [program selection](../../lib/member/getActiveProgramForDashboard.ts) and
  [canonical enrollment writer](../../lib/member/courseEnrollmentAssignment.ts).
- Practice eligibility is exactly IBM IT Support + `legacy-v1` + historical
  course `it-support-professional-certificate-ibm-course-10`. The published lab
  IDs are `ticket-triage`, `network-diagnosis`, `safe-recovery`, and
  `support-handoff`, with content/rubric version `2026-09-09.v1`. Start with
  `ticket-triage`. [Lab loader](../../lib/member/labWorkspace.ts) binds user,
  organization and enrollment; a GET synthesizes an empty draft in memory and
  creates no draft row. The catalog eligibility guard also verifies the frozen
  historical course name/hours and absence of provider course identifiers.
  See [lab content](../../lib/content/itSupportLabs.ts).
- **Do not use IBM course-10 as the module URL.** A pure local resolver check
  returned `null` from `resolveWorkforceApModule` for that legacy course, while
  the lab resolver returned its four labs. The module loader requires
  `kind='workforceap'`. The verified positive module is `Computer Basics`,
  `digital-literacy-empowerment-class-course-1`, which the current route explicitly
  permits without enrollment. See [module page](../../app/(portal)/dashboard/learning/modules/[courseSlug]/page.tsx),
  [module resolver](../../lib/content/workforceApModule.ts), and
  [digital literacy contract](../../shared/digitalLiteracyPathway.ts).
- Mentor owner lookup requires only `Mentor.userId=authenticated member`; an
  inactive/unapproved row renders its empty owner dashboard. Profile/directory
  lookup additionally requires `isActive=true` and non-null `approvedAt`.
  `Mentor` has no organization column, and these queries have no tenant
  predicate. Source inspection does not prove runtime RLS isolation. An approved
  synthetic mentor may become visible to other viewers of the shared database.
  See [owner dashboard](../../app/(portal)/dashboard/mentor/page.tsx),
  [profile](../../app/(portal)/dashboard/mentors/[mentorId]/page.tsx), and
  [directory](../../app/(portal)/dashboard/mentors/page.tsx).
- Keep the existing read-only capability active. Program rendering passes it to
  the B4B progress loader, which returns without OAuth/provider/cache activity;
  the career brief similarly suppresses personalized generation. Browser network
  guards alone cannot suppress a server-side provider call. Do not click module
  completion, provider launch, lab save/submit/review, mentor booking, or volunteer
  letter controls in this read-only scenario.

## State phases are required, not only populated dynamicRoutes

The current browser plan unconditionally includes `/dashboard/mentor` redirecting
to `/mentor/apply`, and `/dashboard/program/start` and
`/dashboard/program/employer-screening` redirecting to `/dashboard/program`.
Those expectations conflict with adding the corresponding records. Its
`mentorApproved` flag only enables a comparison; it does not remove the
contradictory no-mentor redirect. See
[browser plan](../../scripts/lib/portal-browser-plan.mjs) and
[fixture-dependent route inventory](../../scripts/lib/portal-audit-paths.mjs).

Proposed harness phases, all under one run identity and immutable plan:

1. `unassigned`: the existing five-role fixture, no enrollment or mentor. Prove
   the no-mentor/no-assignment redirects and ordinary role boundaries.
2. `assigned-owner`: atomically create/read back the result, enrollment and
   inactive mentor. Render the result, program, module, assigned empty lab, and
   mentor owner dashboard. `/program/start` now renders at its own URL. Do not
   keep asserting the phase-one redirects. Missing employer-screening packs
   remain explicit noncoverage; no global screening pack is fabricated.
3. `approved-profile`, only after the exposure decisions: transition the mentor
   to the exact approved state, optionally create the reviewed synthetic job,
   then render their positive detail cases. Without approval, record incomplete
   cases and stop any full-acceptance claim.

Each receipt/case ID needs a trusted phase dimension (or an equivalent exact
fixture-state digest). The aggregator must require the prescribed cases from
each phase, not allow one phase to replace failures in another. Expected routes
must be derived from verified fixture state, not freeform caller exceptions or
a success-shaped fallback. Both Preview deployments must support the identical
content contract and read the same phase before screenshots are compared.

Separate browser invocations per phase require explicit phase-qualified login
operations and bounded journal event budgets, e.g.
`browser-login:<phase>:<candidate|baseline>:<role>`. This is a **proposed**
allowlist change, not currently accepted by the two-target login contract. Do
not reuse a completed operation ID, allow unbounded login retries, export auth
state, or weaken the new `beforeSend`/response observation boundary. Only the
fixture coordinator performs transitions between runs. An alternative context
reuse design needs its own reviewed coordinator handoff; the browser must not
perform hidden fixture writes.

## Suggested input schemas

Add a typed seed blueprint to the reviewed fixture plan, not arbitrary JSON
Prisma writes. Example shape (angle-bracket strings are required resolved values,
not usable fixture IDs):

```json
{
  "schemaVersion": 1,
  "contract": "portal-synthetic-fixtures-v1",
  "runId": "<workflowRunId>-1",
  "fixtureAsOf": "<plan UTC timestamp>",
  "ids": {
    "counselorResult": "<reserved UUID>",
    "enrollment": "<reserved UUID>",
    "mentor": "<reserved UUID>"
  },
  "actorRefs": { "member": "users.member", "assigningAdmin": "users.admin" },
  "savedResult": { "toolType": "career_counselor", "template": "synthetic-coaching-v1" },
  "assignment": { "programSlug": "it-support-professional-certificate-ibm", "curriculumVersion": "legacy-v1", "isPrimary": true },
  "module": { "programSlug": "digital-literacy-empowerment-class", "courseSlug": "digital-literacy-empowerment-class-course-1", "requiresEnrollment": false },
  "lab": { "labId": "ticket-triage", "contentVersion": "2026-09-09.v1", "rubricVersion": "2026-09-09.v1", "state": "empty-assigned" },
  "mentor": { "ownerRef": "users.member", "state": "inactive-unapproved", "sessions": [], "specialties": [] },
  "phases": ["unassigned", "assigned-owner"],
  "approvalRefs": { "syntheticAssignment": null, "mentorOwnerFixture": null, "mentorDirectoryExposure": null, "syntheticLiveJob": null }
}
```

Resolve and verify IDs from the committed graph, then generate the existing
browser input keys: full `identity`, both deployment IDs, `memberId`,
`dynamicRoutes`, and `mentorApproved`. Never pass the blueprint as a new unknown
browser input key until its validator and trusted plan hashing support it.
The final positive route bindings would be:

```json
{
  "dynamicRoutes": [
    { "pattern": "/dashboard/career-brief/[slug]", "path": "/dashboard/career-brief/2026-03-21-weekly-brief" },
    { "pattern": "/dashboard/career-library/[id]", "path": "/dashboard/career-library/ats-resume-template" },
    { "pattern": "/dashboard/counselor/[id]", "path": "/dashboard/counselor/<ids.counselorResult>" },
    { "pattern": "/dashboard/jobs/[id]", "path": "/dashboard/jobs/<ids.job>" },
    { "pattern": "/dashboard/learning/modules/[courseSlug]", "path": "/dashboard/learning/modules/digital-literacy-empowerment-class-course-1?program=digital-literacy-empowerment-class" },
    { "pattern": "/dashboard/learning/labs/[labId]", "path": "/dashboard/learning/labs/ticket-triage" },
    { "pattern": "/dashboard/mentors/[mentorId]", "path": "/dashboard/mentors/<ids.mentor>" }
  ],
  "mentorApproved": false
}
```

This is a schema proposal, not a runnable all-passed manifest: omit the job and
approved-profile bindings until their decisions and positive fixtures exist;
their required cases remain incomplete. The current boolean cannot accurately
represent owner-only versus approved-profile state. Replace it with a reviewed
typed mentor proof when implementing phases, while refusing the old ambiguous
combination. Do not set it true based solely on the inactive record's existence.

The brief and resource already exist in checked-in content. Hash their manifests
and referenced files at both immutable SHAs and require the exact IDs above;
do not pick the first record returned by a live list. No content writes or
resource-progress records are needed.

The remaining job pattern cannot be satisfied by borrowing an arbitrary real
job. If separately approved, its minimal record is `Job(id=ids.job,
organizationId=journal.organizationId, employerId=journal.employerId,
title='Synthetic acceptance job <runId>', description='Synthetic QA listing;
not a real vacancy. Do not apply.', status='live', expiresAt=<bounded run expiry>,
approvedAt=fixtureAsOf, approvedById=adminId, sourceUrl=null,
requirements=[], preferredCertifications=[], suggestedPrograms=[],
applicationsCount=0)` with explicit schema defaults for other fields. The
existing run employer is active. The member detail query requires live status,
a non-inactive employer, and an unexpired/null expiry; it does not add an
organization predicate. Therefore live publication is held for the same shared
DEMO exposure review, including background notification/matching jobs. Do not
create applications, matches, saved jobs, contact actions, or a screening pack.

## Implementation and cleanup boundaries

The later acceptance implementation needs all of these changes together:

- Extend the typed plan/fixture state, trusted plan hashing, and workflow handoff
  with the exact blueprint and approval provenance. Reject unresolved references,
  foreign actors, absent approvals, duplicate IDs and unsupported content on
  either deployment before writes.
- Add narrow atomic fixture operations to the durable coordinator. The graph
  currently rejects `AIToolResult`, `CourseEnrollment`, `Mentor` and `Job` as
  unexpected related models. Permit only the exact reviewed record sets and
  values for their named phases. Preserve foreign-edge and all-other-model
  rejection. Do not globally allow extra tables or readbacks.
- Test initial creation, exact readback, prohibited foreign relationships,
  pre-dispatch failure, known failure, unknown write outcome, terminal-proof
  recovery, cleanup interruption and repeated cleanup. Retain audit rows.
- Derive phase route expectations and required case IDs from the trusted graph;
  keep existing local render fixture, five-role mutation, staff comparison,
  database readback and cleanup lanes required. A synthetic initial state does
  not prove a member completed assessment, counseling, training or mentoring.

Cleanup is exact-graph compare-and-set after all writers are quiescent and
pending outcomes are resolved. Expected extra dependents are **zero** in this
minimal proposal. If any appear, hold cleanup rather than following cascades
into unowned work. In the authorized cleanup transaction, delete by the exact
journal IDs and expected owner/value predicates: synthetic job (if created),
mentor, saved AI result, enrollment, then the existing five-role graph and Auth
cleanup. Mentor sessions/specialties would precede Mentor; lab reviews then
submissions then drafts would precede enrollment, but none are authorized here.
Verify absence of every new ID and all extra dependent rows before cleanup can
pass. `CourseEnrollment.organization` is restrictive; never delete the shared
organization. User deletion cascades the result/enrollment/mentor, but that is
not permission to skip graph verification. AI feedback/child-result links,
foreign mentor sessions, job applications/matches, and unexpected training data
must all stop destructive cleanup.

No product routes, catalog definitions, provider configuration or real member
assignment changes are part of this proposal. Any change needed to address
shared-directory exposure belongs in a separately reviewed product/security
scope, not a fixture bypass. Preview lab save/submit/review additionally refuse
transaction-flattening environments; this proposal covers read-only rendering,
not those mutating workflows.

## Validation evidence and limits

The earlier target-helper suite completed with **20/20 tests passed** on Node
22.23.4 at 2026-10-27 00:05:41 EDT, duration 4.56s, tool output chunk `cd2e57`.
That command's original output was returned directly and no original log file
was saved. The target helper/tests were unchanged during this proposal; they
were not rerun merely to recreate a log. The durable summary is
`C:\Users\mabro\personal-agent\outputs\wap-orchestration-20261026\portal-browser-handoff.md`.

After the deferred-dispatch spec change, fresh checks passed and logs were saved
under this worktree:

- `test-results/portal-loader-proof/sourcecheck.log`: successful strict scoped
  TypeScript and exact `.mts` lint; empty output on success, tool completion
  `2c0295` exit 0.
- `test-results/portal-loader-proof/actual-suite-collection.log`: actual
  Playwright config collected one test at spec line 199, exit 0.
- `test-results/portal-loader-proof/journal-loader-collection.log`: actual suite
  plus conditional journal-loader probe collected two tests, exit 0. It loads
  the module without opening its runtime.

The final dispatch marker is now awaited in the guarded handler immediately
before permitting the singleton login POST; failures during page navigation or
form selection do not mark the request dispatched. The handler reserves its
single request before awaiting the marker, and the callback clears its handler
in `finally`. Integration owns the lifecycle implementation and full validation.

Pure local content checks confirmed the IBM lab binding, rejected IBM course-10
as a module, and resolved Computer Basics as the valid module. No browser was
started and no credential, database, provider or hosted fixture action was
performed. This proposal is not end-to-end acceptance evidence.
