# Health probes — liveness vs readiness

**Audience:** on-call, uptime monitors, Vercel alert routing.  
**Why this exists:** `/api/health` stayed HTTP 200 during the 2026-06-18 portal 504s (`docs/POSTMORTEM-2026-06-18-PORTAL-OUTAGE.md`). Treating liveness as “the site works” hid the outage.

| Probe | Path | Cost | Meaning | HTTP |
|---|---|---|---|---|
| **Liveness** | `GET /api/health` | No Prisma / Redis / S3 | Next isolate is up | 200 if the process handles the request (429 if rate-limited) |
| **Readiness** | `GET /api/health/ready` | One Prisma `$transaction` → default org `findUnique` (`slug=workforceap`) | Pages can resolve the org that `app/layout.tsx` needs on every request. Also reports `rateLimiter: redis \| fail-open \| fail-closed` (the security-limiter posture, WAP-13 / TODO-088) under the same key in `checks` | 200 if org row is reachable; **503** if Prisma is down or the org is missing. `rateLimiter` never changes the status here |
| **Journey smoke** | `GET /api/cron/smoke-test` | Seven parallel HTTP probes; cron-authenticated | Liveness/readiness JSON (readiness must also report `rateLimiter: "redis"`), login/program page markers, and the `/dashboard`, `/admin`, `/counselor` login redirect contracts | 200 when every probe is healthy; **503** plus a sanitized Sentry exception when any probe fails, exceeds 8 seconds, or production rate limiting is not on Redis |
| SLO snapshot | `GET /api/health/slo` | Admin-only | Internal SLO numbers | Auth-gated |

## Liveness payload

`GET /api/health` returns `{ status, probe, version, supabaseRef, timestamp, note }`. `version` is the first seven characters of the deployed commit (`local` outside Vercel); `supabaseRef` is the project ref behind the public Supabase URL (`esbdrgaonplpvzmtrdhw` on Preview, `jqddnyuszufndwwezdwp` on Production — `docs/STAGING_ENV.md`). Neither field costs a dependency call. The trusted portal audit's health gate (`scripts/portal-audit-health-gate.mjs`) reads both to refuse a target that serves the wrong commit or the wrong database before it signs in.

## What to alert on

- **Process down / deploy crash-loop:** `/api/health` ≠ 200.
- **Public pages 500 / org or DB unreachable:** `/api/health/ready` ≠ 200. This is the probe for “the marketing site and portal layout cannot talk to Prisma/org.”
- **Portal 504 / `maxDuration` timeouts:** ready can still be green (DB up, render path too heavy). Alert on Vercel **runtime timeouts** for `/dashboard`, `/admin`, `/counselor` — not only health 200. Ready would **not** have gone red on 2026-06-18; the database was healthy.
- **Broken public journey or auth boundary:** alert on a non-200 `cron_smoke_test` run or its `Production smoke failed` Sentry issue. The cron validates response content and final login targets, not just status codes.

Do **not** add the org query back onto `/api/health`. That checkout hits the transaction pooler (`:6543`, `connection_limit=1`) on every public uptime tick.

The hourly journey smoke intentionally does not log in or carry a learner cookie. It proves the public surface and protected-route boundary without touching member data. It does **not** replace authenticated browser burn-in or Vercel timeout alerts for real portal renders.

## Preview smoke (WAP-202)

`.github/workflows/preview-smoke.yml` runs the same journey probes against every **Vercel Preview** deployment and reports the result on the deployed commit. It is not a required check, so it blocks nothing yet. Vercel posts a GitHub `deployment_status`; when it is `success` for environment `Preview` (created by `vercel[bot]`), the job checks out the deployed commit and runs `node scripts/preview-smoke.mjs` against the deployment URL.

| Property | Value |
|---|---|
| Trigger | `deployment_status` (state `success`, environment `Preview`). Previews exist only for the branches `vercel.json`'s `ignoreCommand` allows: `preview`, `claude/*`, `codex/*`, `feature/portal-*`, `feature/astro-*` |
| Probes | The `PROBES` array of `app/api/cron/smoke-test/route.ts`, read from the route source so production and preview check the same routes (the parser fails closed if the array changes shape), plus `/en` (200 and a branded `<title>`) and `/en/program-comparison` (200) |
| Fails on | Any 5xx on any redirect hop; a non-200 public page or health probe; health JSON without `status: "ok"`; a missing page marker or site title; Next's error shell (`<html id="__next_error__">` or "Application error"); a protected route that does not redirect (3xx) to `/login?redirectTo=<path>`; `/api/health` `version` not matching the deployed commit. Network errors and 502/503/504 are retried twice, 5 s apart, for cold starts |
| Not failed on | Latency, and `rateLimiter` not being `redis` (previews may run without Upstash; the value is reported). A preview wired to the production Supabase project is reported as a warning |
| Result | Commit status **Preview smoke** on the deployed commit, linking to the run; the run summary has a per-probe table and `preview-smoke.json` is uploaded. The script doesn't print the deployment URL, but the step log shows the step's environment, which includes it; preview URLs are not secret |
| Required? | No. Make it a required check only after a week of stable green runs |
| Secrets | Optional `VERCEL_AUTOMATION_BYPASS_SECRET`, only if Vercel Deployment Protection is on for previews (Vercel → Project → Settings → Deployment Protection → *Protection Bypass for Automation*). It is sent as `x-vercel-protection-bypass`, and only to `*.vercel.app` origins. Without it, a protected preview is not probed: the script prints a `::notice::` and the run posts an **error** status saying the secret is missing (WAP-222). A secret Vercel rejects fails the run |

Run it by hand against any origin (for example a local `next start`):

```bash
PREVIEW_SMOKE_BASE_URL=http://localhost:3000 node scripts/preview-smoke.mjs
```

Exit codes: `0` pass, `1` a probe failed, `2` configuration error (bad URL, unreadable probe list), `3` not probed because Vercel protection answered and no bypass secret is set (the workflow turns this into an `error` status, not a silent skip).

## Example

```bash
# Liveness — cheap
curl -sS -o /tmp/live.json -w "%{http_code}\n" https://www.workforceap.org/api/health
# Readiness — page this for dependency / 500-adjacent alerts
curl -sS -o /tmp/ready.json -w "%{http_code}\n" https://www.workforceap.org/api/health/ready
# Journey smoke — must use the production cron secret; never paste it into logs/docs
curl -sS -o /tmp/smoke.json -w "%{http_code}\n" \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://www.workforceap.org/api/cron/smoke-test
```

`GET /api/health?deep=true` is **not** a dependency probe anymore. Use `/api/health/ready`.
