# Attendance sync preview (synthetic-only, no official write)

Status: local/synthetic first build. Not wired to real data. DRAFT, not WFS approved.

## What it is
`lib/attendance/sync-preview.ts` is a pure function that lays dated Coursera POINT signals next to the existing DRAFT calendar for one enrollment.
It imports no database, storage, signing, send or logging code (a test enforces this).

## What it never does
- No P/A, Time In/Out, daily minutes, or zero for unknown days. Unknown days are `Unknown`.
- Activity, completion, portal login, admin-entered: labelled "(not attendance)" / "(unverified)".
- `learningHours` and the Learner Activity Detail roll-up are cumulative estimates, never daily.
  The roll-up has no calendar dates; "days since last activity" is shown as relative text only.
- Output holds source ids and reason codes only: no payload, email, name or account id.

## Identity and scope
Actor org -> enrollment (same org) -> user (not deleted). Identity via `CourseraIdentityMapping` (accountName + homePage, or email) or curated email.
Zero matches = unmatched, several = ambiguous, user not in org = rejected, other user in org = excluded.
The HTTP boundary fails the whole response with `404 ATTENDANCE_ENROLLMENT_NOT_FOUND` when the requested learner's own identity is ambiguous or not in the actor's organization, or when the enrollment/user crosses organizations. Rejected rows for identities that do not include the requested learner remain listed in the preview.
Course must map through `CourseraCurriculumCourseMapping` for the enrollment's program and curriculumVersion.
Dates use America/Chicago.

## Entry points
- `lib/attendance/sync-preview-http.ts`: admin-only handler (401/403/404/400 strict body/405). Real data loader is injected and NOT implemented here.
- `POST /api/dev/attendance-sync-preview`: fixture-only; 404 unless `ATTENDANCE_SYNC_PREVIEW_DEMO=local` and not production.
- `app/api/admin/attendance/draft-pdf/route.ts` is untouched (read-only, evidence blank).

## Verify
```
node --require ./tests/server-only-stub.cjs --import tsx --test lib/attendance/sync-preview.test.ts
```

## Rollback
Delete `app/api/dev/attendance-sync-preview/` and the `lib/attendance/sync-preview*` files. No schema or storage-policy change, so the attendance_server_only policy is untouched.

## Post-release check
1. Synthetic admin preview returns `draft: true`, `wfsApproved: false`, `writes` all 0.
2. Unknown days blank; no P/time-in/out anywhere.
3. Other-org admin gets 404; non-admin 403; endpoint 404 in production.

## Gate
Real data, daily conversion or WFS-approved marks need explicit WFS policy and an independently verified duration/session source.
