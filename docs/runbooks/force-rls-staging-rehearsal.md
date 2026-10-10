# FORCE RLS Staging Rehearsal Runbook

> **Linked plan:** `PLAN-2026-Q3.md` §0 (lurking-risk standout) + §2.3 P1.
> **Harness:** `scripts/p1/test-force-rls.ts`

---

## Why this exists

PostgreSQL's row-level security has two enforcement modes:

| Mode | Affects |
|---|---|
| `ENABLE ROW LEVEL SECURITY` | Non-superuser, non-owner roles |
| `FORCE ROW LEVEL SECURITY`  | Non-bypassing roles, including the table owner |

Superusers and `BYPASSRLS` roles bypass both modes. Assertions therefore use
a separate non-superuser `NOBYPASSRLS` role with table grants.

An application connection that owns its tables bypasses `ENABLE` unless
`FORCE` applies and the role has neither superuser nor `BYPASSRLS` privileges.
Verify the actual deployment role before promotion: `FORCE` cannot constrain
a superuser or `BYPASSRLS` connection.

For a role subject to RLS, missing transaction-local persona context can
starve reads or reject writes; the visible result depends on the policy and
client error handling. This rehearsal exercises the seeded
persona read/write matrix against shadow policies **before** we flip prod.
It uses a bare `PrismaClient`: `runWithGucContext()` stores async context but
does not install the application client's middleware. The harness therefore
uses `scripts/p1/force-rls-context.ts` to bind all five persona GUCs with
parameterized `set_config(..., true)` on the assertion's transaction connection.
Absent user/org/employer/partner IDs are explicitly set to empty strings.
This proves rehearsal context delivery; it does not prove the production
middleware, route wrappers or preview transaction-flattening path.

---

## When to run

Run this harness **before** any of:

- Flipping `FORCE ROW LEVEL SECURITY` in prod for the first time.
- Adding a new model with PII / cross-tenant data.
- Adding a new admin or counselor endpoint that reads member data.
- Refactoring `lib/auth/server.ts` or `lib/db/prisma.ts`.
- Any migration that adds/drops an RLS policy.

If your PR touches `prisma/migrations/**` or `app/api/**`, treat this
harness as required pre-merge.

---

## Prerequisites

1. **Shadow database.** Provision a disposable Postgres database
   (Supabase branch, local docker, scratch project). It must:
   - Be empty (or fine to wipe).
   - Be reachable from your dev machine.
   - **Not** be on a `*.workforceap.org` host or contain the substring
     `prod` / `production` in its hostname. The harness will refuse to
     run otherwise.
2. **Environment variable.**
   ```bash
   export SHADOW_DATABASE_URL=postgres://user:pw@host:5432/wap_shadow
   ```
3. **Tooling.** `pnpm`, `npx`, and the project's normal dev deps. No
   new packages are required - the harness uses `@prisma/client` and
   an explicit harness-only transaction context helper.

---

## Run command

```bash
pnpm tsx scripts/p1/test-force-rls.ts
```

The harness will:

1. Refuse to run if `SHADOW_DATABASE_URL` looks like prod.
2. Run `prisma db push` against the disposable shadow DB so the schema
   matches the current Prisma datamodel, then apply the RLS policy
   migrations required for this rehearsal. This intentionally avoids
   replaying the full historical migration chain, which contains early
   sprint migrations that are not cleanly replayable from empty.
3. Seed 5 personas across 2 orgs (idempotent — safe to rerun).
4. Toggle `FORCE ROW LEVEL SECURITY` on these **25 high-stakes tables**:
   - `job_posting_applications`
   - `job_applications`
   - `users`
   - `profiles`
   - `jobs`
   - `partner_users`
   - `partner_referrals`
   - `member_next_best_actions`
   - `invitations`
   - `employers`
   - `goals`
   - `messages`
   - `message_threads`
   - `counselor_notes`
   - `counselor_assignments`
   - `course_enrollments`
   - `courses`
   - `organization_program_catalog`
   - `referral_codes`
   - `referral_conversions`
   - `milestone_cascades`
   - `xapi_statements`
   - `partner_outreach_logs`
   - `points_transactions`
   - `member_points`
5. Run the persona-test matrix (see below).
6. Print a markdown summary to stdout.
7. Clear `FORCE` (so the shadow DB is reusable for ad-hoc dev work).
8. Exit with the count of failures (0 = clean).

---

## Persona-test matrix

| Persona | Assertions | Surfaces |
|---|---|---|
| **Admin Org A** | 15 | Org-scoped users, employers, jobs, courses, threads, goals, xAPI; own-org job write and rejected cross-org job write |
| **Counselor Org A** | 3 | Assigned member, excluded Org B member, notes |
| **Member m1** | 7 | Own/other profiles and goals, self-only users, own application write, rejected application to Org B job |
| **Partner Org A** | 4 | Referrals, excluded Org B users, referral codes, outreach logs |
| **Anonymous** | 4 | No users, profiles, jobs or courses |
| **Super Admin** | 2 | Users and employers across orgs |
| **System** | 1 | Milestone cascades |

**Pass threshold:** 100% pass. Any failure blocks the prod flip.

---

## Interpreting output

The harness prints a markdown table. A fully passing run would report:

```
Total: 36  |  Passed: 36  |  Failed: 0
```

### Local validation receipt: 2026-10-04

The harness-only transaction-context fix was validated against disposable
local PostgreSQL 16. The full shadow rehearsal completed at
`2026-10-04T19:15:09Z` with **36 assertions: 35 passed, 1 failed**, exit **1**.
The credential-free context suite passed **6/6**, and the native PostgreSQL
context proof passed, including its real raw and generated-model denials.

The remaining failure is **Member m1: cannot INSERT job application for
Org B job**. The insert actually succeeded. `job_applications_insert_own`
checks the member's `user_id` but does not check that the referenced
`curated_job_id` belongs to that member's organization. This is a genuine
policy gap, rather than a context-delivery failure. All other assertions
passed after the explicit transaction-local GUC setup.

The policy correction requires a separate reviewed change; this harness
fix makes no application policy or migration edits and leaves the failing
expectation intact. The **30 consecutive clean full-rehearsal runs** gate
and production FORCE-RLS promotion remain blocked. This local proof does
not count as a ledger pass or reset an existing failure streak.

Each result row is one assertion against one persona under
`FORCE RLS`. A failure means **either**:

- A policy is missing or too restrictive (the assertion that *should*
  succeed returned an unexpectedly low count), **or**
- A policy is missing or too permissive (the assertion that *should*
  see zero rows leaked data), **or**
- Context setup, schema, connection or query infrastructure failed.

A rejected write passes only for a canonical PostgreSQL row-security row
rejection: SQLSTATE `42501` with that diagnostic (direct, raw Prisma `P2010`
or wrapped `PostgresError`), or Prisma `P2004` with the canonical diagnostic
in `meta.database_error`. Ordinary GRANT denials, missing tables/columns,
unique constraints, timeouts and arbitrary exceptions fail. Context setup
errors cannot count as a successful denied mutation.

Known application policy gaps remain failing expectations. In particular,
`job_applications_insert_own` does not verify that `curated_job_id` belongs
to the member's organization. Do not weaken the cross-org application
assertion to make this harness green. Empty fixture counts and xAPI assertions
against nonexistent IDs do not establish complete policy coverage.

## Focused context checks

Run the credential-free Node suite first:

```bash
node --import tsx --test scripts/p1/force-rls-context.test.ts
```

The suite imports `node:test` and is automatically owned by
`scripts/test-unit.mjs` through its `scripts/**/*.test.ts` discovery. It
matches no real-database skip rule and needs no Vitest manifest entry.
To verify it through the repository runner, use
`node scripts/test-unit.mjs --only scripts/p1/force-rls-context.test.ts`.

The real PostgreSQL proof is separate from the full shadow rehearsal. It
requires PostgreSQL **16**, a **loopback** URL whose database is named
`wap_rls_proof`, and an explicit disposable-target acknowledgment. Create
that empty database on a disposable local cluster using a superuser (or an
RLS-bypassing role with permission to create roles):

```bash
createdb -h 127.0.0.1 -p 5432 -U postgres wap_rls_proof
export SHADOW_DATABASE_URL=postgresql://postgres:local-test-password@127.0.0.1:5432/wap_rls_proof
export FORCE_RLS_PROOF_ACK=disposable-local-postgres16
pnpm tsx scripts/p1/force-rls-context-proof.ts
```

Adapt the local port/user/password to that disposable cluster. The proof
does not apply the app schema or any migration. It creates a random fixture
schema and a `NOSUPERUSER NOBYPASSRLS` role, applies fixture-only policies,
and removes both in `finally`. With `connection_limit=1`, it checks backend
PID reuse, all five GUCs across multiple statements, A/B/anonymous switching,
absent employer/partner clearing, bound quote-bearing values, and session
baseline restoration after both commit and rollback. A deliberately stale
session baseline must be overridden inside each transaction; `SET LOCAL`
restores that baseline afterwards rather than erasing it.

The proof permits own-persona reads/writes, verifies actual cross-org and
other-user write denials through raw SQL and a generated Prisma model,
checks denied/rolled-back rows using the privileged fixture observer, and
rejects real missing-table, GRANT and unique-constraint failures as denial
evidence. A green context proof does not clear application policy gaps or
extend the full-rehearsal ledger streak.

---

## What to do if a test fails

### 1. Read the failure message

The summary table prints the expected vs. actual count. Start there.

### 2. Determine which policy is at fault

For a read-leak failure (e.g. *Admin Org A can see Org B members*):

```sql
-- Connect to the shadow DB as the application user, then:
BEGIN;
SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-0000000000a1', true),
       set_config('app.current_org_id', '00000000-0000-0000-0000-00000000aaaa', true),
       set_config('app.current_role', 'admin', true),
       set_config('app.current_employer_id', '', true),
       set_config('app.current_partner_id', '', true);

EXPLAIN (ANALYZE, VERBOSE)
SELECT * FROM users WHERE organization_id = '00000000-0000-0000-0000-00000000bbbb';
ROLLBACK;
```

The `EXPLAIN VERBOSE` output shows which RLS policies were applied.
Look for `Filter: (...rls_policy_name...)` lines.

For a starvation failure (the assertion saw fewer rows than expected),
also dump the policy definitions:

```sql
SELECT polname, polcmd, polqual
FROM pg_policy
WHERE polrelid = 'users'::regclass;
```

### 3. Check whether the route is wrapped in `$transaction`

`lib/db/prisma.ts` only guarantees GUC visibility **inside**
`prisma.$transaction(...)`. A single-statement query may land on a
different pooled connection from the `SET LOCAL` and effectively run
as anonymous.

```bash
# Find candidate routes
rg "prisma\\.(user|profile|partnerReferral)\\.(findMany|count|findFirst)" app/api
```

Wrap the read in a transaction:

```ts
const rows = await prisma.$transaction(async (tx) => {
  return tx.user.findMany({ where: { organizationId: ctx.orgId } });
});
```

### 4. Check the GUC wrapper

Confirm the route is wrapped in `withApiGuc()` (or, for server actions,
`withAuthGuc()`). Search for the route handler and make sure the
exported `GET`/`POST` is wrapped, not just the inner helper.

---

## Promotion to prod

After the harness reports `Failed: 0` against the shadow DB **and** the
same PR's CI smoke (see below) passes:

### Flip statement

Open a maintenance-window PR that applies the following migration:

```sql
-- 20260520000000_force_rls_phase_1.sql
ALTER TABLE job_posting_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE job_applications         FORCE ROW LEVEL SECURITY;
ALTER TABLE users                    FORCE ROW LEVEL SECURITY;
ALTER TABLE profiles                 FORCE ROW LEVEL SECURITY;
ALTER TABLE jobs                     FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_users            FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_referrals        FORCE ROW LEVEL SECURITY;
ALTER TABLE member_next_best_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations              FORCE ROW LEVEL SECURITY;
ALTER TABLE employers                FORCE ROW LEVEL SECURITY;
```

Stage during a low-traffic window. Have a tail of Sentry + the runtime
logs (`mcp__supabase__get_logs`) ready.

### 30-second rollback plan

If error rates spike or any portal returns 500s referencing
`new row violates row-level security policy` or
`permission denied for table`, execute:

```sql
ALTER TABLE job_posting_applications NO FORCE ROW LEVEL SECURITY;
ALTER TABLE job_applications         NO FORCE ROW LEVEL SECURITY;
ALTER TABLE users                    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE profiles                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE jobs                     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_users            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_referrals        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE member_next_best_actions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations              NO FORCE ROW LEVEL SECURITY;
ALTER TABLE employers                NO FORCE ROW LEVEL SECURITY;
```

`NO FORCE` reverts to the pre-flip behaviour (`ENABLE`-only). The
underlying `ENABLE ROW LEVEL SECURITY` and all policies remain
intact, so non-owner connections continue to be policy-gated.

Keep the rollback SQL in a copy-pasteable scratch buffer **before**
applying the flip. The shell session running the rollback should
already be authenticated against the prod DB.

---

## CI smoke

A GitHub Actions workflow runs this harness **nightly (06:17 UTC) and on
`workflow_dispatch`** (WAP-24, 2026-09-21; before that it was manual-only,
so the streak below could never accumulate):

- `.github/workflows/force-rls-shadow.yml` — spins up a Postgres
  service container, sets `SHADOW_DATABASE_URL` to it, and runs
  `pnpm tsx scripts/p1/test-force-rls.ts`.
- Marked **report-only** (`continue-on-error: true`) until the policy
  coverage gap from RLS-AUDIT-REPORT-2026-05-11.md is closed.
- **Ledger:** every run appends one `pass` / `fail` row to
  `docs/runbooks/force-rls-shadow-ledger.md` on the `force-rls-shadow-ledger`
  branch (master is PR-protected, so the bot cannot commit there). The seed
  of that file on master explains the columns and the streak-counting
  command. An infrastructure failure is recorded as `fail`: a run that
  cannot prove the policies does not extend the streak.

To promote to **required**:

1. Confirm at least 30 consecutive `pass` rows in the ledger (count with
   the command in the ledger file).
2. Flip `continue-on-error: false` on the job and on the harness step, add
   the job to the branch protection required-checks list, and note the
   flip under the ledger table.

---

## See also

- `prisma/migrations/20260513040000_add_rls_policies/migration.sql` —
  the policy migration. Source of truth for which tables have RLS.
- `lib/db/prisma.ts` — GUC + `$transaction` wiring.
- `lib/db/gucContext.ts` — `runWithGucContext`, `RlsRole`,
  `buildGucContext`.
- `docs/GUC-MIDDLEWARE.md` — middleware architecture overview.
- `docs/RLS-AUDIT-REPORT-2026-05-11.md` — known policy gaps.
