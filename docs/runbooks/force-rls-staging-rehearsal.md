# FORCE RLS Staging Rehearsal Runbook

> **Linked plan:** `PLAN-2026-Q3.md` §0 (lurking-risk standout) + §2.3 P1.
> **Harness:** `scripts/p1/test-force-rls.ts`

---

## Why this exists

PostgreSQL's row-level security has two enforcement modes:

| Mode | Affects |
|---|---|
| `ENABLE ROW LEVEL SECURITY` | Non-superuser, non-owner roles |
| `FORCE ROW LEVEL SECURITY`  | Everyone, including the table owner |

WorkforceAP's app connection runs as the table owner (the Supabase
`postgres` role on managed projects). Until we flip `FORCE`, the
policies in migration `20260513040000_add_rls_policies` are effectively
**advisory** for the app — every query the app makes bypasses RLS.

Once we flip `FORCE`, a single missing GUC context (i.e. a route that
forgets to call `withApiGuc()` or `runWithGucContext()`) becomes a
**hard 500**, not a silent over-fetch. This rehearsal harness proves
every authenticated persona's read surface still works **before** we
flip prod.

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
   new packages are required — the harness uses `@prisma/client` and
   the existing GUC middleware.

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
4. Toggle `FORCE ROW LEVEL SECURITY` on these **10 high-stakes tables**:
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
5. Run the persona-test matrix (see below).
6. Print a markdown summary to stdout.
7. Clear `FORCE` (so the shadow DB is reusable for ad-hoc dev work).
8. Exit with the count of failures (0 = clean).

---

## Persona-test matrix

| Persona | Assertion |
|---|---|
| **Admin Org A** | Can read Org A members (≥2) |
| **Admin Org A** | Cannot read Org B members (=0) |
| **Counselor Org A** | Can read assigned member m1 (=1) |
| **Counselor Org A** | Cannot read Org B member m2 (=0) |
| **Member m1** | Can read own profile (=1) |
| **Member m1** | Cannot read m2's profile (=0) |
| **Member m1** | Cannot list users in own org (≤1, only self) |
| **Partner Org A** | Can see own referrals (member m1) (≥1) |
| **Partner Org A** | Cannot see Org B users (=0) |
| **Anonymous** | Cannot read any users (=0) |
| **Anonymous** | Cannot read any profiles (=0) |

**Pass threshold:** 100% pass. Any failure blocks the prod flip.

---

## Interpreting output

The harness prints a markdown table. A typical clean run looks like:

```
Total: 11  |  Passed: 11  |  Failed: 0
```

Each row in the matrix is one assertion against one persona under
`FORCE RLS`. A failure means **either**:

- A policy is missing or too restrictive (the assertion that *should*
  succeed returned an unexpectedly low count), **or**
- A policy is missing or too permissive (the assertion that *should*
  see zero rows leaked data).

---

## What to do if a test fails

### 1. Read the failure message

The summary table prints the expected vs. actual count. Start there.

### 2. Determine which policy is at fault

For a read-leak failure (e.g. *Admin Org A can see Org B members*):

```sql
-- Connect to the shadow DB as the application user, then:
SET LOCAL app.current_user_id = '00000000-0000-0000-0000-0000000000a1';
SET LOCAL app.current_org_id  = '00000000-0000-0000-0000-00000000aaaa';
SET LOCAL app.current_role    = 'admin';

EXPLAIN (ANALYZE, VERBOSE)
SELECT * FROM users WHERE organization_id = '00000000-0000-0000-0000-00000000bbbb';
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
