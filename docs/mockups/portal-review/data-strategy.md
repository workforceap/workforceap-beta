# WorkforceAP: connected portal data and acceptance strategy

**Source baseline:** `workforceap/workforceap-beta` master `efc27e4a4ebeba09b5261e7b1c36463d01925017`, rechecked October 20, 2026. This is a design and verification contract grounded in that source. It does not certify production behavior, authorize a database change, or report unexecuted tests as passing.

The review experience should let a reviewer follow every actual screen, including deep links, redirects, detail records, errors, and a safe way back. Fifteen critical journeys in `journeys.json` connect those screens to meaningful tasks. `route-acceptance-matrix.csv` gives every inventoried route an acceptance row. A complete route inventory is broader than the fifteen journeys: each individual screen still needs its own action, permission, recovery, and visual checks.

## 1. Product and data decisions

Keep the existing WorkforceAP design system and server-owned business rules. Use the shared `--wa-*` tokens and existing kit/Astryx boundaries; do not create another dashboard framework or a second navigation source of truth. The open Portal C stack already owns the five redesigned member surfaces. Expand the review to the remaining screens while preserving that work. Counselor roster navigation is also under review in PR #2831; employer empty-state consolidation remains in PR #2513.

The most important data rule is **unknown is different from empty**. A missing résumé is not the same as failed Storage access. An unavailable progress feed does not mean zero completed courses. A provider acceptance response does not mean an email arrived. An empty explicit catalog is not permission to expose every static program. These distinctions must survive the loader, API, UI component, badge, export, and analytics layers.

No schema migration is proposed for the connected mockup. Start by making existing data contracts explicit and testing the boundaries already in source. Any later schema-dependent improvement needs its own reviewed change and the actual environment preflight; a successful local build is not a migration receipt. [S1, S2]

## 2. Actual workspaces and identity

The primary portal switcher resolves **member, employer, partner, counselor, and admin**. A baseline `member` role row on a staff account is deliberately not a member entitlement. Both a layout and its child loader may execute in parallel, so member data reads must await the shared access decision. A hidden navigation item alone is never the authorization boundary. [S3]

There are also leader/group surfaces and mentorship screens. These must be represented accurately:

| Surface | Actual source and identity | Review requirement |
| --- | --- | --- |
| Member | `/dashboard/**`; verified Auth identity plus active application account and member access decision | Self data only; signed-out, expired-session, deleted-account and staff-only states |
| Counselor | `/counselor/**`; active counselor association and authorized member assignment, or the existing admin policy | Assigned and unassigned controls; assignment removal during a session; no private data flash |
| Employer | `/employer/**`; linked employer context, including explicit authorized super-admin context | Job/application ownership; unlinked-account destination; no arbitrary candidate lookup |
| Partner | `/partner/**`; linked partner, organization, tier and referred-member visibility | Same filters in list, detail, totals, exports and messages; minor visibility applied on the server |
| Admin | `/admin/**`; actor organization and existing super-admin exceptions | Each sensitive subject/action checked independently; no global data simply because a UI tab exists |
| Mentorship | Member directory `/dashboard/mentors`, profile `/dashboard/mentors/[mentorId]`, mentor identity dashboard `/dashboard/mentor`, public `/mentor/apply`, staff `/admin/mentors` | There is no standalone `/mentor` role-home. The mentor dashboard resolves `Mentor.userId`; unlinked users go to the application page. A request is pending, not a confirmed appointment. |
| Leader/group | `/leader/dashboard`, `/admin/chapters`, subgroup views/API | `Chapter` and `Subgroup` are distinct models. The current leader dashboard selects the first returned chapter; a multi-chapter selector is an explicit remaining product decision. |

The review-only role picker is a simulation control. It must never be copied into production as a way to grant an identity new privileges. [S3, S4, S5]

## 3. Source of truth by domain

| Domain | Current authority | Presentation contract and limits |
| --- | --- | --- |
| Identity and account lifecycle | Supabase Auth identity; Prisma `User`, `Profile`, `Role`, `UserRole`; `getUser` and provisioning/account checks | Auth identity and domain records can temporarily disagree. Do not join/relink users by a matching email or infer intended staff role from user-editable metadata. |
| Tenant and associations | `Organization`; `Counselor`, `CounselorAssignment`, `Employer`, `Partner`, `PartnerUser`; server actor-organization resolution | A selected partner/employer ID is not the actor's tenant identity. Server context determines allowed scope. |
| Admissions and readiness | `Application`, `ReadinessChecklist`, screening/assessment state, `EnrollmentAgreementSubmission` | Application admission, assessment completion, agreement review, funding, and training activation are separate milestones. |
| Program and curriculum | Static catalog in `lib/content/programs.ts`; `OrganizationProgramCatalog`/`PartnerProgramCatalog`; `CourseEnrollment` with organization, slug, version, primary flag and funding/provenance | There is no Prisma `Program` model at this baseline. `User.enrolledProgram` is a redundant pointer, not the full enrollment model. Display and launch the enrollment selected on screen. |
| Training evidence | `XapiStatement`, Coursera identity/mapping/progress records | Evidence ingestion, identity resolution, normalization, and display are separate stages. A received event is not automatically credited learning progress. |
| Training presentation | `CourseProgress`, `MemberProgramProgress`, `TrainingStudyPlan`, `TrainingCourseWork` | Show source freshness and the actual assigned curriculum denominator. Study notes/plans are not completed courses. |
| Labs | `MemberLabDraft`, `MemberLabSubmission`, `MemberLabReview` | Draft, submitted, reviewed, returned feedback, and unavailable each need their own state. Avoid silently turning drafts into submissions. |
| Résumé and private documents | `Profile.resumeOriginalPath`/`resumeEnhancedPath`; owned Storage objects and extraction result; private agreement revisions and their operation fence | A path is not proof bytes are readable. An extracted empty string is not proof there is no saved file. Never expose a private object URL for an arbitrary subject. |
| Career tools | `AIToolResult`, `CoachMemory`, `ApplicationAiFeedback` and current tool-specific APIs | Label saved output, draft output, and provider failure. Do not manufacture scores, market facts, employers, counselors or personal history to fill the UI. |
| Jobs and applications | `Job`, `WapJob`, `SavedJob`, `AIJobMatch`, `JobApplication`, `JobPostingApplication`, `ApplicationMessage` | Personal tracking, applying to an employer posting, and AI matches are different records. A link click does not prove an external application. |
| Communication | `MessageThread`, `Message`; `Notification`; `EmailSendLog`, `WorkflowDiagnostic`, `WebhookEvent` | Persisted app message, unread cursor, app-inbox notification, provider acceptance, and confirmed delivery are different outcomes. |
| Mentorship | `Mentor`, `MentorSpecialty`, `MentorSession` | Directory shows active approved profiles; session reads are member-scoped and the mentor dashboard uses its own identity. No pending profile is published by the mockup. |
| Outcomes | `PlacementRecord`, `PlacedOutcome`, `PlacementSurvey`; outcome methodology | Preserve verification/start/retention rules and distinguish self-report. A job status alone cannot substantiate an impact claim or payout. |
| Operations | `CronExecution`, `WorkflowDiagnostic`, `EmailSendLog`, `WebhookEvent`, `AuditLog`, `AuditEvent`, `MemberEvent` | These have different purposes and retention/audiences. A successful log write is not proof an external side effect completed. |

These are current schema/source names, not proposed new tables. The knowledge base explains important look-alike concepts and transaction limits; the schema and owning loader/route decide the actual field contract. [S1, S6]

## 4. A common screen-state contract

Use a small explicit result model at each loader/API boundary. It can be implemented without a schema change and adapted to the existing component's props:

```ts
type ReadResult<T> =
  | { state: 'ready'; data: T; observedAt: string;
      sourceUpdatedAt: string | null; completeness: 'complete' | 'partial' }
  | { state: 'empty'; checkedAt: string; reason: string }
  | { state: 'unavailable'; retryable: boolean; message: string }
  | { state: 'restricted'; message: string }
  | { state: 'audit-suppressed'; message: string };
```

This is a proposed contract, not a claim that every existing API already returns it. An `observedAt` generated for the read must not be mislabeled as the provider's last update time. If source freshness is unknown, keep it `null` and explain the uncertainty. Likewise, `complete` means the stated query population is complete; a capped result must remain partial even if the rendered rows all loaded.

| State | Expected UI | Behavior |
| --- | --- | --- |
| Loading | Structure matching the expected content; understandable status | Bound the wait; cancel stale loads; no permanently busy page |
| Ready | Actual authorized records and their status | Primary action, deep link and return path are available |
| Confirmed empty | Specific absence and an appropriate next step | Do not show a failure banner or invent records |
| Unavailable | Honest failure and safe retry; retain existing data/draft where safe | Do not reset completion or encourage duplicate work |
| Partial/stale | Current available records plus coverage/freshness explanation | Never format partial counts as full totals |
| Restricted | Established denied/not-found behavior and authorized destination | Do not leak that another person's private object exists |
| Audit-suppressed | Explain that this evidence is intentionally not loaded in review | Zero private Storage/provider/assignment calls |
| Mutation pending | Action in progress with repeat submission controlled | UI remains usable; preserve cancel/draft semantics |
| Mutation confirmed | Success tied to a persisted authoritative response | Update affected projections; show actual server time |
| Mutation uncertain | Explain that the result has not been confirmed | Reconcile the attempt before inviting a duplicate submission |

The résumé correction is the first concrete application: `getMemberResumePlainText` currently serves best-effort string consumers and can return `''` for several failure conditions. Add an outcome-aware path for Studio without changing other callers' expectations. Preserve owned-path selection, original/enhanced preferences, authenticated subject selection, and zero Storage access in read-only audit. A generic load failure should say “We couldn't check your résumé right now. Try again.” It should not assert either that no file exists or that a file is definitely saved. [S7]

## 5. Navigation and interaction state

Every real screen needs a stable identity: route pattern, role/context, current record, query/tab/filter state, parent/return destination, and a primary action. Dynamic routes need fixture identifiers that map back to the exact source template; a made-up URL does not count as coverage. Redirect aliases need their expected target and must be checked for loops. Unknown paths must end in a true not-found state, including when Next streams a body under HTTP 200.

Keep durable navigation state in the URL where the product already supports it: selected program, student detail tab, filters, page, or return context. Do not reset these on refresh, browser Back, or successful saves. Use current canonical route helpers and navigation registry instead of scattering new string paths through each screen. An invalid query must fall back safely or be rejected; it must never create an enrollment or broaden the actor's scope. [S8]

For local form state, preserve drafts across failed requests and route refreshes where the existing product intends that. Focus should move deliberately after validation, dialog close, route change, and course selection. Mobile controls must remain labeled and reachable at 375/390px; keyboard and reduced-motion users must be able to complete the same task. Data tables should have a useful mobile representation or an explicitly labeled scroll region rather than making the entire page scroll horizontally.

Messages need a specific chronology contract: carry the server's `createdAt` through both initial and realtime mappings, render semantic time/day groupings, and follow the existing portal timezone **America/Chicago**. Do not replace it with the report author's timezone. A pending message has no fabricated “sent at” timestamp. Auto-follow only when the reader is already near the end or sends their own message; show an accessible “New message” action when someone is reading older history. [S9]

## 6. Permissions, transactions and mutation correctness

Application authorization is required at every data read and action, including document previews and exports. Existing protections are deliberate: staff member access checks same-organization admin or active counselor assignment; employers reach applications through owned jobs; partners use referred-member scope, tier projections and minor visibility. A disabled button cannot substitute for these server checks. [S3, S10, S11]

Do not infer database-enforced isolation merely from a `withApiGuc` wrapper. Actual GUC/RLS behavior depends on the configured Prisma path, database role, transaction scope and deployed policy. The normal client does not always install the GUC layer. Preview transaction flattening also changes atomicity and must not be mistaken for the production transaction contract. Source inspection and local policy tests cannot prove the live configuration. [S1]

**HTTP method alone does not prove a request is read-only.** In current source, `GET /api/member/messages` calls `getOrCreateMemberCounselorThread` with `assignIfUnassigned: true`. Opening that endpoint can create a thread and assign staff. The same product contains provisioning and provider lookups during page flows. A broad authenticated crawl must use the established read-only audit behavior and a verified request policy. A standalone mockup should make no live application requests at all. [S12]

Mutation strategy must be feature-specific:

1. Resolve the actor from the verified session, not a submitted actor ID. Recheck subject scope when writing; access may have changed since the page loaded.
2. Validate shape, allowed fields, business state and explicit confirmation before the effect. Freeze the reviewed payload when an external operation requires exact retries.
3. Use the existing transaction/fence/version mechanism. Training workspace already refuses a changed curriculum rather than saving into a stale assignment. Member message persistence resolves assignment again under the handoff lock. Preserve both. [S12, S13]
4. Distinguish failed-before-effect from ambiguous-after-effect. A browser timeout may follow a successful database write or provider acceptance.
5. Query the existing durable result/attempt before retrying an ambiguous create or send. Reuse a documented idempotency key where that feature has one. Do not claim a universal idempotency mechanism for all WAP mutations: current message and mentor-session POSTs do not demonstrate one.
6. Invalidate/refetch only affected views after confirmed persistence. Avoid optimistic “completed,” “approved,” “published,” “paid,” or “delivered” states when the server has not confirmed them.

Existing email queue-digest and placement-survey mechanisms already distinguish attempts and frozen retries. Reuse their semantics when extending those features instead of introducing a second delivery ledger. They still do not provide an exactly-once inbox guarantee. [S2]

## 7. Synthetic data strategy for the full review

Create one clearly labeled synthetic organization and separate synthetic identities for the demonstrated roles. Use stable non-production IDs and reserved fixture addresses, never copied participants. The sample member, application, job, course progress, referral and message must refer to the same IDs across their respective screens. Changing role in the review changes which projection is visible, not the underlying meaning of a record.

Keep fixture data outside live loaders. The review should have no Supabase client, no database URL, no production API base URL, no service token and no provider SDK. Network assertions must reject unexpected egress, including email, voice, AI, analytics and third-party images. All submit/save/send/approve controls in the review operate in memory and announce that the result is simulated. A visible simulated success must not read as a real application change.

Use a compact, reusable fixture pack rather than arbitrary data on each page:

| Fixture family | Required variants |
| --- | --- |
| Identity | Active member, active staff, staff with baseline member row, expired session, deleted account, unlinked employer/partner, wrong tenant |
| Member record | Onboarding incomplete, partially ready, enrolled, secondary enrollment, no enrollment, source unavailable |
| Catalog/curriculum | Exact active slug, alias-only repair, inactive-only catalog, curriculum changed, foreign program query |
| Files | Readable original, readable enhanced, confirmed absent, query error, Storage error, extraction failure, foreign path, audit-suppressed |
| Work | Saved draft, dirty draft, save failure, conflicting curriculum, submitted lab, staff feedback, stale queue |
| Communication | Empty thread, historical messages, unread cursor, staff handoff, failed POST, uncertain POST, reordered realtime event |
| Jobs | Open/closed posting, personal tracker, posted application, already applied, missing prerequisite, wrong employer |
| Partner visibility | Full community, restricted referral partner, school, hidden minor, consented minor, foreign referral |
| Mentorship | Approved active mentor, pending mentor, inactive mentor, requested session, invalid date, other member's session |
| Outcomes/operations | Verified and self-reported placement, retention pending, empty population, partial scan, unknown provider outcome |

Each mockup should identify sample data at the experience level and avoid presenting invented success statistics as WorkforceAP's actual performance. Do not simulate access by changing an existing participant's role, approval, email preference, enrollment or profile publication.

## 8. Acceptance layers and what they prove

| Layer | Required evidence | What it does not prove |
| --- | --- | --- |
| Connected review | All inventory routes reachable; correct section/back links; primary simulated action; static and dynamic examples; mobile, keyboard, reduced motion; zero real requests | Actual React/server loaders, Auth, database policies, provider behavior, or production content |
| Application component/API fixtures | Actual production components and handlers with mocked dependencies; required failure and denied controls; no side effects; truthful state mapping | Deployed environment configuration or database behavior hidden by a mock |
| Disposable integration | Local PostgreSQL contract/RLS proofs, real transactions and conflicting writes, fixture cleanup receipts, provider/network blocks | The full historical migration chain or the live database's policies/settings |
| Exact-head CI | Required static, unit, Vitest, build, database-contract and KB checks on the reviewed SHA; aggregate fails if a required lane fails | A signed-in deployed portal merely because the build passes |
| Hosted acceptance | Exact deployment URL/ID, Git SHA, intended DEMO project, pre-existing authorized identity, rendered content, route/action/persistence evidence and cleanup | Other deployments, another role, production email receipt, or the production database |
| Production observation | Approved non-mutating canary/telemetry for the actual production commit | Permission to provision fixtures, migrate, send email or invoke mutating jobs |

The journey artifact validates that all 70 specified steps map to inventory routes. That is an artifact consistency check, not a browser test. Its receipt deliberately records `applicationTestsExecuted: false` and `liveTestsExecuted: false`. When root's connected review is tested, attach that separate result to its exact artifact hash and keep this distinction.

### Every-route checklist

Each row in the acceptance CSV needs an explicit outcome for:

- Entry and identity: signed-in allowed state; signed-out; wrong role; wrong subject/tenant where applicable.
- Content readiness: meaningful heading and loaded content; no skeleton-only pass, swallowed error, streamed not-found or console failure.
- Navigation: canonical destination, active item, detail/list return, deep link refresh, browser Back/Forward, unknown route and redirect termination.
- Primary task: action enabled only when valid; validation; pending; confirmed persistence; failed/uncertain recovery; cancel.
- States: loading, confirmed empty, unavailable, partial/stale, restricted and audit-suppressed when relevant.
- Presentation: desktop/tablet/mobile; keyboard; focus visibility; accessible labels/errors; contrast; reduced motion.
- Isolation: synthetic-only evidence; no real email/provider calls, provisioning, publication, hosted migrations or live settings changes.

Not applicable is allowed only with a reason. A skipped required check is not a pass. If a detail page cannot be reached because its fixture is missing, report a fixture blocker instead of counting an empty list as coverage. [S14]

## 9. Current Portal C hosted blockers

The open Portal C sequence remains #2827 → #2829 → #2833 → #2835. The existing implementation/handoff records green code/test lanes but leaves four signed-in safety-net lanes pending: registry/alias, Preview harness, member journey, and staff pixels. These are retained acceptance gates, not defects to hide by weakening the workflow.

Current constraints prevent satisfying those gates by quietly launching their existing mutation path: the Portal C candidate includes four targeted DEMO schema bootstraps, fixture prepare/restore can create a temporary inactive/unapproved mentor, and the staff workflow is PR-triggered only for a `feature/portal-*` branch. It is not a general manual read-only workflow already available on master. The prior `cook/portal-c-acceptance-20261020` Vercel attempt was canceled by the ignore rule. Reverify those facts on the exact eventual release head; do not substitute a different ready deployment. [S15]

The new connected mockup can be completed without resolving those hosted gates. Its success must not be used to claim the Portal C production rollout is accepted. To close hosted acceptance later, the release owner needs an authorized exact-head DEMO path, the intended existing test identities, and a scoped decision about the fixture/schema writes currently excluded by the user. Do not request new credentials or production access merely to render the review.

## 10. Push and merge automation

The relevant source was inspected at the exact master SHA, not inferred from branch naming conventions:

| Action | Observed automation | Decision for this work |
| --- | --- | --- |
| Push `cook/*` feature branch | `vercel.json` returns ignore for non-production branches outside `preview`, `feature/portal-*`, `feature/astro-*` | Appropriate review-only namespace; recheck actual deployment/check statuses after push |
| Open PR into master | CI static/unit/Vitest/build/local PostgreSQL-contract lanes; KB; locked product-stakes check | Appropriate after mandatory prepush. Tests use declared stub configuration/local service, not hosted migrations. |
| Push `feature/portal-*` or `preview` | Vercel Preview build is allowed | Avoid under current no-hosted-migration restriction: master `build:preview` performs three targeted DEMO schema bootstraps, and the Portal C stack adds a fourth. |
| Merge/push master | Automatic Vercel production build selects `build:with-migrate`, which runs `safe-migrate` before compile | Hold new work while the no-hosted-migration/production-action restriction remains; prior generic merge authorization does not make the side effects disappear. |
| Dispatch résumé acceptance | Creates and later cleans up a disposable synthetic member | Not a read-only diagnostic; do not dispatch under no-provisioning restriction. |
| Dispatch authenticated smoke/mirror | Can move the machine-owned preview ref and initiate its configured Preview build | Review target/provenance and side effects first; do not use to bypass the branch exclusion. |

Actual script contents take precedence over stale explanatory comments. In current master, `build:with-migrate` calls `safe-migrate` directly; the older operations prose still mentions historical recovery wrappers no longer present in that package script. The preview-smoke comment also lists older allowed branch families that are absent from the current `vercel.json` ignore command. No deployment/settings/workflow changes are proposed to force an acceptance pass. [S16]

## 11. Email suppression incident: separate from the UI rollout

The October 20 warning concerned production deployment `dpl_4iJZmkhfAQqLMuQkP5C49XY4ZXzQ` at the same master SHA. The previous investigation observed `/suppressions` HTTP 401 in the onboarding-stalls request. Its member-nudge portion was disabled with zero candidates/sends. That observation does not independently establish the earlier staff-digest counters or prove a wider delivery outage. This data-strategy task did not make another live provider call.

Current code intentionally falls back to stale cache or unknown when suppression lookup fails, with a four-second request timeout and ten-minute cache. The current signed Resend webhook handler recognizes delivered/bounce/complaint and other listed events, but `email.suppressed` is outside its recognized set and is acknowledged as ignored. This is a separate delivery-status gap. UI design must therefore expose suppression-list health and unknown delivery honestly; it cannot call all accepted requests delivered. [S17]

Follow-up should be a focused, mocked incident change: preserve signature verification, timestamp/reorder handling, bounce/complaint policy and billing linkage, add a truthful suppressed outcome contract, and test duplicate/reordered/unknown events and failed diagnostic writes. Whether production's specific API key has the needed permission requires a correctly mapped, authorized read-only configuration check; the 401 alone does not establish which key or account caused it. Do not rotate/expose keys, change email settings, send a test message, or register a webhook as part of the portal review.

## 12. Measurement and operations

Use existing observability before introducing new collection. Browser route failures, recoverable hydration errors, API errors, workflow diagnostics and SLO readers already exist. Record route **patterns** and redacted operation/correlation identifiers, not raw member IDs, names, email addresses, message text, resume contents or document URLs. Keep fixtures and automated review traffic separate from genuine product usage. [S18]

Useful product measures are task-specific: route-to-primary-action completion, successful persisted saves, rejected/uncertain writes, recovery success, abandoned invalid form states, unauthorized/denied attempts and evidence age. Define population and time window before adding a dashboard. A zero count is meaningful only when the observation stream is complete. A missing initial send log is unobservable; a missing delivery receipt is unknown, not success. Performance observations need a real browser/network profile; an offline mockup's speed is not a production service-level result.

Each implementation PR should carry: frozen base/head SHA, owning routes/data contract, before/after screenshots, exact test commands and counts, CI status, side-effect review, remaining hosted gate and rollback scope. The shared route inventory should fail on additions/removals that lack review coverage. Keep the source-linked data strategy and journey specifications next to the review artifact; refresh them when the actual route tree changes.

## 13. Immediate implementation order

1. Complete and test the all-route connected review using clearly synthetic data; include every source-backed route and explicit recovery/permission states.
2. Ship the narrow résumé load-state/retry correction after focused mocked tests and exact-head CI. This is independent of rebuilding Portal C's five screen layouts.
3. Implement message timestamp/reading continuity in its own focused change; preserve pending/draft semantics and the staff handoff boundary.
4. Close remaining local navigation/accessibility defects found through the review, such as the training course scroll helper, without changing business eligibility.
5. Resolve the exact-head hosted acceptance path with the release owner before claiming deployment acceptance. Keep the suppression incident independent so its permissions and provider evidence receive their own review.

“Flawless” is the intended experience, not a guarantee produced by a mockup. The practical release criterion is that every required gate has evidence, every failure state has a safe recovery, and every remaining limitation is visible before release.

## Source index

All code links below pin the inspected master revision unless marked as an open PR. Descriptions distinguish current implementation from proposed work.

- **S1 — Data and trust contracts:** [Data ownership and recovery](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/docs/knowledge-base/data.md), [Prisma schema](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/prisma/schema.prisma).
- **S2 — Operations and transaction limits:** [Operations guide](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/docs/knowledge-base/operations.md), [transaction policy](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/db/transactionPolicy.ts).
- **S3 — Portal access:** [Member decision](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/auth/memberDashboardAccess.ts), [switcher](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/auth/portalRoleSwitcher.ts), [denied destinations](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/auth/portalGuards.ts).
- **S4 — Mentorship:** [Mentor dashboard](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/(portal)/dashboard/mentor/page.tsx), [session API](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/api/mentors/[id]/sessions/route.ts).
- **S5 — Leaders:** [Dashboard](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/(portal)/leader/dashboard/page.tsx), [chapter scope](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/api/leader/chapters/route.ts), [subgroup member projection](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/api/subgroup/members/route.ts).
- **S6 — Program selection:** [Member program page](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/(portal)/dashboard/program/page.tsx), [curriculum assignment](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/member/curriculumAssignment.ts).
- **S7 — Résumé:** [Best-effort plain text helper](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/member/getMemberResumePlainText.ts), [Studio entry](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/(portal)/dashboard/ai-tools/page.tsx).
- **S8 — Navigation:** [Canonical portal nav](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/nav/portalNav.ts), [dynamic-route discovery](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/scripts/lib/portal-audit-actions.mjs).
- **S9 — Time and chat:** [Portal timezone](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/formatDate.ts), [ChatThread](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/components/portal/kit/ChatThread.tsx).
- **S10 — Staff boundary:** [Member access](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/counselor/staffMemberAccess.ts), [boundary regression suite](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/tests/api/member-data-access-boundaries.spec.ts).
- **S11 — Partner and employer:** [Partner tiers/minors](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/partner/dataAccess.ts), [owned employer application](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/(portal)/employer/applications/[id]/page.tsx).
- **S12 — Message side effects:** [Member message API](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/api/member/messages/route.ts), [thread logic](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/messages/counselorThread.ts).
- **S13 — Training conflict behavior:** [Workspace API](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/api/member/training-workspace/route.ts).
- **S14 — Route inventory and audit:** [Inventory helper](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/scripts/lib/portal-audit-inventory.mjs), [authenticated workflow](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/.github/workflows/authenticated-portal-smoke.yml).
- **S15 — Open overlapping work:** [Portal C #2827](https://github.com/workforceap/workforceap-beta/pull/2827), [harness #2829](https://github.com/workforceap/workforceap-beta/pull/2829), [staff protection #2833](https://github.com/workforceap/workforceap-beta/pull/2833), [readiness/aggregation #2835](https://github.com/workforceap/workforceap-beta/pull/2835), [counselor #2831](https://github.com/workforceap/workforceap-beta/pull/2831), [employer empty states #2513](https://github.com/workforceap/workforceap-beta/pull/2513).
- **S16 — Automation:** [vercel.json](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/vercel.json), [package scripts](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/package.json), [Vercel build router](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/scripts/vercel-build.cjs), [CI](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/.github/workflows/ci-gate.yml), [résumé acceptance workflow](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/.github/workflows/resume-demo-acceptance.yml).
- **S17 — Suppression:** [Lookup/cache](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/email/suppressions.ts), [signed event handling](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/email/resendWebhook.ts), [webhook route](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/api/webhooks/resend/route.ts).
- **S18 — Observability:** [SLO methodology](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/docs/SLO-AND-STATUS.md), [SLO reader](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/observability/sloMetrics.ts), [scrubber](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/observability/sentryScrubber.ts).
