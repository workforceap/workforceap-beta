# Five-role DEMO action and persistence acceptance (WAP-6)

WAP-66 ran a read-only five-role smoke on Preview. This lane adds the missing
step: each role writes something and the write is shown to persist. Every
run uses five throwaway synthetic users on the isolated DEMO Preview and
removes them when it finishes. It never uses or reseeds `member-test` or the
other shared `PREVIEW_E2E_*` accounts.

- Workflow: `.github/workflows/five-role-demo-acceptance.yml`. It can only be
  dispatched manually, from master, and only as a first attempt.
- Fixture CLI: `scripts/five-role-demo-fixture.ts`, with the commands `create`,
  `readback` and `cleanup`.
- Spec: `tests/e2e/five-role-demo-acceptance.spec.ts`.
- Receipt rules and the final verifier: `scripts/lib/five-role-acceptance.mjs`
  and `scripts/verify-five-role-acceptance.mjs`.
- Mocked tests (**not acceptance**): `scripts/five-role-demo-fixture.test.ts`,
  `scripts/five-role-acceptance-receipt.test.ts` and
  `scripts/five-role-demo-acceptance-workflow.test.ts`.

No run has happened yet. Until one passes with all three receipts, WAP-6 is
not proven.

## What a run does

1. The `policy` job fails the run unless it is a first-attempt
   `workflow_dispatch` on `refs/heads/master` of `workforceap/workforceap-beta`.
   Re-runs are refused. To try again, dispatch a new run.
2. The preview mirror is updated, and the job waits for the Vercel Preview
   build of the exact commit.
3. **Gate 0**: the target must not be an exact production hostname.
   **Gate 1**: the target's `/api/health` must report this exact SHA and the
   DEMO Supabase project. No credential is read before both gates pass.
4. `create` runs these checks before it builds any client:
   - **Gate 2**: `PORTAL_QA_TARGET=demo`, and the Supabase and database URLs must
     both classify as DEMO (`scripts/lib/portal-qa-guard.cjs`).
   - The organization must be the exact, active, *only* active `portal-qa-*`
     organization.
   - One read-only DEMO key probe (`scripts/lib/demo-service-key-probe.cjs`)
     must return `valid`.

   It then creates five Auth users, `wap6-qa-<run>-1-<role>@example.com`, each
   with a fresh generated password (masked, never printed) and
   `app_metadata.wap6_five_role_fixture: true`. It also creates their database
   users with role rows, a synthetic partner organization
   (`portal-qa-wap6-<run>-1`, all notifications off), the employer row, the
   counselor row, and one counselor assignment to the synthetic member.

   It writes a marker file (emails only) before the first Auth call. It saves
   the state file (exact IDs) both before and after every write, with
   `pending` naming the write in flight, so a lost response still leaves the
   exact email or slug to look up. The step has a 10-minute timeout, so a hang
   ends the step and still lets cleanup run.
5. The SHA and DEMO gate runs again immediately before the spec, because the
   first check can be several minutes old by then. The spec then signs in as
   each user in turn and checks that the session cookie's
   user ID and token `sub` are that user. It then sends each role's single
   write (never retried) and reads the result back through the app:

   | Role | Write (sent once) | App readback |
   |---|---|---|
   | member | `POST /api/member/goals` (`app/api/member/goals/route.ts:77`) | `GET /api/member/goals` (same file, :50) |
   | counselor | `POST /api/counselor/members/:memberId/notes` (`app/api/counselor/members/[memberId]/notes/route.ts:59`) | `GET` same route (:44) |
   | admin | `POST /api/admin/members/:memberId/notes` (`app/api/admin/members/[id]/notes/route.ts:59`) | `GET` same route (:47) |
   | employer | `PATCH /api/employer/onboarding-profile` (`app/api/employer/onboarding-profile/route.ts:16`) | `/employer/jobs/new`, `#company-name` (`components/employer/JobForm.tsx:307`) |
   | partner | `PATCH /api/partner/onboarding-profile` (`app/api/partner/onboarding-profile/route.ts:16`) | `GET /api/partner/dashboard`, `partnerName` (`app/api/partner/dashboard/route.ts:44`) |

   None of these writes sends email or calls a provider. The employer and
   partner rows start as `… (before)`, so the update can be told apart from the
   seed. `POST /api/employer/jobs` was not used because it sends an email.
6. `readback` is read-only. It finds each written row in the DEMO database by
   the ID the acceptance receipt recorded, and checks its owner and value.
7. `cleanup` always runs once `create` has started, and deletes in this order:
   - The notes about the synthetic member or written by the synthetic staff.
     They go first because `CounselorNote` uses SET NULL and would otherwise
     outlive the users.
   - The five Auth users.
   - The five database users. Their role, profile, employer, counselor,
     assignment, partner link, goal and event rows cascade.
   - The partner organization.

   A role the state does not record (its Auth call may have landed with the
   response lost) is looked up by its exact synthetic email. It is removed only
   if it is this run's flagged fixture for that role and organization;
   otherwise cleanup fails closed. The same applies to a partner whose ID was
   never recorded, looked up by its exact per-run slug.

   Each absence is checked by a lookup after its delete, by ID and by email or
   slug. So are the goal, both notes and the employer row the spec reported.
   Nothing is ever matched by pattern. Audit rows are kept on purpose. The
   state, marker and stage files (IDs and synthetic emails only, no passwords)
   are uploaded as an artifact.
8. The one green check, `scripts/verify-five-role-acceptance.mjs`, passes only
   when all three receipts agree on the same run and the same users:
   - **acceptance**: all five roles wrote and the app showed the value;
   - **readback**: every row was found with its owner and value;
   - **cleanup**: every fixture was created and then verified absent, including
     the partner and every record acceptance reported, each by its exact ID.

   The five user IDs and the five record IDs must all be distinct.

   All three receipts are uploaded, and a missing receipt fails the run.

## Needed before the first dispatch (Mike)

Create a GitHub **Environment** named `demo-qa` (Settings → Environments), with
**Required reviewers** set to Mike and deployment branches limited to
`master`. Add these as **environment** secrets, not repository secrets:

| Secret | Value | Check |
|---|---|---|
| `DEMO_QA_SUPABASE_URL` | `https://<DEMO ref>.supabase.co` (canonical, no path) | must classify as DEMO |
| `DEMO_QA_SUPABASE_SERVICE_ROLE_KEY` | DEMO project → Project Settings → API keys → service role / secret key | must pass the read-only probe (`key: valid`) |
| `DEMO_QA_POSTGRES_PRISMA_URL` | DEMO database URL (direct `db.<DEMO ref>.supabase.co`, or the Supabase pooler with the DEMO reference) | must classify as DEMO under `projectForUrl` |
| `DEMO_QA_SITE_URL` (optional) | origin of the DEMO Preview to test | falls back to `PREVIEW_SITE_URL`; either way it must pass gates 0 and 1 |

Create the environment **before** the first dispatch. If it does not exist,
GitHub creates it on the first run with no protection and no secrets. That run
then stops at gate 2 before any write, because the empty URLs do not classify
as DEMO. It fails closed, but it is not the intended setup.

You also need **the exact ID and slug of one active `portal-qa-*` organization
in DEMO**. They are the dispatch inputs, and it must be the only active
`portal-qa-*` organization there.

Why new names: the existing `PREVIEW_POSTGRES_PRISMA_URL` /
`PREVIEW_DATABASE_URL` did not classify as DEMO (Preview DB Secret Check, run
36350190005), and `PREVIEW_SUPABASE_SERVICE_ROLE_KEY` did not pass the DEMO
probe (Preview Service Key Check, runs 36352133125 and 36353773350). This lane
never reads any `PREVIEW_*` database URL or service key. It reads
`PREVIEW_SITE_URL` only as the target fallback, behind gates 0 and 1.

Other prerequisites:

- The DEMO database schema must match `schema.prisma` for the models the
  fixture writes (users, profiles, user roles, partners, partner users,
  employers, counselors, counselor assignments, goals, counselor notes).
- The database role in `DEMO_QA_POSTGRES_PRISMA_URL` must be able to read
  `auth.users` (Supabase's `postgres` role can). Cleanup uses it for its
  read-only exact-email recovery lookup, and fails closed if it cannot.
- Staff MFA must be off on the Preview (`STAFF_MFA_ENFORCEMENT` not `1`).
  Otherwise the admin and counselor writes are refused, and the receipt
  records that.
- Disabling the DEMO Data API for WAP-72 does not affect this lane. It uses
  Prisma, Auth admin and nothing through PostgREST.

## Dispatch

```sh
gh workflow run five-role-demo-acceptance.yml --repo workforceap/workforceap-beta --ref master \
  -f qa_organization_id=<id> -f qa_organization_slug=portal-qa-<…>
```

Approve the `demo-qa` deployment when GitHub asks. Review the three receipts
before any further dispatch.

## Cleanup recovery

If `cleanup` fails, its receipt and log give the run ID and the exact
recorded IDs.

- There is no cleanup-only dispatch mode yet; this is a follow-up. Use the
  uploaded `five-role-demo-fixture-files-<run>` artifact for the exact IDs.
- **Cleanup failed part-way:** dispatching again does *not* re-clean an old
  run, because a new run has new users. In the DEMO project, remove these
  exact IDs, in this order: the notes where `member_id` is the synthetic member
  or `author_id` is the synthetic counselor or admin; the five Auth users; the
  five `users` rows; then the partner with slug `portal-qa-wap6-<run>-1`.
- **No state was recorded** (the error begins "Refusing cleanup"): look up the
  five exact emails `wap6-qa-<run>-1-<role>@example.com`, confirm that
  `app_metadata.wap6_five_role_fixture` is true, and remove those IDs as above.

Never delete by pattern.
