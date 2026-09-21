# RLS Rollout — Decision & Staged Plan (verified 2026-07-02)

Answering: **"Will turning RLS on break our setup? If not, roll it out."**

**Verdict: do not flip it today.** The switch we have (`WAP_RLS_GUC_ENABLED` +
`FORCE ROW LEVEL SECURITY`) would add real breakage risk to the portal while
adding **zero** enforcement — because of how this Supabase project's roles are
set up (details below). Meanwhile, the attack surface RLS is meant to close is
**already closed and was live-verified today**. Real enforcement is a staged
infra project (below), not an env flip.

## Live production state (project `jqddnyuszufndwwezdwp`, verified 2026-07-02)

| Fact | Value |
| --- | --- |
| Tables in `public` | 100 — **RLS enabled on all 100**, 251 policies |
| `FORCE ROW LEVEL SECURITY` | Only `xapi_statements` |
| Table owner | `postgres` |
| App connection (Supavisor pooler) | connects as `postgres`, which has **`BYPASSRLS = true`** |
| PostgREST (Data API) | running, as `authenticator` → `anon` / `authenticated` (no bypass) |
| App usage of Data API / Realtime | **none** — zero `supabase.from()/rpc()/channel()` call sites; all DB access is Prisma |
| RLS helper functions | `EXECUTE` denied to `anon`/`authenticated` |

### Live probes (count/HEAD only — no row data pulled)

- `SET ROLE anon; SELECT count(*) FROM users` → **error 42501** (`permission
  denied for function get_current_user_id`). Same for `authenticated`. Every
  policy-bearing sensitive table **fails closed** for API roles — an attacker
  with the publishable key gets an error, not rows.
- `SET ROLE anon; SELECT count(*) FROM tokenized_link` (RLS enabled, no
  policies) → **0 rows**. Default-deny holds on all 33 no-policy tables.
- Only anon-permissive policy found: `public_wioa_screenings_insert_public`
  (INSERT-only; intended for the public screening form; the app doesn't even
  use PostgREST, so this is dormant — candidate for removal in stage 0).

**Conclusion: the externally reachable vector (Data API with the public anon
key) leaks nothing today.** Tenant isolation for the app's own queries is
enforced in the app layer (auth wrappers + org scoping + the CI tenant-routes
gate), not by Postgres.

## Why the naive flip is all-risk, no-gain

1. **`BYPASSRLS` makes FORCE a no-op for us.** `FORCE ROW LEVEL SECURITY`
   subjects the *table owner* to policies — but a role with `BYPASSRLS`
   (Supabase's `postgres`, our app's connection role) skips RLS *regardless of
   FORCE*. Flipping FORCE on all 100 tables changes nothing about what the app
   can read. Policies would still only bind `anon`/`authenticated`, which they
   already do.
2. **`WAP_RLS_GUC_ENABLED=true` re-creates a known P0.** The GUC middleware
   issues a `set_config` round-trip per query and leans on interactive
   `$transaction`s; over the 6543 transaction pooler this saturated the pool
   and 504'd the whole portal (see `docs/HANDOFF.md` §3 and the incident notes
   in `lib/db/prisma.ts`). It was disabled *by default* for exactly that
   reason. June 18's outage was also a Prisma-middleware change — this layer
   has bitten twice.
3. **Coverage is not 100%, and enforcement punishes every gap with silent
   empty reads.** Current numbers (2026-07-02): 449 API route files, 390 using
   the `withRequestGuc` wrappers (864 wrapped handlers); **59 routes** don't
   (mostly cron — those get `SYSTEM_GUC_CONTEXT` via `withCronLogging` — but
   also auth/contact/AI/coursera-admin routes that need auditing); ~600
   `$transaction`-wrapped call sites vs **~576 bare `await prisma.*` calls**
   whose transaction-local GUCs cannot survive the pooler; 126 server-component
   pages query Prisma directly. The middleware is deliberately **fail-open**
   (incident #1631: the fail-closed version broke login for ~24h).

## What "really rolling it out" takes (staged)

- **Stage 0 — tighten what's free (safe now):**
  - Drop the dormant `public_wioa_screenings_insert_public` policy (app posts
    via its own API route; the PostgREST INSERT path is an unused spam vector).
  - Optionally disable the Data API entirely in Supabase settings (nothing
    uses it) — strongest version of the same fact. Revisit if supabase-js
    reads are ever introduced.
  - Keep the CI tenant-routes gate + app-layer scoping as the enforced line.
- **Stage 1 — dedicated app role:** create `wap_app` (no `BYPASSRLS`, not
  table owner), grant table privileges + helper-function EXECUTE. Important:
  un-forced RLS already binds every non-owner role — so the moment the app
  connects as `wap_app`, all 251 policies enforce. Stage 1 therefore cannot
  ship alone; it lands *together with* stage 2's coverage work, behind a
  canary (stage 3).
  - **Stage 1 checklist (recorded 2026-09-21, WAP-24; from the Supabase
    performance advisors — do not fix before Stage 1, none of it matters
    while the app connects as the BYPASSRLS `postgres` role):**
    1. Every policy (269 at last count) is bound `TO public`, which is why
       the advisor reports 510 `multiple_permissive_policies` lints: every
       role evaluates every permissive policy on a table. Rebind the
       policies to `wap_app` (and `service_role` where a policy is meant for
       it), and collapse same-command permissive policies on one table into
       a single policy with an `OR` predicate.
    2. 13 policies call `current_setting('app.current_…')` per row. Rewrite
       each predicate as `(select current_setting(...))` so PostgreSQL
       evaluates the GUC once per statement (initPlan) instead of once per
       row; verify with `EXPLAIN` on a P0 table before and after.
    3. Only after 1-2: grant `wap_app` its table privileges + helper-function
       EXECUTE, then proceed to the Stage 2 GUC-coverage measurement with
       the nightly FORCE RLS shadow ledger (`docs/runbooks/force-rls-shadow-ledger.md`)
       at 30 consecutive clean runs.
- **Stage 2 — GUC coverage completion, measured not assumed:** telemetry mode
  first (log every query lacking GUC context in prod for a week — the
  fail-open `console.error` already exists; aggregate in Sentry), burn the
  list to zero: the 59 unwrapped routes, bare-call sites on protected tables,
  server-component pages. Batch GUCs per transaction (the "per-query-batched
  GUC path" called out in `lib/db/prisma.ts`) so the pooler isn't saturated.
- **Stage 3 — canary cutover:** point a single low-traffic surface (e.g. cron
  smoke-test route) at the `wap_app` connection string with
  `WAP_RLS_GUC_ENABLED=true`; run `scripts/p1/test-force-rls.ts` against a
  branch database; then move route groups over gradually (member portal last).
  Pause agent-driven merges during the cutover window; verify with authed
  smoke tests per role (member/counselor/admin/employer/partner).
- **Stage 4 — FORCE + fail-closed:** once zero-gap telemetry holds, flip the
  middleware fail-open to fail-closed and (optionally) FORCE the P0 tables so
  even future owner-connections are bound. Retire this doc into
  `docs/SECURITY-CHECKLIST.md`.

## Bottom line for leadership

- Nothing sensitive is reachable from outside today — verified live, not
  assumed.
- The env flip we *could* do today would not add protection (BYPASSRLS) and
  carries the exact failure mode that has taken the portal down before.
- Real database-level enforcement is a 4-stage project whose first two stages
  are cheap and safe; stages 3–4 need a maintenance window and telemetry-backed
  coverage. Recommend scheduling it as its own workstream, not bundling it
  into a feature PR.
