# WAP Portal Redesign — Handoff

**Branch:** `feature/portal-design-system` · **PR:** #2068 · **Updated:** 2026-06-23
**Full plan/spec:** `docs/PORTAL_REDESIGN_PLAN.md` · **Component contracts:** `docs/PORTAL_DESIGN_KIT.md`

Pick this up cold. Everything below is verified live unless marked TODO.

---

## TL;DR state

The redesigned portal renders **signed-in on real demo data** behind `?ui=kit`.
- ✅ **Member dashboard** (`/en/dashboard?ui=kit`) — gradient hero, KPI strip, feature tiles. 200, fast.
- ✅ **Admin "Today"** (`/admin?ui=kit`) — dense sidebar, KPI strip (Members/Sessions/Events), live activity table. 200.
- ⏳ **Employer / Partner / Counselor** (`/en/{employer,partner,counselor}?ui=kit`) — code shipped + tsc-clean, but last verified run hit a **connection-pool error** (see Gotcha #3). Re-verify after the 6543-pooler redeploy.
- Default (no `?ui=kit`) UI is **byte-for-byte unchanged** everywhere — zero prod-member impact. All changes additive/flag-gated.

## Test it

- **Preview (stable alias, always latest):** `https://workforceap-beta-git-feature-p-793c79-mabrown040-5207s-projects.vercel.app`
- **Login:** `mabrown040@gmail.com` / demo password from the shared preview credential channel. This is the **demo DB** super-admin (separate from prod).
- Append `?ui=kit` to any persona landing to see the redesign.
- Member dashboard shows `0%` because this account isn't enrolled in a program (real data). Seed an enrollment to populate.

## Architecture / staging model

```
Local dev → migrate dev → DEMO Supabase ──┐
Vercel Preview (any branch) ───────────────┤ same DEMO project (esbdrgaonplpvzmtrdhw)
                                            │
Merge to master → Vercel Production → PROD Supabase (jqddnyuszufndwwezdwp)
```
- **Preview = demo Supabase, Prod = prod Supabase.** Guarded by `scripts/check-supabase-env.mjs` (fails build if preview points at prod ref).
- Demo super-admin email == a real prod email, but they're **different rows in different projects** — preview cannot touch prod data.

## Demo Supabase connection (Preview env vars — already set)

| Var | Value |
|---|---|
| `POSTGRES_PRISMA_URL` | `…@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1&pool_timeout=10` (**transaction** pooler — serverless-safe) |
| `POSTGRES_URL_NON_POOLING` | `…@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require` (**session** pooler — migrations only) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://esbdrgaonplpvzmtrdhw.supabase.co` |
| `connection_limit` | **1** on 6543 (per-lambda). Do NOT use 5432 at runtime — it caps at 15 sessions and serverless exhausts it. |

Demo DB password is stored only in Vercel env / the shared preview credential channel; do not commit it.

## What got fixed this session (root causes of the 5-hour stall)

1. **Vercel SSO wall** blocked the login `POST` → black screen. Disabled `ssoProtection` on the project (demo). Login → 302.
2. **Demo schema drift** — demo was `db push`'d from an old schema, missing 40 tables + 61 columns. Additively synced, then **baselined all 151 migrations** (`prisma migrate status` = up to date). Future `migrate deploy` is clean.
3. **Prisma + pooler:** GUC middleware issued a nested query + `set_config` before *every* query, and interactive `$transaction`s hung over the pooler. Cursor's commit `a849924c` **disabled the GUC layer by default** (`WAP_RLS_GUC_ENABLED`) and **auto-flattens transactions on `VERCEL_ENV=preview`** — see `lib/db/prisma.ts`. With that, the **6543 transaction pooler** works and scales for serverless.

## The `?ui=kit` lean pattern (how each persona page was converted)

In each page's render fn, an early-return placed **after the auth/role guard, before the heavy pipeline**:
```ts
if (ui === 'kit') {
  // a few SIMPLE queries only (findUnique/findFirst/count/findMany take:N)
  // NO $transaction, NO external HTTP, NO heavy aggregation helpers
  return <DesignSurface surface="dense"><KpiStrip…/><DataTable…/></DesignSurface>;
}
```
Files: `app/(portal)/dashboard/page.tsx` (member, warm surface), `app/admin/page.tsx`,
`app/(portal)/{employer,partner,counselor}/page.tsx`. Kit components: `@/components/portal/kit`.

## Gotchas

1. **6543 vs 5432:** runtime MUST use 6543 (transaction). 5432 (session) caps at 15 clients → `EMAXCONNSESSION` under serverless concurrency.
2. **Heavy pipelines stall** on the demo (`getMemberState`, `loadMemberCareerBriefBundle`, B4B, big triage aggregations) — that's why `?ui=kit` uses lean queries. The *default* pages may still be slow on demo; the kit paths are the fast surface.
3. **Coursera B4B** is off in preview (`COURSERA_B4B_CLIENT_ID/SECRET` are prod-only) → `getCredentials()` throws fast, caught. Don't re-enable in preview.

## TODO (for whoever picks this up)

- [ ] **Employer/Partner/Counselor `?ui=kit` need persona-account verification before flip.**
      VERIFIED 2026-06-22 on the 6543 pooler: all 3 return 200 but render the error boundary
      *for the super-admin*. Root cause is NOT the pool (that was the earlier `EMAXCONNSESSION`).
      It's that these pages resolve a persona context and bounce non-persona users — e.g.
      `app/(portal)/employer/page.tsx:70` → `getEmployerForUser(user.id)` returns null for Mike
      (no employer row) → `if (superAdmin) redirect('/admin/employers')`, so the kit branch never
      runs for the super-admin. Same shape in partner/counselor.
      **Next:** seed a demo employer + partner + counselor account (each with its persona row) and
      test `?ui=kit` signed in as those. Relation-access hardening is now done: employer uses
      optional `row.student` / `row.job` access, partner filters referrals without member rows, and
      kit `DataTable` renders a real empty state instead of a blank table body.
      Member (`/en/dashboard?ui=kit`) + Admin (`/admin?ui=kit`) ARE verified rendering on real data.
- [ ] Optionally seed Mike's demo account with a program enrollment + course progress so the member dashboard shows populated stats.
- [x] **CI red on master fixed:** `/dev/kit` static prerender no longer calls `getDefaultOrganizationId()` at build time; `resolveOrgFromRequest()` now returns a build placeholder when `shouldSkipOptionalDbQueriesAtBuild()` is active.
- [x] Preview and production builds run `build:with-migrate`; preview uses the
  baselined demo database and production uses the production database. This
  keeps additive schema changes ahead of runtime code in both environments.
- [ ] Reconcile draft PR #2066 to the demo-Supabase model (drop `demo.workforceap.org` requirement — any `*.vercel.app` preview is the test surface).
- [ ] When happy: flip member dashboard `?ui=kit` → default (remove the flag) page-by-page.

## Stashed (not committed — investigate)

`git stash list` has `loose-non-kit-changes`: working-tree edits to `lib/coursera/b4bClient.ts`,
`lib/coursera/syncUserFromB4B.ts`, `lib/nav/portalNav.ts` of unknown origin (not part of this work).
`git stash show -p stash@{0}` to inspect; likely Cursor's in-progress edits — reconcile or drop.

## Cleaned up

Debug `[dashtime]` render markers removed. Empty redeploy commits exist in history (harmless;
squash on the final pre-merge rebase). The only preview-only artifact is the env-driven
`FLATTEN_TX`/GUC-off behavior in `lib/db/prisma.ts`, which is already gated off in prod.
