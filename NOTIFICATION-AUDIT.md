# Notification System Audit

**Consolidated/refreshed:** 2026-07-01 — this file replaces two stale, contradictory
copies (root `NOTIFICATION-AUDIT.md` and `docs/NOTIFICATION-AUDIT.md`, both dated
2026-03-20 and both listing only ~10 email templates). The `emails/` directory now
has ~55 files; this version reflects that inventory. Kept at repo root to match the
convention used by other top-level audit docs (e.g. `MOBILE_AUDIT.md`,
`QA-AUDIT-REPORT-2026-05-12.md`, `AUDIT-2026-05-16.md`).

## Email Provider

| Provider | Usage | Config |
|----------|-------|--------|
| **Resend** | All app-triggered transactional emails | `RESEND_API_KEY`, `EMAIL_FROM` |
| **Supabase Auth SMTP** | Auth emails (confirm, password reset, invite) | Configure in Supabase Dashboard → Auth → SMTP |

**Environment variables:**
- `RESEND_API_KEY` – Required for sending (optional in dev)
- `EMAIL_FROM` – Sender address (default: `noreply@workforceap.org`)
- `CRON_SECRET` – Required for cron endpoints that trigger digest/recap emails

## Architecture

Two parallel template systems live under `emails/`:

1. **HTML-string builders (`.ts`)** — the active, wired system. Each file exports an
   `...Html()` function (plus sometimes a `...Subject()` helper) built on
   `lib/email/template.ts`'s `brandedEmailLayout()`. All of these are re-exported
   from `emails/index.ts` and consumed by `lib/email.ts`, which contains the actual
   `send...` functions used by routes/crons.
2. **React Email components (`.tsx`)** — a separate set of JSX-based templates
   (`Layout.tsx`, `Welcome.tsx`, `Invite.tsx`, `MagicLink.tsx`, etc.). As of this
   audit these are **not imported anywhere outside `emails/`** — they are not wired
   into `emails/index.ts` or `lib/email.ts`. Treat them as legacy/in-progress
   components rather than live send paths until confirmed otherwise.

`emails/session-packet.ts` is a third case: imported directly by
`app/api/counselor/sessions/email-packet/route.ts` rather than through
`emails/index.ts`.

## Current Template Inventory (`emails/`)

### Wired HTML builders (exported via `emails/index.ts`, used by `lib/email.ts`)

| File | Export | Purpose |
|------|--------|---------|
| `application-accepted.ts` | `applicationAcceptedHtml` | Admin approves application → applicant |
| `application-rejected.ts` | `applicationRejectedHtml` | Admin rejects application → applicant |
| `application-confirmation.ts` | `applicationConfirmationHtml` | Application submitted confirmation → applicant |
| `new-application-alert.ts` | `newApplicationAlertHtml` | New signup → admin alert |
| `admin-pending-applicants.ts` | `adminPendingApplicantsHtml` | Pending applicants digest → admin |
| `admin-weekly-recap.ts` | `adminWeeklyRecapHtml` | Weekly admin recap |
| `applicant-followup.ts` | `applicantFollowupHtml` | Applicant follow-up nudge |
| `enrollment-confirmation.ts` | `enrollmentConfirmationHtml` | Member enrolls in program → member |
| `course-enrolled.ts` | `courseEnrolledHtml` | Member enrolls in course |
| `course-kickoff.ts` | `courseKickoffHtml` | Course kickoff notice |
| `course-accountability.ts` | `courseAccountabilityHtml` | Course accountability check-in |
| `course-completed.ts` | `courseCompletedHtml` | Member completes course |
| `cert-celebration-v2.ts` | `certCelebrationV2Html` | Certification earned celebration |
| `weekly-recap.ts` | `weeklyRecapHtml` | Weekly member recap (cron) |
| `inactive-nudge.ts` | `inactiveNudgeHtml` | Inactive member nudge (cron) |
| `invitation.ts` | `invitationHtml` | Generic invite |
| `invitation-accepted.ts` | `invitationAcceptedHtml` | Invite accepted confirmation |
| `job-submitted.ts` | `jobSubmittedHtml` | Job posting submitted → employer |
| `job-approved.ts` | `jobApprovedHtml` | Job posting approved → employer |
| `job-rejected.ts` | `jobRejectedHtml` | Job posting rejected → employer |
| `new-job-application.ts` | `newJobApplicationHtml` | New application → employer |
| `ai-match-suggestion.ts` | `aiMatchSuggestionHtml` | AI candidate match suggestion |
| `partner-weekly-digest.ts` | `partnerWeeklyDigestHtml` | Partner weekly digest |
| `partner-referral-invite.ts` | `partnerReferralInviteHtml` | Partner referral invite |
| `counselor-at-risk-alert.ts` | `counselorAtRiskAlertHtml`, `counselorAtRiskBatchHtml` | Counselor at-risk alerts (single + batch) |
| `counselor-assigned.ts` | `counselorAssignedHtml` | Counselor assigned → member |
| `placement-survey.ts` | `placementSurveyHtml`, `placementSurveyEscalationHtml` | Placement survey + escalation |
| `employer-welcome.ts` | `employerWelcomeHtml` | Employer welcome |
| `employer-verify-email.ts` | `employerVerifyEmailHtml` | Employer email verification |
| `employer-signup-admin-alert.ts` | `employerSignupAdminAlertHtml` | Employer signup → admin alert |
| `employer-approved.ts` | `employerApprovedHtml` | Employer account approved |
| `employer-rejected.ts` | `employerRejectedHtml` | Employer account rejected |
| `wioa-report.ts` | `wioaReportHtml` | WIOA report delivery |
| `member-check-in.ts` | `memberCheckInHtml`, `memberCheckInSubject` | Member check-in |
| `member-come-back.ts` | `memberComeBackHtml`, `memberComeBackSubject` | Re-engagement / "come back" nudge |
| `member-stuck.ts` | `memberStuckHtml`, `memberStuckSubject` | Member appears stuck in a step |

### Wired directly (not via `index.ts`)

| File | Export | Purpose |
|------|--------|---------|
| `session-packet.ts` | `sessionPacketHtml` | Counselor session packet email (`app/api/counselor/sessions/email-packet/route.ts`) |

### Unwired React Email components (`.tsx`) — not currently imported outside `emails/`

| File | Apparent purpose |
|------|-------------------|
| `Layout.tsx` | Shared JSX layout wrapper (analogue of `lib/email/template.ts` for the `.tsx` set) |
| `Welcome.tsx` | Welcome email |
| `Invite.tsx` | Generic invite |
| `EmployerInvite.tsx` | Employer invite |
| `PartnerInvite.tsx` | Partner invite |
| `MagicLink.tsx` | Magic-link sign-in |
| `NewApplicationAlert.tsx` | New application alert (duplicate of `.ts` version) |
| `CandidateMatchAlert.tsx` | Candidate match alert |
| `CourseStartNotification.tsx` | Course start notification |
| `CourseCompleted.tsx` | Course completed (duplicate of `.ts` version) |
| `StageMovedNotification.tsx` | Pipeline stage moved notification |
| `JobPostingStatus.tsx` | Job posting status update |
| `InactiveNudge.tsx` | Inactive nudge (duplicate of `.ts` version) |
| `PartnerWeeklyDigest.tsx` | Partner weekly digest (duplicate of `.ts` version) |

Before removing or "cleaning up" the `.tsx` set, confirm with the team whether it's
an in-progress migration target or genuinely dead — this audit only establishes
that they are currently unreferenced.

### Tests

| File | Covers |
|------|--------|
| `branding-parameterization.test.ts` | Tenant/org branding parameterization across templates |
| `enrollment-confirmation.test.ts` | `enrollment-confirmation.ts` |
| `partner-referral-invite.test.ts` | `partner-referral-invite.ts` |

## Send Functions & Code Locations

- **Send functions:** `lib/email.ts` (imports all wired `.ts` builders from `@/emails`)
- **Branded layout:** `lib/email/template.ts` → `brandedEmailLayout()`
- **Send transport:** `lib/email/send.ts` → `sendBrandedEmail()` (Resend)
- **Subject sanitization:** `lib/email/escapeHtml.ts`
- **Partner notification helpers:** `lib/notifications/partner-notify.ts`

## Cron-Driven Notifications

| Cron Route | Purpose |
|------------|---------|
| `/api/cron/weekly-recap` | Weekly member recap (`weekly-recap.ts`) |
| `/api/cron/inactive-nudge` | Inactive member nudge (`inactive-nudge.ts`) |
| `/api/admin/email-crons/[id]/dry-run` | Preview/dry-run any cron-driven email |
| `/api/admin/email-crons/[id]/template-preview` | Render a template preview for admin QA |

Vercel Cron schedules for these are defined in `vercel.json`.

## Auth Emails (Supabase, not Resend)

- **Confirm signup** – Supabase Auth (SMTP configured in dashboard)
- **Reset password** – Supabase Auth
- **Invite user** – `supabase.auth.admin.inviteUserByEmail()` (partner invite, admin create member)

## Configuration Checklist

- [ ] `RESEND_API_KEY` set in production
- [ ] `EMAIL_FROM` set (e.g. `noreply@workforceap.org`)
- [ ] Domain verified in Resend (workforceap.org)
- [ ] Supabase Auth SMTP configured (Resend SMTP: smtp.resend.com, port 465/587)
- [ ] Supabase email templates customized (confirm, reset)

## Dependencies

- `resend` (see `package.json` for pinned version)
- No SendGrid, AWS SES, or Nodemailer in use
