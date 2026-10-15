# Coursera For Business Enrollment Flow

This document covers the self-service "Enroll in this course" button on
the Learning Hub and My program enrollment handoff, the eligibility gate that protects paid Coursera
seats, and the four-state graph the route handler walks per click.

## Cost note (read first)

**Every successful enrollment consumes a paid Coursera seat.** Once a
learner is enrolled on Coursera's side, the seat is charged regardless of
whether the learner ever logs in or completes the course. The eligibility
gate (`User.courseraEnrollmentApproved`) is the only thing protecting the
budget — there is no second-chance check downstream.

## Eligibility model

`User.courseraEnrollmentApproved` is a `Boolean DEFAULT FALSE` column on
`users`. It is set in exactly three places, all in code (never by DB
defaults):

1. **Counselor program-change approval** —
   `app/api/admin/program-change-requests/[id]/route.ts`. When an admin
   approves a counselor-submitted program change, the flag flips to true
   and an `audit_logs` row is written with `action =
   coursera_enrollment_approved` and `metadata.source =
   program_change_request_approved`.
2. **Admin "Approve enrollment" toggle** —
   `app/api/admin/members/[id]/coursera-enrollment-approval/route.ts`,
   surfaced as `<MemberCourseraEnrollmentApproval>` on the admin member
   detail page. Both directions (`approved → revoked` and back) write
   audit rows.
3. **Future: counselor self-service enroll** — not implemented in this
   PR. When added, it should follow the same pattern as #1.

`super_admin` users **do not auto-approve themselves** by visiting their
own dashboard — the flag is row-state on `users`, not derived from role.
A super_admin who wants to dogfood the flow must be explicitly approved
via path #2 above.

## State graph

Each click on "Enroll in this course" walks the following state graph,
implemented purely in `lib/coursera/enrollState.ts` and exercised by
`lib/coursera/enrollState.test.ts`:

```
                ┌─ courseraEnrollmentApproved=false ──→ 403 NOT_APPROVED
                │
                ├─ enrolledProgram=null ──────────────→ 400 NO_PROGRAM
POST /enroll ───┤
                ├─ courseraCourseId not in program ───→ 400 COURSE_NOT_IN_PROGRAM
                │
                └─ B4BPort.listUsersByEmail
                       │
                       ├─ null  ──→ inviteUserToProgram(sendEmail=true)
                       │              └─ status: 'invited'
                       │                  message: "Check your email …"
                       │
                       ├─ exists, not in program
                       │           ──→ createProgramMembership
                       │              └─ enrollUserInCourse
                       │                  └─ status: 'membership-created-and-enrolled'
                       │
                       └─ exists, in program
                                   ──→ enrollUserInCourse
                                       ├─ 200 → status: 'enrolled'
                                       └─ 400 ALREADY_ENROLLED
                                           → status: 'already-enrolled'
```

## "No Coursera account" fallback

A member who is approved but has never used Coursera before will:

1. Click "Enroll in this course" — the route's `listUsersByEmail` returns
   `null` because they're not in the B4B roster yet.
2. Get an invite email from Coursera (the route calls
   `inviteUserToProgram` with `sendEmail: true`).
3. Click the link in the email, complete Coursera's signup, and land on
   their program landing page.
4. Come back to `/dashboard/training` and click "Enroll in this course"
   again. This time `listUsersByEmail` returns the new account and the
   route falls through to membership / enrollment.

The UI surfaces step 2 as a modal: "Check your email — we sent a Coursera
invite. After accepting, click Enroll again to start the course."

## Idempotency

- A second click before the user accepts the invite re-issues the invite.
  Coursera dedupes server-side, so this is safe.
- A second click after enrollment hits the
  `enrollUserInCourse → 400 ALREADY_ENROLLED` path, which the state
  machine folds into `status: 'already-enrolled'` (200) so the UI doesn't
  surface an error.
- A 4xx other than ALREADY_ENROLLED / ALREADY_MEMBER (e.g. 403 from
  Coursera, malformed body) is propagated as a 502 with the audit trail
  of whichever steps did succeed.

## Enrollment versus progress refresh

The response keeps the provider `status` separate from `sync.status`. New enrollments return `requested` when Next.js `after` registers the existing background refresh, or `failed_to_start` if registration fails. Invitations and already-enrolled responses return `not_requested`.

`requested` does **not** mean progress is synchronized or that a durable job exists. The shared sync can finish with partial results, and later failures cannot change an already-returned response. The UI immediately offers the existing course launch link after recognized enrollment acceptance without changing completion percentages; unknown HTTP-200 responses never show success.

Background rejection, mapping lookup failure, and audit failure produce fixed-stage diagnostics without raw provider details. Reporting failures cannot overturn accepted enrollment. Durable sync history and live provider acceptance remain separate checks.

## Launching an existing course

`GET /api/member/coursera/launch` remains read-only. It resolves the member's
assigned program and pinned curriculum, then checks evidence for the selected
provider course. Existing provider progress, successful tenant-qualified course
enrollment receipts, processed xAPI activity for an exact linked identity, or a
read of the selected B4B program can establish continuation. Manual completion,
staff approval, invitations and membership-only events do not establish course
access. A recorded provider removal supersedes older evidence. Missing or
unavailable evidence does not create a seat.

Without course-access evidence, the launch redirects to
`/dashboard/program/coursera-enrollment`, which uses the existing course-list
enrollment action and invitation feedback. Only an explicit POST can invite or
enroll. The POST accepts an optional `programSlug` for a secondary assignment;
the server validates that assignment and its stored curriculum. Legacy-only
members retain the primary-program fallback. Revoked approval still blocks new
enrollment while learners with established course access can continue.

## Audit logging

Every B4B write writes a row to the existing `audit_logs` table (see
`prisma/schema.prisma` `model AuditLog`) via `lib/audit.ts`. We did not
invent a new table — the same place that records WIOA reviews, role
changes, and admin impersonation already covers the seat-spend trail.

Per call, expect up to three rows:

| `action`                          | `target_type` | `target_id`        | `metadata` excerpt                                  |
|-----------------------------------|---------------|--------------------|-----------------------------------------------------|
| `coursera_invited`                | `User`        | actor user id      | `{ step: 'invite', programId, contentId, b4bStatus }` |
| `coursera_membership_created`     | `User`        | actor user id      | `{ step: 'membership', programId, contentId, b4bStatus }` |
| `coursera_course_enrolled`        | `User`        | actor user id      | `{ step: 'enroll', programId, contentId, b4bStatus, alreadyEnrolled? }` |
| `coursera_enrollment_approved`    | `User`        | subject member id  | `{ source: 'admin_toggle' \| 'program_change_request_approved' }` |
| `coursera_enrollment_revoked`     | `User`        | subject member id  | `{ source: 'admin_toggle', approved: false }`       |

For self-service enroll the actor and the subject are the same user. A
future admin-impersonation enroll path would record the admin as actor
and the member as subject.

## How to revoke approval

Admin flips the toggle off → the member's "Enroll" button locks again →
they can no longer self-enroll in NEW courses on this server.

**However:** revoking the flag does NOT unenroll the member from any
courses they've already started on Coursera. Coursera does not auto-
unenroll, and doing so manually would forfeit progress / certificates.
If a learner needs to be removed from a program entirely, an admin
should call the B4B `programEnrollments` endpoint with
`action: 'UNENROLL'` directly (no UI for this today — it's an admin
console / runbook operation only).

## File map

| Concern                            | File                                                                                       |
|------------------------------------|--------------------------------------------------------------------------------------------|
| DB column                          | `prisma/schema.prisma` (User.courseraEnrollmentApproved)                                   |
| Migration                          | `prisma/migrations/20260509120000_add_user_coursera_enrollment_approved/migration.sql`     |
| B4B client write methods           | `lib/coursera/b4bClient.ts` (`inviteUserToProgram`, `createProgramMembership`, `enrollUserInCourse`) |
| State machine                      | `lib/coursera/enrollState.ts` + `lib/coursera/enrollState.test.ts`                          |
| Member-facing route                | `app/api/member/coursera/enroll-in-course/route.ts`                                        |
| Member-facing UI                   | `components/portal/TrainingCourseList.tsx`                                                  |
| Read-only launch access check      | `lib/coursera/memberCourseAccess.ts`                                                       |
| Explicit launch-to-enrollment handoff | `app/(portal)/dashboard/program/coursera-enrollment/page.tsx`                             |
| Admin toggle (UI)                  | `components/admin/MemberCourseraEnrollmentApproval.tsx`                                     |
| Admin toggle (API)                 | `app/api/admin/members/[id]/coursera-enrollment-approval/route.ts`                          |
| Counselor auto-approve hook        | `app/api/admin/program-change-requests/[id]/route.ts`                                       |

## Test plan

1. Unapproved member → `/dashboard/training` shows the locked card. POSTing
   directly to `/api/member/coursera/enroll-in-course` returns 403
   `NOT_APPROVED` (the SSR check is a hint, not a security boundary).
2. Approved member with no Coursera account → first click triggers the
   invite path, modal opens; second click after accepting walks through
   to `enrolled`.
3. Approved member already in roster but not in program → membership +
   enroll happen in one click.
4. Double-click of the Enroll button → second click resolves as
   `already-enrolled` (200) without throwing.
5. Admin revokes approval → Enroll button disappears from the member's
   training page on next refresh; existing Coursera enrollments persist.
