# TODOS

Design and UX debt tracked from plan-design-review (2026-05-05, branch `split/pr2-coursera-launch-hardening`).

---

## ~~TODO-001: Coursera Hub — Mobile Layout Spec~~ ✓ COMPLETED

**What:** ~~Add a mobile layout for `/dashboard/coursera` (either a responsive breakpoint or a dedicated mobile component matching the Training page pattern).~~ `/dashboard/coursera` now redirects into `/dashboard/training`, the merged hub. The shared Training course pathway uses the established `md:wa-hidden` / `wa-hidden md:wa-block` mobile split and mobile-safe course cards.

**Why:** The Coursera hub is the member's primary launch point and progress view. Mobile-first members — likely a significant share — hit this on phones. The auto-fit grid collapses okay, but the course pathway list has no spec for narrow viewports: long course names (e.g. "Machine Learning: Regression and Classification") will truncate or overflow at 320px.

**Pros:** Consistent cross-device experience; no overflow or clipping surprises on phones.

**Cons:** ~30min of design work before implementation; may be moot if Training/Coursera pages are eventually merged (see Unresolved Decision #1).

**Context:** Training page already uses `md:wa-hidden` / `wa-hidden md:wa-block` split as the established pattern. Coursera hub should follow the same approach. The design review rated the Coursera hub at 5/10 for responsive behavior.

**Completed:** 2026-06-14. IA decision resolved as Option A: `/dashboard/coursera` redirects to `/dashboard/training`; course cards now explicitly guard long Coursera titles and CTAs at narrow widths.

---

## ~~TODO-002: Training Page — "0% Progress" First-Visit Framing~~ ✓ COMPLETED

**What:** ~~When a member lands on `/dashboard/training` for the first time with `completedCount === 0`, replace the cold "0/7 courses — 0%" stat display with a warm starting-line framing...~~

**Completed:** 2026-05-05 (commit `21811415 feat(training): canonical training truth`). The zero-state banner with "Your path starts here — Course 1 of N is unlocked and ready" and a "Start Course 1" CTA is already live in `app/(portal)/dashboard/training/page.tsx`.

---

## ~~TODO-003: Coursera Hub — "NOW" Badge Font Size~~ ✓ COMPLETED

**What:** ~~Change `font-size: '0.65rem'` on the "NOW" pill badge~~ → Changed to `0.75rem`.

**Completed:** 2026-05-05 (split/pr2-coursera-launch-hardening, commit 37cfe67e)

---

## ~~TODO-004: Coursera Launch E2E Integration Test~~ ✓ COMPLETED

**What:** ~~Add an E2E integration test for the Coursera launch flow using a test Coursera account or mocked OAuth flow.~~ Added a mocked route-level integration seam that drives `Request` → redirect behavior without live Coursera credentials.

**Completed:** 2026-06-14. Coverage lives in `lib/coursera/launchRouteCore.test.ts`; `app/api/member/coursera/launch/route.ts` now wires real Next/Auth/Prisma/Coursera dependencies into the injectable handler. Covered unauth redirect, DB course override deep link, active-dashboard-program resolution, safe course fallback, configured program URL redirect, and launch-failed fallback.

---

## Mission Instrumentation (Wave A, R20) — 2026-07-05

Findings from a CEO-level review of "make mission instrumentation real": engagement
tracking, at-risk detection, and placement verification. Shipped this round: grant/
funder reporting (`quarterlyOutcomes`, `funderProgramMetrics`, `wioa-report`, partner
outcomes/demographics export) now only counts `startDateVerified: true` placements;
the dead "Pending Placements" admin-overview card (`Promise.resolve([])`) now queries
real unverified records; at-risk scoring's binary, cron-lagged `STALE_TRAINING` flag
is replaced with a graduated severity tier keyed on `CourseProgress.lastActivityAt`
(the real xAPI-driven signal, already fetched in `calculateAtRiskScore` but previously
unused there). Deferred items below, not silently dropped.

### TODO-005: Verify the unverified-placement backlog before the next funder report cycle

**What:** This sandbox has no live DB access, so the actual count of pre-existing
placements with `startDateVerified: false` that predate this fix is unknown. Once
deployed, check `/admin/placements` (the "To Confirm" count) or query
`SELECT count(*) FROM placement_records WHERE start_date_verified = false` before the
next WIOA monthly report cron run or quarterly outcomes export.

**Why it matters:** Reported placement/wage numbers may drop from what was previously
reported (if that backlog is non-trivial) now that unverified records are excluded.
That's the intended, defensible behavior — but funders/board should hear about a
number change from staff, not notice it themselves.

**Owner:** Admin/counselor staff, before the next report cycle.

---

### ~~TODO-006: Consolidate the five independent "at-risk" implementations~~ ✓ CLOSED

**What:** The codebase has at least five separate, disagreeing notions of member risk:
1. `lib/member/atRiskScoring.ts` `calculateAtRiskScore` — the real 0–100 scorer, persisted to `AtRiskAlert`, drives the counselor dashboard + digest emails.
2. Same file's `classifyMember` (G5 retention loop, green/yellow/red tiers) — different thresholds, drives nudge emails only.
3. `lib/admin/commandCenter.ts` `loadAtRisk` — ad-hoc SQL, 14-day inactivity cutoff, feeds the admin command-center widget.
4. `lib/counselor/commandCenter.ts` `AtRiskRow` — ad-hoc, 7-day-no-`MemberEvent` cutoff, feeds the counselor command-center widget.
5. `lib/partner/attentionQueue.ts` `computeRiskTier` — 3/7/14-day pipeline-staleness risk, a different concept (referral staleness, not engagement).

**Why it matters:** Different dashboards can show a different risk picture for the
same member on the same day. Counselors lose trust in "at risk" as a signal if the
admin command center, the counselor command center, and the at-risk dashboard
disagree about who needs outreach.

**Recommended:** Make #3 and #4 read from the persisted `AtRiskAlert` table (already
computed nightly) instead of re-deriving their own threshold in raw SQL. Leave #2 (G5
nudge cadence) and #5 (partner pipeline staleness) as-is — they answer genuinely
different questions ("when to send a nudge email" and "is this referral going cold")
rather than "is this member at risk," so collapsing them would lose signal, not gain it.

**Deferred because:** Touches four dashboards staff use daily; wanted the higher-value,
lower-risk fixes (verification integrity, xAPI signal) shipped and reviewed first.

**Closed:** 2026-09-20 (WAP-30). #3 (`lib/admin/commandCenter.ts` `loadAtRisk`) and #4
(`lib/counselor/commandCenter.ts` `AtRiskRow`) read the persisted `AtRiskAlert` table since
PR #2383, so the admin command center, counselor command center and at-risk dashboard show
the same risk state for the same member. The two at-risk emails are one sender on one
schedule: the nightly `/api/cron/at-risk-check` scores, persists, resolves stale alerts and
then runs `runDailyAtRiskCounselorAlerts` on those same scores (batched per counselor; members
with no counselor go to `AT_RISK_DIGEST_EMAILS`). The separate digest template and the
weekly counselor re-scoring in `/api/cron/at-risk-alerts` are gone — that route now runs only
the G5 member retention nudges (#2), which stay as designed. #5 (partner pipeline
staleness) is untouched, as recommended.

---

### TODO-007: `MemberEvent.eventName` taxonomy cleanup

**What:** ~60 distinct event names exist across two write paths — a typed 45-value
union (`lib/events/track.ts`) and ~15 files calling `prisma.memberEvent.create()`
directly with untyped literals in inconsistent casing (`snake_case`,
`career_os.dot.namespaced`, `SCREAMING_SNAKE`). `app/api/events/route.ts` also accepts
any string 1–100 chars from the client, force-cast past the typed union.

**Why it matters:** Any future analytics/rollup work on top of `MemberEvent` inherits
this inconsistency — `GROUP BY event_name` will undercount events that are
semantically the same but spelled differently.

**Deferred because:** A naming migration touches historical data interpretation (do
old rows get renamed or does the analysis need to know both names existed); wanted
this scoped as its own pass rather than folded into the verification/scoring fixes.

---

### ~~TODO-008: `lib/**/*.test.ts` vitest lane doesn't run in CI~~ ✓ COMPLETED

**Completed:** 2026-09-04. Restored all 24 delegated suites through the shared
`scripts/vitest-library-specs.mjs` registry and removed the conflicting exclude.
`tests/test-runner-coverage.test.ts` guards against recurrence. Repaired stale
fixtures for curriculum completion, member merge, retention, and masked errors;
production behavior is unchanged. CI already requires `test:vitest`.

**Historical discovery notes (superseded by the completion above):**

**What:** `vitest.config.ts`'s `include` lists `lib/**/*.test.ts`, but the `exclude`
array lists the identical glob — so despite ~18 files (`quarterlyOutcomes.test.ts`,
`metrics.test.ts`, `memberMerge.test.ts`, etc.) being explicitly allowlisted in
`scripts/test-unit.mjs`'s `KNOWN_VITEST_SPECS` as "these are vitest specs, skip them
in the node:test runner," nothing actually runs them under vitest either — the
identical exclude entry wins. These specs currently execute in neither test runner.

**Confirmed real:** manually running vitest with the conflicting exclude line removed
surfaces 2 genuine pre-existing failures in `quarterlyOutcomes.test.ts` ("computes
basic metrics correctly", "counts certifications as completions" — both expect
`completions` to be 1, get 0; unrelated to this round's changes) plus otherwise-passing
coverage across the other 17 files.

**Why it matters:** ~18 Prisma-mocked specs covering admin analytics, member merge,
quarterly outcomes, and xAPI verb progress currently provide zero CI signal. A
regression in any of them would ship unnoticed.

**Deferred because:** Fixing the config exclude turns on the whole lane at once,
which would immediately surface the 2 pre-existing failures above (and possibly
more) as new CI red — a broader fix than this round's scope, and one that needs
someone to actually debug the completion-counting logic, not just flip a switch.

**Recommended:** Fix the two pre-existing `quarterlyOutcomes` failures first, then
remove the `lib/**/*.test.ts` line from `vitest.config.ts`'s `exclude` array and add a
`test:vitest` step to CI (the script already exists at `package.json`'s
`test:vitest`, it's just never invoked).

---

## Unresolved Design Decision #1: Training vs Coursera Hub Architecture

**Decision needed:** Is `/dashboard/training` the single source of truth for course progress, or are Training and Coursera two intentionally distinct pages with different jobs?

**Current state:** Both pages show course count + progress percentage + a Coursera launch button. The Coursera hub adds a sequential course pathway list and skillset progress. The Training page adds a course-by-course list with manual mark-done, "What happens after I start?" guidance, and a sync details section.

**If deferred:** Two pages with duplicate stats ship. Members ping counselors asking "which one do I use?" Counselors don't have a clear answer.

**Options:**
- **A)** Merge into Training as the hub; Coursera hub → redirect or lightweight utility page
- **B)** Keep separate but differentiate clearly: Training = progress + course list, Coursera = launch point + partner tools

**Recommended:** Option A (cleaner IA, eliminates stat duplication, single source of truth for members).

---

## ~~TODO-006: admin/token-links — P2 hardening follow-ups (post TODO-005)~~ ✓ Items 1-3 Completed; Item 4 Deferred

**What:** Adversarial review of PR #1657 closed the P1 but flagged P2s on `app/api/admin/token-links/route.ts`:
1. ~~**Existence oracle:** cross-tenant denial returns 404 only for nonexistent IDs; an existing Org-B member yields 403 — lets an Org-A admin enumerate valid user UUIDs. Collapse both to 404.~~ ✓ Fixed — `resolveActOnBehalf` returns 404 for both cases.
2. ~~**No audit log on link minting**~~ ✓ Fixed — `auditLog(...)` called after minting with full metadata.
3. ~~**No rate limit on minting**~~ ✓ Fixed — `checkAdminTokenLinksRateLimit(user.id)` added.
4. **RLS forward-compat:** `getSubjectOrganizationId` + the fullName lookup are deliberately cross-tenant raw Prisma reads; under FORCE RLS with an actor-org GUC the super_admin path will return null → 500. Track in the Sprint 3 FORCE RLS flip checklist.

**Status:** Items 1-3 completed 2026-06-17 (code already in master). Item 4 deferred to FORCE RLS flip sprint.

---

## TODO-007: admin/growth — wire real GA4 property ID

**What:** `app/admin/growth/page.tsx:38` has a placeholder GA4 property ID and the dashboard shows static demo data instead of live analytics.

**Why:** The growth dashboard is the primary admin tool for tracking acquisition, activation, and retention funnels. Placeholder data misleads decisions.

**Priority:** P2

**Fix shape:** Once GA4 workspace is provisioned, replace the placeholder ID on line 38 and wire the server-side GA4 Data API integration (the TODO block at lines 219 and 278 in the same file).

---

## TODO-026: withApiGuc + audit logs batch 6 (enroll, notes, bulk-email) — PR #1955

**What:**
- `admin/members/bulk-email`: `POST` missing `withApiGuc` (Prisma writes for message threads)
- `member/enroll`: No audit trail for program enrollment — highest-traffic member mutation
- `admin/members/[id]/notes POST`: No audit trail for counselor note creation

**Fix:** `withApiGuc` on bulk-email; `auditLog` fire-and-forget on enroll + notes. PR #1955.

**Priority:** P2

**Status:** PR open 2026-06-17.

---

## TODO-027: withApiGuc batch 7 — admin reports, blog AI, jobs-matches, messages-stats — PR #1956

**What:** 7 admin routes without `withApiGuc` despite Prisma calls via helpers: `admin/blog/generate`, `admin/blog/ai/review`, `admin/jobs/[id]/matches`, `admin/messages/stats`, `admin/reports/wioa/generate`, `admin/reports/quarterly-outcomes`, `admin/partners/[id]/quarterly-outcomes`.

**Fix:** All renamed to `_FOO` and exported via `withApiGuc`. PR #1956.

**Priority:** P2 (Sprint 3 FORCE RLS)

**Status:** PR open 2026-06-17.

---

## TODO-028: input bounds — employer jobs, admin chapters, member status notes — PR #1957

**What:** Several routes accepted unbounded strings/arrays:
- `employer/jobs` POST/PATCH: `description` unbounded, `requirements`/`preferredCertifications`/`suggestedPrograms` arrays uncapped
- `employer/applications PATCH`: `employerNotes` unbounded
- `admin/chapters`: `city`, `state`, `meetingSchedule`, `meetingLocation`, `curriculumNotes` all unbounded
- `admin/members/[id]/status`: `notes` unbounded

**Fix:** Added `.max()` caps per field. PR #1957.

**Priority:** P2

**Status:** PR open 2026-06-17.

---

## TODO-016: partner/dashboard missing withApiGuc — ✓ Fixed PR #1867

**What:** `GET /api/partner/dashboard` was a bare `export async function GET()` without `withApiGuc`. It calls `loadPartnerReferralBundle` which queries Prisma.

**Fix:** Added `withApiGuc` wrapper, removed unused `prisma` import. PR #1867.

**Priority:** P2 (Sprint 3 blocker)

**Status:** Fixed 2026-06-17.

---

## TODO-017: ai/interview/results missing rate limit + withApiGuc — ✓ Fixed PR #1868

**What:** `GET /api/ai/interview/results` calls `chatCompletion` (Groq) without `checkAIToolRateLimit`, unlike the sibling `start` and `response` routes. Also calls `loadCoachContextBlock` → `getAICoachContext` which issues Prisma queries without `withApiGuc`.

**Fix:** Added `checkAIToolRateLimit(user.id)` + `withApiGuc` wrapper. PR #1868.

**Priority:** P2 (rate limit bypass + Sprint 3 FORCE RLS)

**Status:** Fixed 2026-06-17.

---

## TODO-027: admin/members/create — tenant-scope partner/subgroup FKs + notes cap + audit log ✓ Fixed PR #1946

**What:** `app/api/admin/members/create/route.ts` validated `partnerId` and `subgroupId` without scoping them to the actor's organization — an Org A admin could attach an Org B partner or subgroup to a newly-created member. Also: `notes` had no length cap. No audit log for member creation.

**Fix:** Fetched `organizationId` early; added `organizationId` filter to partner lookup and `leader.organizationId` filter to subgroup lookup; capped `notes` at 5000 chars; added `logAuditEvent` for `create_member`. PR #1946.

**Priority:** P1 (cross-tenant FK association)

**Status:** Fixed 2026-06-17.

---

## ~~TODO-008: Waitlist API — enable after Prisma migration~~ ✓ CLOSED (route removed)

**What:** `app/api/waitlist/route.ts` was a stub: both handlers returned a hard-coded 503, no `ProgramWaitlist` model ever existed, nothing linked to it, and it was an unauthenticated, unrated POST in the production route tree.

**Closed:** 2026-09-20 (WAP-37). The stub was deleted rather than enabled — a waitlist is a product decision, not a migration; when it is wanted it should be designed fresh (model, rate limit, consent copy), not resurrected from the stub.

---

## TODO-021: Sprint 3 audit sweep — second wave (PRs #1924–#1928)

**What:** Continue the audit log sweep started in TODO-020. These routes gained `auditLog` calls via individual PRs awaiting gate-merge:

- **PR #1924** — `admin/users/[id]` DELETE/PATCH: `admin_user_delete`, `admin_user_update`; `admin/partners/[id]` PATCH: `admin_partner_update`; `admin/partners` POST: `admin_partner_create`; `admin/organization/logo` POST: `admin_org_logo_upload`
- **PR #1925** — `admin/employer-screening-packs` POST + `[id]` PATCH/DELETE; `admin/members/create` POST: `admin_member_create`; `admin/testimonials/[id]` PATCH/DELETE
- **PR #1926** — `admin/mentors/[id]` PATCH: `admin_mentor_status_update`; `admin/members/[id]/notes` POST: `admin_member_note_create`; `admin/members/[id]/edit-profile` PATCH: `admin_member_profile_update`
- **PR #1927** — `admin/members/[id]/wioa-review` PATCH: `admin_member_wioa_review`; `admin/milestone-cascades/synthetic` POST; `admin/placement-surveys/resend` POST
- **PR #1928** — `admin/feature-flags` POST/PATCH/DELETE: create, update, delete

**Remaining deferred** (lower priority — Coursera/cron/analytics/lifecycle routes, Sprint 3 FORCE RLS flip):
- `admin/email-templates/[id]` PATCH/DELETE, `admin/email-crons` mutations
- `admin/lifecycle/member/[id]` PATCH
- `admin/members/[id]/upload-resume` POST, `admin/members/[id]/interview` POST
- `admin/messages/thread/*` POST handlers
- `admin/users/[id]/free-email` POST
- ~15 Coursera admin routes, cron routes needing `withSystemGuc`

**Priority:** P2 (state-mutating routes already done; deferred are lower-risk or blocked on FORCE RLS)

---

## TODO-038: upload routes — derive Supabase contentType from validated extension — ✓ Fixed PR #1966

**What:** 4 upload routes (cert upload, admin upload-resume, member resume upload, counselor upload-resume) passed browser-supplied `file.type` as `contentType` to Supabase. Attacker could tag any upload with `text/html`, causing Supabase to serve it with that header.

**Fixed:** PR #1966. All 4 routes now derive MIME from validated extension (matching logos fix in PR #1964).

**Status:** Completed 2026-06-17. PR #1966 open / gate-merge pending.

---

## TODO-039: audit logs for deferred TODO-021 admin routes — ✓ Fixed PR #1967

**What:** 3 state-mutating admin routes from TODO-021 deferred list: `admin/messages/thread/[threadId]/staff POST` (staff message creation), `admin/users/[id]/free-email POST` (PII email mutation), `admin/members/[id]/interview PATCH` (interview status update).

**Fixed:** PR #1967. Both `auditLog` + `logAuditEvent` (fire-and-forget) added to all 3 routes.

**Status:** Completed 2026-06-17. PR #1967 open / gate-merge pending.

---

## TODO-036: admin/blog AI routes — rate limits + withApiGuc + logo MIME — ✓ Fixed PR #1964

**What:** All 5 admin blog AI endpoints (`generate`, `suggest-topics`, `from-ideas`, `review`, `draft`) called `chatCompletion` without `checkAIToolRateLimit`. `review` and `generate` also missing `withApiGuc`. Both logo upload routes used browser-supplied `file.type` as Supabase `contentType` instead of deriving from validated extension.

**Fixed:** PR #1964. Rate limits added to all 5 routes. `withApiGuc` added to `review` and `generate`. MIME derived from validated extension in both logo routes.

**Status:** Completed 2026-06-17. PR #1964 open / gate-merge pending.

---

## TODO-037: AI rate limits for interview, counselor, admin resume routes — ✓ Fixed PR #1965

**What:** 6 routes calling `chatCompletion` or `claudeChat` without `checkAIToolRateLimit`: `interview/session` (text fallback), `interview/history POST`, `counselor/feedback POST`, `admin/members/[id]/summary`, `admin/members/enhance-resume`, `admin/members/parse-resume`.

**Fixed:** PR #1965. Rate limit added to all 6 routes. `ai/interview/results` separately tracked in PR #1959.

**Status:** Completed 2026-06-17. PR #1965 open / gate-merge pending.

---

## TODO-040: withApiGuc sweep — auth/me, jobs/matches, quarterly-outcomes; request-help rate limit — ✓ Fixed PR #1968

**What:** `auth/me` (heavily polled role-check endpoint) and 3 analytics/reporting routes missing `withApiGuc`; `member/request-help` had no rate limit allowing counselor email spam.

**Fixed:** PR #1968. `withApiGuc` added to `auth/me`, `admin/jobs/[id]/matches`, `admin/partners/[id]/quarterly-outcomes`, `admin/reports/quarterly-outcomes`. `checkContactRateLimit(ip)` added to `member/request-help`.

**Status:** Completed 2026-06-17. PR #1968 open / gate-merge pending.

---

## TODO-041: prep-bundle open relay + audit logs — ✓ Fixed PR #1969

**What:** `member/prep-bundle/send` accepted arbitrary `memberEmail` in body, allowing any authenticated member to send WorkforceAP-branded emails to any address. Also missing `withApiGuc` and rate limit. `admin/email-templates/[id]` PATCH and `admin/members/[id]/upload-resume` POST missing audit logs.

**Fixed:** PR #1969. `memberEmail` removed from body (always send to authenticated user's own email). `checkContactRateLimit` and `withApiGuc` added. Dual audit trails added to email-templates PATCH and upload-resume POST.

**Status:** Completed 2026-06-17. PR #1969 open / gate-merge pending.

---

## TODO-042: withApiGuc for onet/webhooks/email-crons-preview; xapi batch size limit — ✓ Fixed PR #1970

**What:** `admin/onet/sync`, `admin/onet/search`, `admin/email-crons/[id]/template-preview`, and `admin/webhooks/process-retries` all call `requireAdmin`/`isAdmin` (Prisma) without `withApiGuc`. `xapi/statements` had no batch size cap — a large batch could exhaust memory/connections.

**Fixed:** PR #1970. `withApiGuc` added to all 4 routes. xAPI batch capped at 200 statements (400 if exceeded).

**Status:** Completed 2026-06-17. PR #1970 open / gate-merge pending.

---

## TODO-043: §H-DEP4 dual audit trail on PII bulk-export + export-data — ✓ Fixed PR #1971

**What:** `admin/members/bulk-export` had `auditLog` but not `logAuditEvent`. `admin/members/[id]/export-data` had `logAuditEvent` but not `auditLog`. Both PII exports require both for §H-DEP4.

**Fixed:** PR #1971. Missing half of each audit pair added as fire-and-forget calls.

**Status:** Completed 2026-06-17. PR #1971 open / gate-merge pending.

---

## TODO-044: audit trails for member self-delete + admin subgroup mutations — ✓ Fixed PR #1972

**What:** `member/delete-account` (irreversible self-deletion) and `admin/members/[id]/subgroup` (POST/DELETE subgroup assignment) had no audit logs.

**Fixed:** PR #1972. `auditLog` + `logAuditEvent` added to delete-account; `auditLog` added to subgroup POST/DELETE.

**Status:** Completed 2026-06-17. PR #1972 open / gate-merge pending.

---

## TODO-047: audit logs for enrollment-funding, milestone-cascades/synthetic, placement-surveys/resend — ✓ Fixed PR #1975

**What:** 3 admin routes missing audit logs: `enrollment-funding` (financial record mutation), `milestone-cascades/synthetic` (debug tool that modifies member progress), `placement-surveys/resend` (email send + token creation). All had `withApiGuc` but no `auditLog`.

**Fixed:** PR #1975. Fire-and-forget `auditLog` calls added to all 3.

**Status:** Completed 2026-06-17. PR #1975 open / gate-merge pending.

---

## TODO-046: withApiGuc for 9 Coursera admin routes + ai/interview/response — ✓ Fixed PR #1974

**What:** 9 Coursera admin routes (`auto-heal`, `b4b-programs`, `b4b-bindings-suggestions`, `map-unmatched`, `mappings`, `seed-canonical-mappings-from-b4b`, `seed-canonical-mappings-from-catalog`, `sync-b4b`, `self-test`) and `ai/interview/response` were missing `withApiGuc`. All call `isAdmin()` which queries Prisma without a GUC context.

**Fixed:** PR #1974. Completes Coursera admin GUC sweep from TODO-021 deferred list.

**Status:** Completed 2026-06-17. PR #1974 open / gate-merge pending.

---

## TODO-045: audit trail completeness — award-points, pipeline-stage, merge, reset-password, coursera-approval — ✓ Fixed PR #1973

**What:** 5 admin routes with incomplete dual audit trail:
- `award-points`: NO audit at all — admin/counselor point awards untracked
- `pipeline-stage`, `merge`, `reset-password`: had `logAuditEvent` (xAPI) but no legacy `auditLog`
- `coursera-enrollment-approval`: had `auditLog` but no `logAuditEvent` xAPI trail

**Fixed:** PR #1973. All 5 routes now emit both `auditLog` + `logAuditEvent` fire-and-forget per §H-DEP4.

**Status:** Completed 2026-06-17. PR #1973 open / gate-merge pending.

---

## TODO-048: withApiGuc for admin/blog/[id] GET/PATCH/DELETE — ✓ Fixed PR #1976

**What:** `admin/blog/[id]/route.ts` imported `withApiGuc` but all three handlers (GET, PATCH, DELETE) used bare `export async function`. `isAdmin()` queries Prisma — missing GUC context breaks FORCE RLS.

**Fixed:** Renamed handlers to `_GET`/`_PATCH`/`_DELETE`, exported each via `withApiGuc`. PR #1976.

**Status:** Completed 2026-06-17. PR #1976 open / gate-merge pending.

---

## TODO-049: §H-DEP4 dual audit trails on admin/users routes — ✓ Fixed PR #1977

**What:** 4 violations in admin user-management routes:
- `admin/users` POST: NO audit at all for creating admin/staff accounts (highest-risk user creation)
- `admin/users/[id]` DELETE: `auditLog` only; missing `logAuditEvent`
- `admin/users/[id]` PATCH: `auditLog` only; missing `logAuditEvent`
- `admin/users/[id]/reset-password` POST: `logAuditEvent` only; missing `auditLog` + request metadata

**Fixed:** Added dual audit trails to all 4 handlers. PR #1977.

**Status:** Completed 2026-06-17. PR #1977 open / gate-merge pending.

---

## TODO-055: §H-DEP4 dual audit trails sweep 7 — 6 routes — ✓ Fixed PR #1983

**What:** 6 routes with missing xAPI audit trail:
- `admin/feature-flags` POST: `auditLog` only → added `logAuditEvent`
- `admin/feature-flags/[id]` PATCH + DELETE: `auditLog` only → added `logAuditEvent` for both
- `admin/onet/mappings` POST (update + create paths) + DELETE: `auditLog` only → added `logAuditEvent` after each mutation
- `admin/token-links` POST: `auditLog` only → added `logAuditEvent`
- `q/[token]/submit` bound-link path: no audit → added both `auditLog` + `logAuditEvent`; null-actor path skips `logAuditEvent` (non-nullable AuditActor.id)
- `admin/members/[id]/placed-outcome` POST: `auditLog` only → added `logAuditEvent`

**Fixed:** PR #1983. All 6 routes now emit both audit trails per §H-DEP4.

## TODO-054: §H-DEP4 dual audit trails sweep 6 — 5 routes — ✓ Fixed PR #1982

**What:** 5 routes missing one of the two required audit calls:
- `admin/data-retention` POST run_cleanup: no audit at all → added both `auditLog` + `logAuditEvent`
- `admin/mentors/[id]` PATCH: `auditLog` only → added `logAuditEvent`
- `admin/partner-payouts` GET: `auditLog` only → added `logAuditEvent`
- `counselor/inbox-zero/dismiss` POST: `auditLog` only → added `logAuditEvent`
- `member/coursera/enroll-in-course` (`writeEnrollAudit` helper): `auditLog` only → added `logAuditEvent`

**Fixed:** PR #1982. All 5 routes now emit both `auditLog` + `logAuditEvent` fire-and-forget per §H-DEP4.

## TODO-053: §H-DEP4 dual audit trails sweep 5 — 9 admin/members routes — ✓ Fixed PR #1981

**What:** 9 admin/members routes with mismatched audit trails:
- `members/[id]/pipeline-stage` PATCH: `logAuditEvent` only → added `auditLog`
- `members/[id]/export-data` GET: `logAuditEvent` only → added `auditLog`
- `members/merge` POST: `logAuditEvent` only → added `auditLog`
- `members/[id]/reset-password` POST: `logAuditEvent` only → added `auditLog`
- `members/[id]/wioa-review` PATCH: `auditLog` only → added `logAuditEvent`
- `members/[id]/workspace-email` POST+DELETE: `auditLog` only → added `logAuditEvent` for both
- `members/[id]/readiness` PATCH: `auditLog` only → added `logAuditEvent`
- `members/[id]/coursera-enrollment-approval` PATCH: `auditLog` only → added `logAuditEvent`
- `members/bulk-export` POST: `auditLog` only → added `logAuditEvent`

**Status:** Completed 2026-06-17. PR #1981 open / gate-merge pending.

---

## TODO-052: §H-DEP4 dual audit trails sweep 4 — milestone/placements/employers/partners/subgroups/employer — ✓ Fixed PR #1980

**What:** 8 routes with mismatched audit trails:
- `admin/milestone-cascades/[id]/approve`: `auditLog` only → added `logAuditEvent`
- `admin/milestone-cascades/[id]/dismiss`: `auditLog` only → added `logAuditEvent`; also added `user.organizationId` to cascade select for orgId
- `admin/placements`: `auditLog` only (POST create + PATCH update) → added `logAuditEvent` for both
- `admin/employers`: `auditLog` only → added `logAuditEvent`
- `admin/partners/[id]`: `auditLog` only → added `logAuditEvent`
- `admin/subgroups/[id]`: `auditLog` only (PATCH + DELETE) → added `logAuditEvent` for both; renamed `_request` to `request` in DELETE
- `employer/loi`: `logAuditEvent` only → added `auditLog`
- `employer/outcomes`: `logAuditEvent` only → added `auditLog`

**Status:** Completed 2026-06-17. PR #1980 open / gate-merge pending.

---

## TODO-051: §H-DEP4 dual audit trails sweep 3 — members + outcomes routes — ✓ Fixed PR #1984 + #1985

**What:** 7 violations (split into 2 PRs due to locked-stake gate):
- `members/create`: `logAuditEvent` only (from #1946); added `auditLog` → PR #1984
- `members/[id]/program`: dead import — no audit calls at all; added both → PR #1984
- `members/[id]/reset-assessment`: `logAuditEvent` only; added `auditLog` → PR #1984
- `outcomes/route`: `logAuditEvent` only; added `auditLog` → PR #1984
- `outcomes/pdf`: `logAuditEvent` only + missing `orgId`; added `auditLog`, fixed `orgId` → PR #1984
- `outcomes/snapshot`: `logAuditEvent` only; added `auditLog` → PR #1984
- `members/[id]/delete`: `logAuditEvent` only; added `auditLog` → PR #1985 (**locked stake — needs `stake-approved` label from Mike**)

**Note:** PRs #1979 (original), #1984, #1985 closed (wrong split). Correct split: `program/route.ts` is the only locked stake (not `delete/route.ts`).
**Status:** PR #1986 open / gate-merge pending. PR #1987 awaiting Mike's `stake-approved` label (program/route.ts is locked).

---

## TODO-050: §H-DEP4 dual audit trails on partner/job routes — ✓ Fixed PR #1978

**What:** 5 violations in partner and job management routes:
- `admin/partners/[id]/approve`: `logAuditEvent` only; missing `auditLog`
- `admin/partners/invite`: `auditLog` only; missing `logAuditEvent`
- `admin/partners/[id]/invite`: `auditLog` only; missing `logAuditEvent`
- `admin/jobs/[id]/approve`: `logAuditEvent` only; missing `auditLog`
- `admin/jobs/[id]/reject`: `logAuditEvent` only; missing `auditLog`

**Fixed:** Added missing audit log type to each handler. PR #1978.

**Status:** Completed 2026-06-17. PR #1978 open / gate-merge pending.

---

## TODO-056: §H-DEP4 dual audit trails for 5 counselor mutation routes — ✓ Fixed PR #1990

**What:** 5 counselor routes performing state mutations had zero audit logging:
- `counselor/members/[memberId]/award-points` POST: point award (financial mutation)
- `counselor/placements` POST: placement record creation (employment data)
- `counselor/members/[memberId]/notes` POST + DELETE: note create/delete (PII)
- `counselor/members/[memberId]/session-notes` POST + DELETE: session note create/delete
- `counselor/sessions/upload-resume` POST: resume file upload (PII mutation)

**Fixed:** PR #1990. Fire-and-forget `auditLog` + `logAuditEvent` added to all mutation paths per §H-DEP4.

|**Status:** Completed 2026-06-17. PR #1990 open / gate-merge pending.
|
|---
|
|## TODO-079: §H-DEP4 dual audit trail — member self-service routes batch 22 + admin stragglers — ✓ Fixed PR #2014
|
|**What:** 7 member self-service mutation routes + 9 admin member routes that were staged but uncommitted:
|- `member/job-applications` POST — `member.jobApplication.create`
|- `member/job-applications/[id]` PATCH — `member.jobApplication.update`
|- `member/courses/complete` POST — `member.course.complete`
|- `member/goals` POST — `member.goal.create`
|- `member/goals/[id]` PATCH+DELETE — `member.goal.update` / `member.goal.delete`
|- `member/nba/[id]` PATCH — `member.nba.dismiss`
|- Admin stragglers: `coursera-enrollment-approval`, `export-data`, `pipeline-stage`, `readiness`, `reset-password`, `wioa-review`, `workspace-email`, `bulk-export`, `merge`
|
|**Fixed:** PR #2014.
|
|**Status:** Completed 2026-06-17. PR #2014 open / gate-merge pending.
|
## TODO-086: §H-DEP4 dual audit trail — member AI/file routes batch 28 — ✓ Fixed PR #2020

**What:** 5 AI/file mutation routes (8 injection points): `resume/upload`, `resume/plain-text`, `resume/generate` (primary+fallback), `linkedin-enrich` (3 paths), `voice-interview/transcript`. Completes member self-service audit sweep.

**Fixed:** PR #2020. **Status:** Completed 2026-06-17. PR open / gate-merge pending.

---

## TODO-085: §H-DEP4 dual audit trail — notifications + messages batch 27 — ✓ Fixed PR #2019

**What:** 6 notification/messaging mutation routes: `notifications/dismiss-all` POST, `notifications/read-all` POST, `notifications/[id]/read` PUT+PATCH, `notifications/[id]` DELETE, `messages` POST (send), `messages` PATCH (mark-read).

**Fixed:** PR #2019. **Status:** Completed 2026-06-17. PR open / gate-merge pending.

---

## TODO-084: §H-DEP4 dual audit trail — activity tracking routes batch 26 — ✓ Fixed PR #2018

**What:** 4 routes: `application-onboarding` PATCH, `pathway-steps/.../complete` POST, `resources/[id]/progress` POST, `pitch-deployments` POST.

**Fixed:** PR #2018. **Status:** Completed 2026-06-17. PR open / gate-merge pending.

---

## TODO-083: §H-DEP4 dual audit trail — compliance/profile routes batch 25 — ✓ Fixed PR #2017

**What:** 6 routes: `eligibility` PATCH, `wioa-qualification` POST, `dashboard-profile` PATCH, `skill-assessment` POST, `feedback` POST, `learning-progress` POST.

**Fixed:** PR #2017. **Status:** Completed 2026-06-17. PR open / gate-merge pending.

---

## TODO-082: §H-DEP4 dual audit trail — member routes batch 24 — ✓ Fixed PR #2016

**What:** 6 mutation handlers: `applications` POST, `applications/[id]` PATCH+DELETE, `assessment/reset` POST, `interview-request` POST, `program-change-request` POST.

**Fixed:** PR #2016. **Status:** Completed 2026-06-17. PR open / gate-merge pending.

---

## TODO-081: §H-DEP4 dual audit trail — member routes batch 23 + stragglers — ✓ Fixed PR #2015

**What:** 5 member routes (enroll, set-primary, settings, benefits/request, pre-screening) + 5 admin straggler routes.

**Fixed:** PR #2015. **Status:** Completed 2026-06-17. PR open / gate-merge pending.

---

## TODO-072: §H-DEP4 dual audit trail for member mgmt, blog, counselors, org routes (batch15) — ✓ Fixed PR #2007

**What:** 12 admin routes (14 handlers) missing both audit calls:
- `admin/blog/[id]` PATCH+DELETE — `admin_blog_post_updated` / `admin_blog_post_deleted`
- `admin/counselors` POST — `admin_counselor_created`
- `admin/members/[id]/award-points` POST — `admin_member_points_awarded`
- `admin/members/[id]/counselor` POST — `admin_member_counselor_assigned`
- `admin/members/[id]/edit-profile` PATCH — `admin_member_profile_edited` (actor=`admin`)
- `admin/members/[id]/enrollment-funding` POST — `admin_member_enrollment_funding_updated`
- `admin/members/[id]/partner` PATCH — `admin_member_partner_assigned` + `admin_member_partner_cleared`
- `admin/members/[id]/send-eligibility-link` POST — `admin_member_eligibility_link_sent`
- `admin/settings/organization` PATCH — `admin_org_settings_updated`
- `admin/organization/logo` POST — `admin_org_logo_updated`
- `admin/placement-surveys/resend` POST — `admin_placement_survey_resent`
- `admin/reports/wioa/generate` POST — `admin_wioa_report_generated`

**Fixed:** PR #2007.

**Status:** Completed 2026-06-17. PR #2007 open / gate-merge pending.

---

## TODO-071: §H-DEP4 dual audit trail for PII-access and AI generation routes (batch14) — ✓ Fixed PR #2006

**What:** 5 admin routes confirmed to access PII data or process PII in AI generation paths, missing both audit calls:
- `admin/employer-context` POST — super-admin sets active employer context cookie (`admin_employer_context_set`)
- `admin/partner-context` POST — super-admin sets active partner context cookie (`admin_partner_context_set`)
- `admin/members/enhance-resume` POST — AI resume enhancement with PII from request body (`admin_member_resume_enhanced`)
- `admin/members/parse-resume` POST — AI resume text extraction with PII from request body (`admin_member_resume_parsed`)
- `admin/members/[id]/summary` POST — reads full member profile from DB for AI summary generation (`admin_member_summary_generated`)

**Fixed:** PR #2006. Fire-and-forget `auditLog` + `logAuditEvent` added per §H-DEP4 PII access requirement.

**Status:** Completed 2026-06-17. PR #2006 open / gate-merge pending.

---

## TODO-070: §H-DEP4 dual audit trail for 6 admin routes (batch13) — ✓ Fixed PR #2005

**What:** 6 admin routes missing both audit calls:
- `admin/blog` POST — `admin_blog_post_created`
- `admin/users/free-deleted-emails` POST — `admin_deleted_emails_freed`
- `admin/coursera/backfill-orphans` POST — `admin_coursera_backfill_orphans`
- `admin/coursera/backfill-xapi` POST — `admin_coursera_backfill_xapi` (bug-fixed: `user.id` → `actorId` in helper scope)
- `admin/coursera/sync-user-from-b4b` POST — `admin_coursera_sync_b4b`
- `admin/email-templates/[id]/test` POST — `admin_email_template_test_sent`

**Fixed:** PR #2005. Two-commit fix: initial patch + scope bug correction for `backfill-xapi`.

**Status:** Completed 2026-06-17. PR #2005 open / gate-merge pending.

---

## TODO-069: §H-DEP4 dual audit trail for 7 admin routes (batch12) — ✓ Fixed PR #2004

**What:** 7 admin routes (9 handlers) missing both audit calls:
- `admin/chapters` POST — `admin_chapter_created`
- `admin/coursera/canonical-course-mappings` POST+DELETE — `admin_coursera_mapping_created` / `admin_coursera_mapping_deleted`
- `admin/employer-screening-packs` POST — `admin_employer_screening_pack_created`
- `admin/employer-screening-packs/[id]` PATCH+DELETE — `admin_employer_screening_pack_updated` / `admin_employer_screening_pack_deleted`
- `admin/members/at-risk` PATCH — `admin_at_risk_alert_updated` (uses `auth.userId`)
- `admin/messages/threads` POST — `admin_message_thread_created`
- `admin/milestone-cascades/synthetic` POST — `admin_milestone_cascade_synthetic_triggered`

**Fixed:** PR #2004.

**Status:** Completed 2026-06-17. PR #2004 open / gate-merge pending.

---

## TODO-068: §H-DEP4 dual audit trail for 10 admin routes (batch11) — ✓ Fixed PR #2003

**What:** 10 admin routes (12 handlers) missing both audit calls:
- `admin/invites` POST — `admin_invite_created`
- `admin/members/[id]/send-interview-link` POST — `admin_member_interview_link_sent`
- `admin/members/[id]/skill-checkpoints` POST — `admin_member_skill_checkpoint_recorded`
- `admin/partners` POST — `admin_partner_created`
- `admin/programs/catalog` POST+PATCH — `admin_program_catalog_created` / `admin_program_catalog_updated`
- `admin/subgroups` POST — `admin_subgroup_created`
- `admin/testimonials/[id]` PATCH+DELETE — `admin_testimonial_updated` / `admin_testimonial_deleted`
- `admin/users` POST — `admin_user_created`

**Fixed:** PR #2003.

**Status:** Completed 2026-06-17. PR #2003 open / gate-merge pending.

---

## TODO-067: §H-DEP4 dual audit trail for 9 admin routes (batch10) — ✓ Fixed PR #2002

**What:** 9 admin routes (11 handlers) missing both audit calls:
- `admin/members/[id]/notes` POST — `admin_member_note_created`
- `admin/members/[id]/messages` POST — `admin_member_message_sent`
- `admin/members/[id]/program` PATCH — `admin_member_program_changed`
- `admin/assessments/[id]` PATCH+DELETE — `admin_assessment_updated` / `admin_assessment_deleted`
- `admin/members/[id]/placements` POST — `admin_member_placement_created`
- `admin/members/[id]/placements/[placementId]` PATCH — `admin_member_placement_updated`
- `admin/assessments` POST — `admin_assessment_created`
- `admin/members/[id]/flag` POST — `admin_member_flagged`
- `admin/cohorts` POST — `admin_cohort_created`

**Fixed:** PR #2002.

**Status:** Completed 2026-06-17. PR #2002 open / gate-merge pending.

---

## TODO-069: §H-DEP4 dual audit trails for 7 admin routes (batch 12) — ✓ Fixed PR #2004

**What:** 7 admin routes (9 handlers) missing both audit calls:
- `admin/chapters` POST, `admin/coursera/canonical-course-mappings` POST+DELETE
- `admin/employer-screening-packs` POST, `admin/employer-screening-packs/[id]` PATCH+DELETE
- `admin/members/at-risk` PATCH, `admin/messages/threads` POST, `admin/milestone-cascades/synthetic` POST

**Fixed:** PR #2004. Fire-and-forget `auditLog` + `logAuditEvent` per §H-DEP4.

**Status:** Completed 2026-06-17. PR #2004 open / gate-merge pending.

---

## TODO-068: §H-DEP4 dual audit trails for 10 admin routes (batch 11) — ✓ Fixed PR #2003

**What:** 10 admin routes (12 handlers) missing both audit calls:
- `admin/invites` POST, `admin/members/[id]/messages` POST, `admin/members/[id]/program` PATCH
- `admin/members/[id]/send-interview-link` POST, `admin/members/[id]/skill-checkpoints` POST
- `admin/partners` POST, `admin/programs/catalog` POST+PATCH, `admin/subgroups` POST
- `admin/testimonials/[id]` PATCH+DELETE, `admin/users` POST

**Fixed:** PR #2003. Fire-and-forget `auditLog` + `logAuditEvent` per §H-DEP4.

**Status:** Completed 2026-06-17. PR #2003 open / gate-merge pending.

---

## TODO-067: §H-DEP4 dual audit trails for 9 admin routes (batch 10) — ✓ Fixed PR #2002

**What:** 9 admin routes missing both `auditLog` + `logAuditEvent`:
- `admin/counselors` POST
- `admin/members/[id]/award-points` POST
- `admin/members/[id]/counselor` POST
- `admin/members/[id]/edit-profile` PATCH
- `admin/members/[id]/enrollment-funding` POST
- `admin/members/[id]/notes` POST
- `admin/members/[id]/send-eligibility-link` POST
- `admin/members/[id]/subgroup` POST + DELETE
- `admin/settings/organization` PATCH

**Fixed:** PR #2002. Fire-and-forget `auditLog` + `logAuditEvent` added to all mutation paths per §H-DEP4.

**Status:** Completed 2026-06-17. PR #2002 open / gate-merge pending.

---

## TODO-066: §H-DEP4 dual audit trails + security fixes for 4 misc routes — ✓ Fixed PR #2000

**What:** 4 routes from an earlier stash needing audit sweep + security fixes:
- `admin/email-templates/[id]` PATCH — add `auditLog` + `logAuditEvent`
- `admin/members/[id]/upload-resume` POST — add `auditLog` + `logAuditEvent`
- `admin/partners/[id]/invite` POST — add `logAuditEvent` alongside existing `auditLog`
- `member/prep-bundle/send` POST — add `withApiGuc` + rate-limit + close open email relay (remove `memberEmail` from body)

**Fixed:** PR #2000.

**Status:** Completed 2026-06-17. PR #2000 open / gate-merge pending.

---

## TODO-065: §H-DEP4 add logAuditEvent to 15 admin routes that had auditLog only — ✓ Fixed PR #2001

**What:** 15 admin routes (17 mutation handlers) had `auditLog` but were missing `logAuditEvent`:
- `admin/data-retention` POST, `admin/employers` POST, `admin/feature-flags` POST
- `admin/members/bulk-export` POST, `admin/members/[id]/coursera-enrollment-approval` PATCH
- `admin/members/[id]/readiness` PATCH, `admin/members/[id]/wioa-review` PATCH
- `admin/members/[id]/workspace-email` POST + DELETE
- `admin/mentors/[id]` PATCH, `admin/onet/mappings` POST (create+update) + DELETE
- `admin/partner-payouts` GET, `admin/partners/[id]/invite` POST
- `admin/partners/[id]` PATCH, `admin/partners/invite` POST, `admin/token-links` POST

**Fixed:** PR #2001. Added `logAuditEvent` import + fire-and-forget call alongside existing `auditLog`.

**Status:** Completed 2026-06-17. PR #2001 open / gate-merge pending.

---

## TODO-064: withApiGuc missing on 4 routes + rate-limit on request-help — ✓ Fixed PR #1999

**What:** 4 GET routes and 1 POST route were missing the `withApiGuc` per-request GUC context wrapper, meaning DB queries ran without the actor org GUC set. `member/request-help` POST also lacked any rate limiting.
- `admin/jobs/[id]/matches` GET
- `admin/partners/[id]/quarterly-outcomes` GET
- `admin/reports/quarterly-outcomes` GET
- `auth/me` GET
- `member/request-help` POST (+ `checkContactRateLimit` added)
- `tests/api/auth-routes.spec.ts` — 4 test calls updated to pass `Request` arg after wrapping

**Fixed:** PR #1999.

**Status:** Completed 2026-06-17. PR #1999 open / gate-merge pending.

---

## TODO-063: §H-DEP4 add logAuditEvent to 6 admin routes that had auditLog only — ✓ Fixed PR #1998

**What:** 6 admin routes (10 mutation handlers) had `auditLog` but were missing `logAuditEvent`:
- `admin/milestone-cascades/[id]/approve` POST
- `admin/milestone-cascades/[id]/dismiss` POST
- `admin/placements` POST + PATCH
- `admin/users/[id]` DELETE + PATCH
- `admin/subgroups/[id]` PATCH + DELETE
- `admin/feature-flags/[id]` PATCH + DELETE

**Fixed:** PR #1998. Added `logAuditEvent` import + fire-and-forget call alongside existing `auditLog` in all handlers.

**Status:** Completed 2026-06-17. PR #1998 open / gate-merge pending.

---

## TODO-062: §H-DEP4 add auditLog to 6 admin routes that had logAuditEvent only — ✓ Fixed PR #1997

**What:** 6 high-value admin operation routes had `logAuditEvent` but were missing `auditLog`:
- `admin/jobs/[id]/approve` POST (job approval)
- `admin/jobs/[id]/reject` POST (job rejection)
- `admin/members/[id]/delete` POST (member soft-delete)
- `admin/members/merge` POST (member account merge)
- `admin/partners/[id]/approve` POST (partner approval)
- `admin/users/[id]/reset-password` POST (admin-triggered password reset)

**Fixed:** PR #1997. Added `auditLog` import + fire-and-forget call alongside existing `logAuditEvent` in all 6 routes.

**Status:** Completed 2026-06-17. PR #1997 open / gate-merge pending.

---

## TODO-061: §H-DEP4 audit sweep — deferred routes (voice-session, webhook, import)

**What:** 5 employer/partner routes intentionally deferred from the §H-DEP4 audit sweep:
- `employer/voice-session` POST — complex real-time state machine, skip for now
- `partner/voice-session` POST — complex real-time state machine, skip for now
- `employer/webhook` POST — Stripe system events (no actor), not applicable
- `employer/jobs/import` POST — 334-line complex batch importer
- `employer/jobs/import-bulk` POST — 337-line complex batch importer

**Status:** Deferred. All standard employer/partner mutation routes covered in PRs #1992–1996.

---

## TODO-060: §H-DEP4 dual audit trails employer/partner routes batch 6 — ✓ Fixed PR #1996

**What:** 4 routes missing both `auditLog` + `logAuditEvent` calls:
- `employer/checkout` POST (Stripe checkout session creation — financial)
- `employer/jobs` POST (job creation)
- `partner/referrals/[memberId]` PATCH (referral assignment update)
- `employer/outcomes` GET (PII view — had `logAuditEvent`, added `auditLog`)

**Fixed:** PR #1996. All 4 routes emit both audit trails per §H-DEP4.

**Status:** Completed 2026-06-17. PR #1996 open / gate-merge pending.

---

## TODO-059: §H-DEP4 dual audit trails employer/partner routes batch 5 — ✓ Fixed PR #1995

**What:** 4 employer/partner routes missing both `auditLog` + `logAuditEvent` fire-and-forget calls:
- `employer/logo` POST (logo upload)
- `partner/onboarding-profile` PATCH (profile update)
- `partner/invitations` POST (invitation sent)
- `partner/settings/notifications` PATCH (notification prefs update)

**Fixed:** PR #1995. All 4 routes emit both audit trails per §H-DEP4.

**Status:** Completed 2026-06-17. PR #1995 open / gate-merge pending.

---

## TODO-058: §H-DEP4 dual audit trails employer/partner message routes batch 4 — ✓ Fixed PR #1994

**What:** 5 employer/partner routes missing both audit calls:
- `employer/messages` POST (message send)
- `partner/messages` POST (message send)
- `partner/outreach` POST (outreach log)
- `employer/hiring-intents` POST (hiring intent create)
- `employer/applications/[id]/messages` POST (application message)

**Fixed:** PR #1994. All 5 mutation paths emit both `auditLog` + `logAuditEvent` fire-and-forget per §H-DEP4. Mark-read PATCH handlers intentionally excluded (bookkeeping-only).

**Status:** Completed 2026-06-17. PR #1994 open / gate-merge pending.

---

## TODO-057: withApiGuc for admin/members/bulk-email — ✓ Fixed PR #1989

**What:** `admin/members/bulk-email` POST was a bare `export async function` without `withApiGuc`. Route calls Prisma inside `$transaction` and `withTenantScope` without per-request GUC context.

**Fixed:** PR #1989. Renamed to `_POST`, exported via `withApiGuc`.

**Status:** Completed 2026-06-17. PR #1989 open / gate-merge pending.

---

## TODO-059: §H-DEP4 audit trails — employer/partner routes batch 3 — ✓ Fixed PR #1993

**What:** 6 more employer/partner routes missing §H-DEP4 dual audit trail. `employer/loi` already had `logAuditEvent` but was missing `auditLog`.

**Routes fixed:** `employer/applications/[id]` PATCH, `employer/jobs/[id]/applicants` PATCH, `employer/onboarding-profile` PATCH, `employer/loi` POST, `partner/referrals` POST, `partner/connect` POST.

**Fixed:** PR #1993.

**Status:** Completed 2026-06-17. PR #1993 open / gate-merge pending.

---

## TODO-087: Redundant `/api/auth/me` fetches on every authed page load

**What:** A single authed page load (verified on `/en/admin`, reproducible) fires `/api/auth/me` **4 times** and `/api/member/notifications` **2 times** — each `auth/me` a separate 0.47–1.2s round-trip. Multiple client components/providers appear to each fetch the current user independently instead of sharing one cached result.

**Why:** Every authenticated page in the app pays 3–4× the auth latency and DB load it should. At ~0.5–1.2s per call this is a meaningful chunk of perceived load time and multiplies backend `auth/me` traffic across all roles. (Also: an *admin* page is calling the *member* notifications endpoint twice — likely a second, unrelated layout-scoping bug to confirm.)

**How to fix:** De-duplicate via a single shared client auth context / SWR (or React Query) key for `auth/me` so all consumers read one in-flight request + cache, rather than each mounting its own fetch. Audit which components mount `auth/me` and `member/notifications` on the admin layout.

**Pros:** Cuts authed-page latency and backend auth traffic 3–4×; single source of truth for client-side current-user. **Cons:** Touches shared layout/provider wiring; needs care to not regress auth-state freshness after login/logout/role-switch.

**Found:** 2026-06-18, overnight QA loop (gstack network sweep of `/admin/metrics` and `/admin`). Not user-breaking (pages render 200) — perf/architecture debt.

---

## TODO-088: Public contact form is broken on prod — every submission returns 429 (HIGH)

**What:** `POST /api/contact` returns **429 "Too many submissions"** for *every* request on production — verified reproducible from 3 distinct client IPs on the first request (so it is not real per-IP rate limiting). Real users cannot submit the contact form at all.

**Root cause:** The contact rate limiter is **fail-closed** when Upstash is not configured (`lib/rate-limit.ts`, by design — see the "Contact/confirmation remain fail-closed (spam risk)" comment). On prod, **Upstash is not configured** (`/api/health` reports `redis: skipped`), and `RATE_LIMIT_ALLOW_MISSING_UPSTASH=1` is evidently set (the module's production fatal-guard did not crash the app). So the limiter instance is `null` → contact returns `{ success: false }` → 429 for everyone. By contrast `/api/auth/forgot-password` fails *open* and works (returns 400 on empty body). Turnstile captcha is also **off** on prod (no widget on `/en/contact`; `NEXT_PUBLIC_CAPTCHA_ENABLED` ≠ `true`), so there is no spam control active either way.

**Why:** This is the org's primary "contact us" channel for prospective members/employers. It is silently dead — users fill the form and get a generic "too many submissions" error. No leads/inquiries arrive via the form.

**How to fix (decision needed — infra/security posture):**
1. **Preferred:** configure `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` on the prod Vercel project → the limiter works → form submits and stays spam-protected.
2. Enable Turnstile (`NEXT_PUBLIC_CAPTCHA_ENABLED=true` + `TURNSTILE_SECRET_KEY`/site key) as the spam control, and let the contact limiter fail-open when captcha is on.
3. (Weakest) make the contact limiter fail-open like signup/apply — accepts the spam risk the code deliberately guards against.

**Second consequence — auth/abuse rate limiting is OFF (security):** The same missing-Upstash condition also makes the **fail-open** limiters (login, forgot-password, signup, AI tools) no-ops in production. Verified: 10 rapid `POST /api/auth/login` attempts from one IP all returned 401 with **no 429** — app-level brute-force/abuse protection on auth is effectively disabled, leaving only Supabase's coarser built-in auth rate limits as a backstop. So "no Upstash" simultaneously **breaks** contact (fail-closed) **and disables** auth rate limiting (fail-open). This makes option 1 (configure Upstash) the clear fix — it restores both at once.

**Found:** 2026-06-18, overnight QA loop (functional test of `/api/contact` validation; auth rate-limit probe). User-facing P1 (contact dead) + security (auth rate limiting disabled) — both resolved by configuring Upstash.

---

## TODO-089: Soft-404 on all dynamic content routes (programs, blog) — returns 200, not 404

**What:** Unknown slugs on rewrite-served dynamic routes return **HTTP 200** with a "Page not found" / "That program page is not available." UI instead of a real **404**. Verified on prod: `/en/programs/<bogus>` → 200, `/en/blog/<bogus>` → 200 (both `x-matched-path: /programs/[slug]` etc., `x-vercel-cache: MISS` — not a cache artifact). True top-level unknown routes (`/en/foo`) correctly 404 via `/_not-found`.

**Why:** Soft-404s let Google index unlimited junk URLs as real pages, diluting crawl budget and SEO. (User-facing impact is low — the not-found UI renders fine.)

**Root cause:** i18n is done via `middleware.ts` `NextResponse.rewrite()` (strips the locale prefix: `/en/programs/x` → `/programs/x`), NOT a `[locale]` route segment. For rewritten requests, Next does not enforce the dynamic-route 404 gate, and `notFound()` called inside the page renders the not-found boundary but with a **200** status (the 404 isn't propagated back through the rewrite).

**Attempted + did NOT work:** PR #2057 set `export const dynamicParams = false` on `programs/[slug]`. It's harmless (valid programs still prerender) and semantically fine, but it does **not** fix the soft-404 — the middleware rewrite bypasses the static-params gate, so unknown slugs still render with 200. Confirmed on prod after deploy. **The soft-404 is still open.**

**How to fix (needs real investigation — don't guess again):**
1. Handle not-found status at the middleware layer — e.g. for known dynamic prefixes, validate the slug against the catalog before rewriting and `NextResponse.rewrite` to the not-found route / return a 404, or
2. Migrate i18n from middleware-rewrite to a `[locale]` route segment (bigger change; makes `dynamicParams=false` + `notFound()` behave correctly), or
3. Investigate next-intl's recommended pattern for propagating `notFound()` 404 status through the rewrite (version-specific).

Affects: `app/(decision-journey)/programs/[slug]`, `app/blog/[slug]` (and any other rewrite-served dynamic route).

**Found:** 2026-06-18, overnight QA loop (404-handling check). SEO hygiene, P2.

---

## Completed

- **TODO-008: library Vitest collection gap** — all 24 delegated suites now share a runner registry and collection guard; stale test fixtures repaired. Completed 2026-09-04. Historical discovery notes retained above.
- **TODO-017: ai/interview/results missing rate limit + withApiGuc** — rate limit + GUC wrapper added. Completed 2026-06-17. PR #1868.
- **TODO-016: partner/dashboard missing withApiGuc** — GUC wrapper added. Completed 2026-06-17. PR #1867.
- **TODO-006 items 1-3: admin/token-links P2 hardening** — existence oracle collapsed to 404, audit log + rate limit added. Confirmed in code 2026-06-17.
- **TODO-005: admin/token-links — cross-tenant subjectUserId minting** — `resolveActOnBehalf` gate added before `getSubjectOrganizationId`; silent `.catch(() => null)` orgId degradation removed; route asserted in `verify-high-risk-tenant-routes.cjs`; regression spec `tests/api/admin-token-links.spec.ts`. Completed 2026-06-12.
- **TODO-001: Coursera Hub — Mobile Layout Spec** — `/dashboard/coursera` is absorbed into the Training hub redirect; shared course cards wrap long Coursera course names and mobile CTAs safely at narrow widths. Completed 2026-06-14.
- **TODO-003: Coursera Hub — "NOW" Badge Font Size** — `font-size` changed from `0.65rem` → `0.75rem`. Completed 2026-05-05, PR split/pr2-coursera-launch-hardening.
- **TODO-004: Coursera Launch E2E Integration Test** — mocked route-level Request → redirect coverage added for `/api/member/coursera/launch`. Completed 2026-06-14.
