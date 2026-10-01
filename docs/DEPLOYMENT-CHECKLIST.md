# WorkforceAP Production Deployment Checklist

**Repo:** `workforceap-beta` | **Branch:** `master` | **Last Updated:** 2026-09-23

Use this checklist for every production deploy. Do not skip steps.

---

## Pre-Deploy (Local)

- [ ] **Pull latest master**
  ```bash
  git pull origin master
  ```

- [ ] **Install dependencies**
  ```bash
  corepack pnpm@10 install --frozen-lockfile
  ```

- [ ] **Build the marketing package and stage its output**
  ```bash
  npm --prefix marketing ci --no-audit --no-fund
  npm --prefix marketing run build
  node -e "require('./scripts/vercel-build.cjs').copyMarketingBuild(process.cwd())"
  ```
  > Required CI runs the same locked marketing install, Astro build, and output copy as Vercel before the Next.js build. Keep generated `marketing/dist` and copied public assets out of commits. This check does not run deployment migrations or preview database provisioning.

- [ ] **Run TypeScript check**
  ```bash
  npx tsc --noEmit
  ```
  > Must pass zero errors. Do not deploy with type errors.

- [ ] **Run tests**
  ```bash
  npm run test:unit
  npm run test:vitest
  ```
  > Runs the Node.js unit lane and the Vitest component/API lane. Fix failures before deploy.

- [ ] **Verify PDF parser packaging after a fresh build**
  ```bash
  npm run build:local
  node scripts/verify-pdf-deployment.mjs
  ```
  > CI also runs this after its production build. It extracts a synthetic PDF using only the PDF assets listed in six emitted route traces, outside the checkout. This catches a missing dynamic worker; it does not replace authenticated upload, saved-text, or live coach acceptance.

- [ ] **Run E2E tests (if changed areas covered)**
  ```bash
  npx playwright test
  ```

- [ ] **Review pending migrations**
  ```bash
  node scripts/prisma-env.js prisma migrate status
  ```
  > Complete [database preflight](DATABASE-RECOVERY.md#preflight-for-an-existing-database) against the intended existing database. Inspect the current pending SQL and target state; the May inventory in `MIGRATION-RUNBOOK.md` is historical. Clean replay is unsupported: both a duplicate table migration and a later dependency-order failure were reproduced. Preserve historical SQL/checksums.

- [ ] **Check environment variables**
  - [ ] `CRON_SECRET` is set in Vercel (Production)
  - [ ] `PLACEMENT_SURVEY_TOKEN_SECRET` is set
  - [ ] `AUTH_TRUST_COOKIE_SECRET` is set
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` is set
  - [ ] `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` are set
  - [ ] All AI provider keys required for feature flags are set
  > Full reference: `docs/ENVIRONMENT-VARIABLES.md` and `.env.example`

- [ ] **Check Sentry for unresolved errors**
  - Open Sentry dashboard → Issues → filter `is:unresolved`
  - If new errors appeared since last deploy, assess before shipping

- [ ] **Check database connection pool**
  - Supabase Dashboard → Database → Connection Pooling
  - Confirm pool size adequate for migration + traffic spike

- [ ] **Verify no uncommitted changes**
  ```bash
  git status
  ```

---

## Merging a PR (merge queue)

Several agents ship PRs in parallel, so two PRs that are each green can still break `master` together. With the merge queue on (WAP-201), a PR lands only after CI passes on a temporary commit of that PR on top of the latest `master` plus every PR queued ahead of it.

- **Nobody merges directly or pushes to `master`.** When a PR is approved and ready, enable auto-merge with squash instead of clicking Merge: `gh pr merge <number> --auto --squash`, or the GitHub MCP `enable_pr_auto_merge` with merge method `SQUASH`. GitHub queues the PR once its required checks pass on the PR, reruns the required checks on the queue commit (`merge_group` event) and merges it only if they are green.
- **Squash only.** The `master` ruleset enforces linear history, so the queue must use squash (or rebase) merges, never merge commits.
- **A red queue run removes the PR from the queue.** The PR itself is untouched. Rebase on `master` or fix the clash, push, and enable auto-merge again.
- **Workflows that report a required check must also trigger on `merge_group`**, or the queue waits for a check that never arrives. `ci-gate.yml` ("Typecheck & Build", "Database contract (PostgreSQL 16)"), `locked-product-stakes.yml` (passes on the queue commit because it already ran against the PR's files and labels), `coursera-catalog-placeholders.yml` and `knowledge-base.yml` do. Checks posted by outside apps (Vercel, Supabase) or by `deployment_status` workflows do not run on the queue commit, so don't make them required while the queue is on.
- The queue is a GitHub setting Mike turns on (branch protection or ruleset for `master` → **Require merge queue**, with **Typecheck & Build** as a required check). Until it is on, `--auto --squash` merges as soon as the PR's checks pass, so agents can use it now.

---

## Deploy

- [ ] **Push to production branch**
  ```bash
  git push origin master
  # or via PR through the merge queue (see "Merging a PR" above); Vercel auto-deploys
  ```

- [ ] **Verify the production migration stage**
  - The Vercel build runs `build:with-migrate` after building marketing. Inspect that stage's output; do not start a concurrent manual migration.
  - Stop on a migration failure and follow [database recovery guidance](DATABASE-RECOVERY.md). A placeholder-URL skip does not verify the production schema.

- [ ] **Verify Vercel build succeeds**
  - Vercel Dashboard → Deployments
  - Confirm green checkmark, no build errors

- [ ] **Check health endpoints** (contract: `docs/HEALTH-PROBES.md`)
  ```bash
  curl -sS https://www.workforceap.org/api/health
  curl -sS -o /tmp/ready.json -w "%{http_code}\n" https://www.workforceap.org/api/health/ready
  ```
  - Liveness (`/api/health`): `probe: "live"`, HTTP 200 — process up, **no** Prisma
  - Readiness (`/api/health/ready`): HTTP 200 and `status: "ok"` — Prisma + default org. **Page 504 / dependency alerts here**, not on liveness staying green.

- [ ] **Verify cron secrets are active**
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" \
    https://www.workforceap.org/api/cron/smoke-test
  ```
  > Should return HTTP 200 with `ok: true` and seven passing probes, not merely “not 401.” A failed readiness, public-page marker, timeout, or protected-route redirect returns 503, marks the cron execution failed, and reports a sanitized Sentry exception.

---

## Post-Deploy

- [ ] **Smoke test critical flows**
  - [ ] Homepage loads (public)
  - [ ] Member signup → login → dashboard
  - [ ] Admin login → member list → member detail
  - [ ] Job application submission (member)
  - [ ] Coursera training progress visible (if enrolled)
  - [ ] AI tools (gap analyzer, interview coach) respond
  - [ ] Email send (password reset or contact form)

- [ ] **Check error rates in Sentry**
  - Watch for 5xx spikes in first 15 minutes

- [ ] **Verify cron jobs are running**
  - Vercel Dashboard → Cron Jobs
  - Check last run times for:
    - `smoke-test` (hourly)
    - `deploy-health` (hourly)
    - `coursera-training-sync` (hourly)
    - `at-risk-check` (daily at 06:00 UTC, per `vercel.json`)
  - If `cron_executions` table exists, query:
    ```sql
    SELECT job_name, status, started_at
    FROM cron_executions
    ORDER BY started_at DESC
    LIMIT 20;
    ```

- [ ] **Check database connection limits**
  - Supabase Dashboard → Database → Connections
  - Ensure not near max (default 200 on Supabase)

- [ ] **Verify RLS is not breaking existing flows** (if RLS migration deployed)
  - Only deploy RLS **after** Prisma GUC middleware is live
  - See `docs/MIGRATION-RUNBOOK.md` → `20260513040000_add_rls_policies`

- [ ] **Announce deploy**
  - Post in internal channel: deploy SHA, migrations run, any known risks

---

## Rollback

If deploy fails:

1. **Assess application rollback compatibility**: Inspect which migrations actually applied, even if the build failed later. A Vercel rollback changes the application, not the database. Revert code or select a prior deployment only after checking compatibility with the current schema.
2. **Assess migration reversibility**: Some migrations (enum changes, column drops) cannot be rolled back without data loss. Review a specific forward repair or recovery plan.
3. **Database**: Follow [database recovery guidance](DATABASE-RECOVERY.md). At 2026-09-09 17:35:07 UTC, the provider returned eight completed daily backups, newest `insertedAt` 09:54:37.111 UTC that day, with PITR disabled. No restore was tested; there is no verified 00:00 UTC schedule. Recheck availability, rehearse an isolated restore, and quantify data loss before choosing a production restore.
4. **Verify rollback**: Re-run health check + smoke tests

---

## Related Docs

- `docs/MIGRATION-RUNBOOK.md` — Per-migration details
- `docs/DATABASE-RECOVERY.md` — Current replay limits, migration preflight, and backup/restore evidence
- `docs/ENVIRONMENT-VARIABLES.md` — Full env var reference
- `docs/TROUBLESHOOTING.md` — Common issues
- `docs/INCIDENT-RESPONSE-PLAN.md` — Escalation procedures
