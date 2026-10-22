# Member and counselor feature-preservation audit

Reviewed 2026-10-22. This is a source-based preservation contract and a comparison with the static review, not an acceptance certificate for live services.

## Result and scope

The actual application theme patch contains **no identified functional removal**. The member and counselor contract records **58 route families, 165 feature obligations, and all 94 inventoried routes** in those portals: 73 member routes and 21 counselor routes. The machine-readable contract is [member-feature-contracts.json](member-feature-contracts.json).

The static review remains a mixture of local simulations and structural screens. Its route coverage must not be described as full application feature parity. The contract makes the production obligations visible even where a generic preview screen does not implement them.

Evidence revisions:

- Application baseline: `f8a12f527810ba8c1e08840a762358b0fd86e4f1` (`origin/master` in the application worktree).
- Reviewed application theme patch: `0f0ba157740a4dd8142614477efadc142eaf1069`.
- The older route inventory is based on `efc27e4a4ebeba09b5261e7b1c36463d01925017`. All 94 member/counselor page files in that inventory were compared with the application worktree and are byte-identical. Feature evidence was nevertheless read from the newer application revision and its imported components, helpers and API handlers.
- Static-review evidence: `review-model.mjs`, `review.js`, `voice-review.js`, `screen-definitions.json`, and the dedicated Skill Mapper module. This audit does not transfer earlier artifact hashes or browser receipts to a newly generated artifact.

Every cited contract source path was checked for existence in the application worktree. Exact route matching, including the explicit `/dashboard/[...slug]` not-found entry, leaves no uncovered member/counselor inventory route. Wildcards group related routes; they do not establish that arbitrary new URLs exist or that a user may access them.

## Actual application patch review

`git diff origin/master` changes 11 files: two runtime TSX components, three CSS files, five test files and the kit guide. Runtime changes are limited to presentation:

- `components/portal/ReadinessCoachReturnButton.tsx` uses the fixed deep-gold hero tokens and the hero foreground for its existing button.
- `components/portal/kit/pages/VoiceStudioKit.tsx` uses fixed deep-crimson hero tokens and opaque readable text for the existing Resume Studio banner and coach card.
- `css/portal-tokens.css` reduces the background wash and makes the sticky header surface more opaque.
- `css/portal-kit.css` and `css/portal.css` remove high-specificity generic card gradients, use solid surface/elevation tokens, and allow semantic hero and dense variants to retain their own treatment.

The reviewed diff does not remove controls, event handlers, links, component props or content; change routing, authentication, authorization, API handlers, database models or provider calls; or add CSS visibility/pointer rules that suppress workflows. The runtime TSX changes are style values and comments. Existing behavioral code remains in place. This supports the bounded conclusion that the theme patch preserves application functionality in source. It does not prove production configuration, provider availability or every rendered layout state.

## What each contract status means

| Status | Meaning in this review | Families |
| --- | --- | ---: |
| `simulated` | A dedicated local interaction represents part of the workflow. It uses synthetic data and does not connect to application services. | 6 |
| `structural` | Navigation, read-only schemas or illustrative content represent the route. Its business actions are source obligations. | 23 |
| `mixed` | Some local interaction exists, while material application behavior remains unimplemented in the static review. | 29 |

These are family-level descriptions, not feature-by-feature acceptance results. A contract panel that lists a feature does not implement or verify it. Integration names identify dependencies found in source; they are not connection or delivery receipts.

## Member obligations and preview gaps

| Route family | Application behavior to preserve | Static-review limit |
| --- | --- | --- |
| Dashboard, enrollment and program | Consistent primary/owned secondary enrollment; assigned curriculum counts; approval/intake and goals; course launch; weekly study plan and separate course drafts; provider failure states. | Synthetic home/program fixtures omit the complete curriculum workspace, enrollment selection and persistence. |
| Learning, modules and labs | Authored module lessons and explicit completion; private lab drafts; deliberate immutable submission; rubric feedback, revisions and recovery. | Module URLs currently use a generic lab renderer. The dedicated lab simulation covers the local draft/submission/review sequence with a simplified fixture. |
| Assessment and retake | The 35-question assessment, answer-quality confirmation, history, two-attempt ceiling, staff-authorized final attempt, atomic authorization consumption, pre-screening drafts and interview requests. | The assessment screen is a read-only step schema. Its navigation is not assessment execution. |
| Readiness | Shared progress evidence, honest unavailable states, readiness summary and coaching context. | A synthetic report and simulated coach do not calculate or persist the real member score. |
| Documents and certifications | Private agreement/document access, signed revisions, upload/review states, certificate records and exports. | Read-only sample records do not upload, verify or download member documents. |
| Resume files and Resume Studio | Original/uploaded source integrity; file extraction and quality failures; document generation/preview/download; Score, Rewrite and Coach modes; saved results; explicit suggestion acceptance/rejection. | Local text editing and the voice-editor simulation omit the full file, scoring, rewrite and history workflow. |
| Voice and conversational coaching | Canonical coach selection, deep links, browser navigation, active-session state, startup recovery, target-role context and route-specific completion/history behavior. | Sessions are locally simulated. No microphone, camera, ElevenLabs connection or durable conversation receipt is created. |
| AI tools | Tool-specific inputs, output structure, saved history and follow-through for cover letters, elevator pitches, gaps, job matching, LinkedIn About/headlines, salary negotiation, interview practice, conversational interview coaching and interview-prep bundles. | Most tool URLs use one shared prompt and a fixed response. The generic form does not reproduce each tool's real workflow. |
| Benefits, skills and career discovery | The versioned benefits estimator; O*NET occupation/interest matching; skill profile and resume extraction; Training Bridge; course/program checkpoints; PDF exports and explicit provider failures. | The benefits tool is not the source calculator. Skill Mapper now has a richer local simulation; other generic screens still omit the source workflows. |
| AI history | Owned saved results, tool filtering, expansion and copying. | `/dashboard/ai-tools/history` currently enters the generic tool renderer. Skill Mapper local history is a separate fixture. |
| Jobs and application tracking | Job eligibility/filtering, selected posting details, consent and an immutable owned resume snapshot, tailoring, and a separate personal application tracker. | Job search/detail/apply is a local simulation; personal tracker rows are read-only. No employer application or snapshot is created. |
| Messages and profile | Assigned-staff scope, retry/draft safety, successful mark-read acknowledgement, accurate presence, mobile inbox, full contact/preferences, photo, language, push, export and deletion. | The synthetic thread and four-field profile do not reproduce the complete application. Preview appearance storage is isolated from the application's preference. |
| Resources and career planning | Assigned-program resources, career-library content/progress/downloads, goals and personalized career briefs, weekly recaps, referrals, points and survey consent. | Generic links, reports and schemas do not execute these workflows or award points. |

The main evidence paths are attached to each obligation in the JSON. Shared sources particularly important to future implementation are `lib/member/loadMemberDashboardHome.ts`, `lib/member/getActiveProgramForDashboard.ts`, `lib/member/curriculumAssignment.ts`, `components/portal/kit/pages/member/MemberTrainingWorkspace.tsx`, `components/portal/AssessmentForm.tsx`, `components/portal/ResumeStudioClient.tsx`, `components/portal/ResumeCoachWorkspace.tsx` and `components/portal/PortalVoiceSession.tsx`.

### Skill Mapper's current boundary

The new dedicated review module supports occupation search over ten fixtures, occupational and member radars, skill gaps, training recommendations, local history and JSON/CSV export. Its `mixed` contract is intentional. The production source in `components/portal/tools/SkillMapperClient.tsx` and `app/api/ai/skill-mapper/route.ts` additionally relies on live O*NET lookups, member skill-profile storage, resume-skill extraction and the application's PDF export API. Fixture edits do not save a real member's skills, and the local training section does not enroll anyone or replace Training Bridge's saved-result lookup.

### Human appointments, AI counselors and mentorship

`/dashboard/counselor` is Lilley AI career coaching; `/dashboard/counselor/[id]` is an owned saved AI result. Human counselor conversations are at `/dashboard/messages`. No standalone member `/dashboard/appointments` route was found in the audited source/inventory.

`lib/counselor/bookingLink.ts` accepts a suitable HTTPS calendar link or configured counselor booking URL and otherwise returns `/dashboard/messages`. The inspected consumer is `emails/member-stuck.ts`, through the Resend email flow in `lib/email.ts`; this is not an in-portal appointment system. Separately, `components/portal/MentorSessionForm.tsx` posts mentor session requests with date/time, topic and notes to `/api/mentors/[mentorId]/sessions`. `/dashboard/mentor` requires the authenticated user to have the corresponding Mentor record. A member preview does not grant that role.

## Counselor obligations and preview gaps

The counselor contract covers Today/overview, roster, member records, attention queues, messages, notifications, staff-assisted sessions and walk-ins, labs, placements, profile, guide and resources.

The actual member record at `app/(portal)/counselor/students/[memberId]/page.tsx` has four panels: **Profile, Training, Career and Messages**. It must retain selected-member authorization, intake/WIOA/assessment evidence, authorized final retakes, curriculum and skillsets, resume/document access, agreements and billing packets, service requests, points, notes, employment information and contextual messaging. The static member-detail tabs and sample decision are not a replacement for those panels.

Today and attention queues preserve ranked work, approval states, partial-load errors, scope, filters and explicit bulk actions. Their read-only review schemas do not send follow-ups, reassign a member, dismiss an item or mark notifications read. Counselors' synthetic messages also do not provision a real thread or deliver realtime events. `lib/counselor/staffMemberAccess.ts` and the corresponding API checks remain authoritative for access.

`components/portal/sessions/SessionRunClient.tsx` must keep selected-member identity, stable session context, the correct original/uploaded resume, separate tool inputs, voice walkthrough and deliberate email-packet delivery. Session/walk-in preview schemas do not execute those actions. The lab simulation omits the full rubric, assignment checks and concurrent-review handling; a placement row does not verify employment. The counselor profile preview currently falls back to a generic organization-settings layout, while the real profile supports counselor-specific name, phone and public-title fields.

## Existing regression coverage to reuse

The following are meaningful existing component/API suites, selected for behavior rather than source-string assertions. This sub-audit inspected source and did not run them; execution results belong in the separate verification receipt.

| Concern | Existing tests | Important assertions |
| --- | --- | --- |
| Voice navigation and session retention | `tests/components/voice-studio-navigation.spec.tsx`; `tests/components/voice-studio-coach-persistence.spec.tsx`; `tests/components/voice-startup-recovery.spec.tsx` | Deep links/back-forward, coach choice, active session state and startup recovery. |
| Voice API identity | `tests/api/voice-session-boundaries.spec.ts` | Authentication, quota, non-cacheable session responses and minimized context. |
| Training drafts and curriculum | `tests/components/member-training-workspace.test.tsx`; `tests/api/member-training-workspace.spec.ts` | Assigned course set, notes do not award completion, late-save/newer-edit safety, retry, ownership and curriculum-version rejection. |
| Course links and shared progress | `tests/components/member-program-module-links.test.tsx`; `tests/lib/member-progress-parity.spec.ts` | Correct Coursera/internal destinations, locked states and common progress denominators. |
| Assessment and staff retakes | `tests/api/assessment.spec.ts`; `tests/api/counselor-assessment-retake.spec.ts`; `tests/components/assessment-retake.spec.tsx` | Scoring, exact final-attempt authorization, atomic consumption, refusal before effects, confirmation and retry. |
| Pre-screening | `tests/components/member-pre-screening-draft.spec.tsx`; `tests/api/member-pre-screening-idempotency.spec.ts` | Read/draft recovery and lost-response retry without duplicate submission effects. |
| Lab evidence and feedback | `tests/components/member-lab-workspace.test.tsx`; `tests/components/lab-evidence-review.test.tsx`; `tests/api/lab-evidence.spec.ts` | Private drafts versus explicit submissions, revision conflicts, full rubric and access. |
| Resume failures and source integrity | `tests/components/member-resume-upload-failure.spec.tsx`; `tests/components/member-resume-build-failure.spec.tsx`; `tests/components/member-resume-pdf-preview.spec.tsx`; `tests/components/resume-rewriter-source.spec.tsx` | Retry after bad responses, usable document preview and correct original source. |
| Application consent and snapshots | `tests/api/job-application-resume-snapshot.spec.ts` | Explicit consent, owned immutable copy, quarantine handling, copy/transaction failure and lost acknowledgement. |
| Messages and staff access | `tests/components/member-messages-presence-and-read.spec.tsx`; `tests/api/counselor-thread-access-gate.spec.ts` | No false online claim, read acknowledgement before clearing, thread scope before creation. |
| Counselor records and notes | `tests/app/counselor-student-detail-tabs.spec.tsx`; `tests/components/counselor-note-saves.spec.tsx`; `tests/components/counselor-approval-queue.spec.tsx` | Four real panels, keyboard/deep-link tabs, retake control, newer drafts, partial failures and queue ordering. |
| Staff-assisted sessions | `tests/components/session-run-resume-source.spec.tsx`; `tests/api/counselor-session-email-packet.spec.ts` | Original resume context and correct packet destinations; packet-link assertions do not prove email delivery. |
| Profile and scheduling semantics | `tests/components/member-profile-kit-contact-fields.spec.tsx`; `tests/api/member-profile.spec.ts`; `tests/api/mentor-session-topic.spec.ts`; `tests/lib/counselor-booking-email.spec.ts` | Contact validation/clearing, topic versus notes, valid calendar links and message fallback. |

No production database, authentication session, Coursera, O*NET, AI/voice provider, storage object, booking service or email delivery was exercised for this audit. The remaining acceptance work is to validate real member/staff flows against authorized development fixtures when application behavior is changed; route coverage and visible obligation panels cannot substitute for those checks.
