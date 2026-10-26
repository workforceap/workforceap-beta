# Staging / Preview Environment — Supabase scoping

**Rule: Preview + local must use the DEMO project. Production must use the real project.**
Never let a preview deploy write to the real DB (real member PII + a redesign that
involves destructive testing). Enforced by `scripts/check-supabase-env.mjs`.

| Project | Ref | Used by |
|---|---|---|
| **workforceap-demo** | `esbdrgaonplpvzmtrdhw` | Vercel **Preview** + **Development** (local) |
| **real** | `jqddnyuszufndwwezdwp` | Vercel **Production** only |

## Vercel env vars — which value in which scope

Set each var **per scope** (Vercel → Project → Settings → Environment Variables → pick the scope).
Demo values go on **Preview + Development**. Real values go on **Production** only.

| Variable | Preview + Development (DEMO) | Production (REAL) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://esbdrgaonplpvzmtrdhw.supabase.co` | real project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | demo publishable key (`sb_publishable_…`) | real publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | demo service_role (secret) | real service_role (secret) |
| `POSTGRES_PRISMA_URL` | demo pooled (`:6543?pgbouncer=true`) | real pooled |
| `POSTGRES_URL_NON_POOLING` | demo direct (`:5432`) | real direct |
| `DATABASE_URL` | demo pooled | real pooled |

All connection strings + the service_role key come from the Supabase dashboard
("Connect" button → Prisma tab; Settings → API). Secrets live only in Vercel env
and local `.env.local` (gitignored) — never in git or chat.

### Easiest path — Vercel ↔ Supabase integration
Vercel → Integrations → Supabase. **Attach `workforceap-demo` to the Preview environment**
and the real project to Production. The integration auto-injects `POSTGRES_PRISMA_URL`,
`POSTGRES_URL_NON_POOLING`, and the `SUPABASE_*` vars into the chosen scope — no hand-typing.
Verify after: each scope shows the correct project ref in the var values.

## The guard (make-sure-it-happens)

`scripts/check-supabase-env.mjs` reads `VERCEL_ENV` + the Supabase URLs and **fails the
build (exit 1)** if a scope is wired to the wrong project. On Vercel, the public
URL, the public anon key, the pooled URL, and the non-pooled URL are required;
unrecognized targets fail closed, a missing or truncated `NEXT_PUBLIC_SUPABASE_ANON_KEY`
fails closed, and `CI=1` cannot bypass the check:
- Preview/Development pointing at `jqddnyuszufndwwezdwp` → blocked
- Production pointing at `esbdrgaonplpvzmtrdhw` → blocked
- Production or Preview with no usable anon key → blocked

Wire it into the build so a misconfig can never deploy. In `package.json`, prepend it to
the build (or run in CI before deploy):

```jsonc
// option A — gate every build
"prebuild": "node scripts/check-supabase-env.mjs",
// option B — run in CI / a Vercel "Ignored Build Step" check
```

Run locally any time:
```bash
node scripts/check-supabase-env.mjs
```

## Migration routing

`vercel.json` delegates to `npm run build:vercel`; the checked-in orchestrator
builds/copies the marketing bundle, then chooses exactly one application path.

- Production runs the complete Prisma migration chain through
  `npm run build:with-migrate`.
- Preview normally uses the demo database. While that shared demo project's
  historical migration ledger is repaired, the Vercel preview build executes
  only `20260830123000_versioned_approved_coursera_curricula` before the normal
  application build. This is intentionally narrow; it must not be generalized
  to arbitrary migrations.
- `scripts/apply-preview-approved-curriculum-schema.cjs` repeats the project
  guard, requires `VERCEL_ENV=preview`, uses only the non-pooled demo URL, and
  never accepts production, local, missing, or unknown targets.
- The targeted migration is transactional, takes a migration-specific advisory
  lock, and checks its schema and exact 26-row seed before commit. A second
  post-commit query fails the build if those invariants are not present.

The targeted preview execution intentionally does not mark Prisma's migration
ledger. After the demo ledger is repaired, restore previews to the full
`migrate deploy` path; do not mark old failed migrations applied without first
proving their intended schema.

## Verify preview is actually hitting demo
After the first preview deploy, confirm the running app reports the demo ref:
`GET /api/health` returns `supabaseRef`, which must read `esbdrgaonplpvzmtrdhw` on any
preview and `jqddnyuszufndwwezdwp` only on production. A logged-in dashboard should show
seeded demo data, not real members. If you see real names, **stop** — a scope is
misconfigured; the guard should have caught it.

The authenticated portal smoke enforces the same rule mechanically: its health gate
(`scripts/portal-audit-health-gate.mjs`) refuses to sign in unless the isolated preview
reports the demo ref. The preview it audits is the `preview` branch, a mirror of `master`
maintained by `.github/workflows/mirror-master-to-preview.yml` and allowed through
`vercel.json`'s ignore step so Vercel builds it in the Preview environment.

### Missing nightly Preview deployments

A successful mirror job proves only that `preview` points at the trusted master
SHA. It does not prove that Vercel created a deployment, and a no-op mirror does
not retry a missing build. For example, [nightly run 39273540181](https://github.com/workforceap/workforceap-beta/actions/runs/39273540181)
waited 25 minutes with no Preview deployment for `efc27e4a4`; its health and login
steps never ran. GitHub listed only a Production deployment for that SHA.

The read-only `scripts/portal-preview-deployment-gate.mjs` distinguishes an absent
GitHub deployment record from a registered, still-building one. Vercel may publish
that record only when the build becomes ready, so registration and completion
share one 25-minute window from the start of the wait. Registration does not
restart the clock. `PORTAL_PREVIEW_BUILD_TIMEOUT_MS` can shorten the overall window;
`PORTAL_PREVIEW_REGISTRATION_TIMEOUT_MS` can shorten the registration window within
it (positive integer milliseconds, capped at 25 minutes). API/permission failures
are reported separately. Failed, inactive, cancelled and unknown states never pass.

GitHub records Vercel deployments with `ref` equal to the commit SHA and an empty
payload, so those records do **not** prove the source branch. The waiter requires
the exact SHA, Vercel bot creator, Preview environment and non-production flag;
the existing health gate must still prove the configured destination serves that
SHA and uses DEMO before any login. Neither gate falls back to a newer READY
commit, another branch's URL, or production.

If registration times out, no matching GitHub record was observed within the
window; that does not prove no build exists. An authorized project operator should
inspect that SHA's Vercel build status, Git integration and ignored-build decision
before deciding whether to repair/create the intended `preview` branch Preview
build. Vercel supports
[creating a deployment from a Git reference](https://vercel.com/docs/git);
select the Preview branch configuration when a commit belongs to multiple
branches. This code does not create deployments, change tokens/settings, or
repair the external trigger. A later exact-SHA nightly audit is still required
to establish end-to-end recovery.

### Browser runner compatibility

The authenticated smoke and credential-free Nightly E2E browser jobs use
`ubuntu-24.04`. The frozen lock resolves Playwright 1.59.0, which rejects the
Ubuntu 26.04 image currently selected by `ubuntu-latest` during Chromium
dependency installation. Keep the runner compatible with the locked browser
package; a future runner upgrade requires installation, browser launch and the
actual suites to pass. The pin does not change audit targets or login gates.
