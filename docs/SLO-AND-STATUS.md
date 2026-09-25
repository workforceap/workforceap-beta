# SLOs and Status — WorkforceAP

**Audience:** Procurement officers, IT directors, workforce-board diligence, and the on-call engineer at 2am.
**Status:** Sprint D.1 foundation. Numbers are committed; instrumentation is partial.

This document is the single answer to *"what's your uptime story, and how do we know you're meeting it?"*. It defines the platform's service-level objectives (SLOs), how each is measured, what happens when one breaches, and how we communicate status to the outside world.

It is intentionally specific. Vague SLOs ("we aim for high availability") are unauditable; concrete SLOs are.

---

## What is an SLO here?

A **Service-Level Objective (SLO)** is a numeric promise about a measurable service-level indicator (SLI), measured over a rolling window. Each SLO has:

- A **target** (e.g. 99.9%)
- A **window** (e.g. rolling 30 days)
- A **source of truth** (where the metric is computed)
- A **burn-rate alert** policy (when do we get paged)
- An **owner** (who fixes it when it breaches)

SLOs are not aspirational. They are the floor below which we treat the service as *failing the buyer's contract*, regardless of who or what caused the dip.

---

## The committed SLOs

| # | SLO | Target | Window | SLI source |
|---|---|---|---|---|
| 1 | **Overall uptime** — process liveness: `/api/health` returns HTTP 200. **Dependency / org readiness** is `/api/health/ready` (503 if Prisma/org cannot be reached). Portal 504s can still happen while both are green — also alert on Vercel runtime timeouts. See `docs/HEALTH-PROBES.md`. | **99.9%** | rolling 30 days | Vercel + external uptime monitor (Better Uptime / UptimeRobot): liveness every 1 min; **ready** for 504-adjacent / DB-down pages |
| 2 | **Dashboard latency** — server-side render time of `/dashboard` | **p95 < 500 ms** | rolling 7 days | Vercel Analytics + Sentry Performance (`pageload` and `navigation` transactions) |
| 3 | **Outcomes admin latency** — server-side render time of `/admin/outcomes` | **p95 < 500 ms** | rolling 7 days | Vercel Analytics + Sentry Performance |
| 4 | **Email delivery** — % of `Email` rows whose Resend webhook reports `delivered` within 5 min of `queuedAt` | **99% in 5 min** | rolling 7 days | Resend webhooks + `Email` table query |
| 5 | **Cross-tenant isolation** — synthetic check probes Org A admin endpoints with Org B credentials and asserts a 403 every run | **0 leaks** (any breach is sev-1) | per-run | Synthetic monitor (Track A.3 deliverable; this SLO is conditional on that landing) |
| 6 | **Coursera xAPI ingestion** — % of inbound xAPI statements that successfully persist within 60 s | **99.5%** | rolling 7 days | `XapiIngestionLog` table + Sentry exceptions in the xAPI route |

### Why these specific numbers

- **99.9% uptime** is the floor any IT director will require — three nines is ~43 min/month of allowed downtime, achievable on Vercel + Supabase without us building a multi-region active-active setup. Promising 99.99% (~4 min/month) would require infra investment we haven't made; promising 99% (~7 hours/month) is below what enterprise expects.
- **p95 < 500 ms** on the two highest-traffic admin pages is the latency above which staff perceive lag. The dashboard and `/admin/outcomes` are the two pages that show up in every demo and most daily flows; latency anywhere else on the platform is downstream of these.
- **99% email-in-5min** is realistic given Resend's own SLA (~99.99% accept, but inbox-providers add propagation). Promising 100% within 5 min is a lie about email infrastructure we do not control.
- **0 cross-tenant leaks** is the only correctness SLO. Latency or uptime breaches are recoverable; a tenant leak is a sales-killer and a legal incident. There is no "acceptable rate" — the SLO is binary.
- **99.5% xAPI ingestion** acknowledges Coursera's own occasional flakiness. Below 99.5% means our ingestion code is the bottleneck, not Coursera.

### What we explicitly do NOT have an SLO on (yet)

| Area | Why no SLO yet |
|---|---|
| 30/60/90-day **placement retention** | Requires longer dwell + the Track C verification pipeline before we can even measure it. Premature to commit. |
| Member **time-to-first-application** | We don't yet log a clean enough timeline event. Track Q in observability backlog. |
| Partner-API **latency** (Track B) | The endpoints don't exist yet. Will add when B.1 lands. |
| Mobile **Time-to-Interactive** | No real-user-monitoring (RUM) on mobile beyond Vercel Analytics aggregates. Add when we have a separate mobile telemetry source. |

We list these as gaps so a buyer understands what we *can't* tell them, not just what we can.

---

## Where each SLO is measured

```
SLO #1  Uptime               -> Vercel uptime + external monitor on /api/health (live) and /api/health/ready (deps)
SLO #2  /dashboard p95       -> Vercel Analytics (Web Vitals) + Sentry Performance
SLO #3  /admin/outcomes p95  -> Vercel Analytics + Sentry Performance
SLO #4  Email delivery       -> Resend delivery webhooks aggregated against Email table
SLO #5  Cross-tenant leak    -> Synthetic monitor (cron); fail = sev-1 page
SLO #6  Coursera xAPI        -> XapiIngestionLog success/error counts + Sentry
```

Sentry is the **single pane of glass** for latency + errors; Vercel Analytics is the second source for traffic volume; the database (`Email`, `XapiIngestionLog`) is authoritative for delivery counts. The synthetic monitor for SLO #5 is itself a piece of infrastructure that has to exist (Track A.3 deliverable) — until then SLO #5 is *nominally* tracked via per-endpoint authorization tests in CI rather than live runtime probing.

---

## External readiness monitor (GitHub Actions)

**What exists (WAP-164 item 1, 2026-09-21).** `.github/workflows/uptime-ping.yml` runs on GitHub's infrastructure every 15 minutes (`schedule: */15 * * * *`, plus `workflow_dispatch`) and issues one anonymous `GET https://www.workforceap.org/api/health/ready`. The run **fails** when the answer is not HTTP 200 or the whole request takes longer than 5 seconds (`curl --max-time 5`). Nothing else in the repo watches the site from outside: the hourly `smoke-test` cron runs *inside* the deployment it checks, so when the deployment is down the monitor is down with it.

Why this endpoint: `/api/health/ready` is the dependency probe (Prisma can read the default organization row — the same lookup `app/layout.tsx` needs on every request) and answers 503 when that fails. It is public, needs no secret, is rate-limited per IP and reads no member data. Do not point this at `/api/health` (liveness only) or at `/api/cron/smoke-test` (needs `CRON_SECRET`). See `docs/HEALTH-PROBES.md`.

| Property | Value |
|---|---|
| Cadence | every 15 minutes as scheduled, but GitHub throttles schedules in this repository: observed runs have been 2-5 hours apart (see "Nightly heavy suites"), so detection can take hours until a hosted monitor exists |
| Pass | HTTP 200 within 5 s |
| Fail | any other status, a timeout, DNS/TLS failure |
| Alert channel | GitHub's workflow-failure email to the repository owner (default for scheduled runs); the run summary carries status + timing |
| Evidence | Actions run history for "Uptime Ping" — a rough uptime series until a hosted monitor exists |
| Secrets | none |

**What it is not.** It is not burn-rate alerting, not a status page and not paging. The Vercel log drain (WAP-164 item 3) and the production Sentry alert rule (item 4) are operator-console changes, not repository changes, and remain open. When a hosted monitor (Better Uptime or similar) is set up, keep this workflow: two independent observers are cheap, and this one is versioned with the code it checks.

## Nightly heavy suites (WAP-204)

The browser suites are too slow for every PR, so they belong in a nightly lane on GitHub Actions. Neither is a PR check, and neither should become a required one.

**Status: dispatch-only until WAP-66 lands.** Both workflows are nightly-ready but ship without their `schedule:` trigger. The readiness plan (R05) keeps nightly scheduling behind WAP-66, the authenticated fresh preview. Each workflow's `on:` block has a one-line comment giving the cron to add once WAP-66 lands. Until then, the times below are the planned slots, and the failure-issue path (which only fires for scheduled runs) is inert.

| Suite | Workflow | Schedule (UTC) | Target | What runs |
|---|---|---|---|---|
| FORCE RLS rehearsal (existing, WAP-24) | `force-rls-shadow.yml` | 06:17 | disposable Postgres service | `scripts/p1/test-force-rls.ts`, report-only, ledger on `force-rls-shadow-ledger` |
| Authenticated Portal Smoke | `authenticated-portal-smoke.yml` | planned 07:37 (manual dispatch today) | isolated preview (`PREVIEW_SITE_URL`, DEMO Supabase) | The full five-role `pnpm audit:portal`. A scheduled run has no inputs, so it uses the default `isolated_preview` policy |
| Public E2E | `nightly-e2e.yml` | planned 08:47 (manual dispatch with `base_url` today) | production `https://www.workforceap.org` | The credential-free, read-only Playwright specs: `tests/e2e/smoke/**` and `partner-signup-viewports.spec.ts`, stock Playwright Chromium, HTML report uploaded as an artifact |

**Times are approximate.** GitHub delays scheduled workflows under load. In this repository, the `*/15` uptime ping has run 2-5 hours apart, and the 06:17 RLS rehearsal has fired as late as 11:33 and 12:42. The minutes are chosen off `:00` and spaced so the suites do not queue behind each other when they do fire on time. Treat each suite as "about once a night", not a timed SLA.

**Preview freshness for the portal smoke.** Its health gate refuses a target that does not serve master's exact commit. Since #2344 the `preview` mirror is no longer pushed on every merge, so every preview-policy run (dispatch now, scheduled later) first calls `mirror-master-to-preview.yml` (a no-op when `preview` already points at master), then waits up to 25 minutes for Vercel's Preview deployment of that commit. If Vercel reports the Preview build as failed, the run fails at once with Vercel's reason, before any sign-in. So the portal smoke can only go green once the `preview` branch builds in Vercel's Preview environment. `production_canary` dispatches skip the mirror and the wait.

For a controlled hydration comparison, dispatch `isolated_preview` twice on the same master commit with `skip_preview_toolbar` off and on. The opt-in run sets [Vercel's documented](https://vercel.com/docs/vercel-toolbar/managing-toolbar) `x-vercel-skip-toolbar: 1` as a non-secret browser-context header; it may accompany requests to other hosts, while the audit capability remains a browser-managed host cookie. The artifact records `executionPolicy.skipVercelToolbar`. This changes Preview instrumentation only and does not relax the exact-SHA, DEMO, role, or read-only gates. Compare the full matrix and React #418 counts before attributing failures to the toolbar.

**Failure issue.** When a scheduled run fails, `nightly-failure-issue.yml` opens one issue, titled `Nightly: Authenticated Portal Smoke failing` or `Nightly: Public E2E failing`, with the `nightly-failure` label and the run link. While that issue is open, a later failure adds a comment to it rather than opening a new issue. A later green scheduled run comments that it passed and leaves the issue open for a person to close. Manual dispatches never open issues. To route these into Linear, connect the label through the GitHub integration.

**Rerun by hand.** Actions → *Authenticated Portal Smoke* → Run workflow on `master` (choose the policy). For the public specs, use Actions → *Nightly E2E* → Run workflow, or run them locally with `PLAYWRIGHT_BASE_URL=https://www.workforceap.org npx playwright test tests/e2e/smoke tests/e2e/partner-signup-viewports.spec.ts`. Only add a spec to `nightly-e2e.yml` if it is credential-free and creates no data.

---

## Burn-rate alert policy

Burn-rate alerts page when error budget is being consumed faster than the SLO window allows. We use the standard two-window approach (Google SRE chapter 5):

| Severity | Trigger | Channel | Audience |
|---|---|---|---|
| **Fast burn** | 14.4× target burn rate sustained over **1 hour** (consumes 2% of monthly budget in 1h) | PagerDuty / phone | Mike + Dad |
| **Slow burn** | 6× target burn rate sustained over **6 hours** (consumes 5% of monthly budget in 6h) | Email + Slack | Mike |
| **Critical correctness** | Any cross-tenant leak detected by the synthetic check (SLO #5) | PagerDuty + phone | Mike + Dad immediately |
| **Sev-3 informational** | An SLO has consumed 50% of its monthly error budget | Slack only | Mike (review at next standup) |

Why two windows: the fast-burn alert catches outages, the slow-burn alert catches creeping regressions (a memory leak slowly making p95 worse). One without the other misses one or the other.

For SLO #5 there is no "rate" — any single failure is a page.

---

## Status page approach

We have two viable options. **Recommendation: option (b) — self-hosted `/status` route**, with a hosted external uptime monitor (Better Uptime) as the *underlying source* for the uptime number.

### Option (a): Statuspage.io / Better Uptime hosted

- **Pro:** zero engineering, professional appearance, public RSS / email subscriptions, multi-region probing.
- **Pro:** widely recognized brand cue ("oh look, they have a real Statuspage") helps in procurement.
- **Con:** Statuspage.io is ~$29/mo for the bottom tier and the nice-looking tier is $99/mo. Better Uptime is cheaper but less well-known.
- **Con:** Manual incident posting unless you build webhook plumbing to your monitoring system. The free tier of Statuspage requires an Atlassian seat.
- **Con:** The status page lives at a subdomain we don't control end-to-end (e.g. `workforceap.statuspage.io`), or requires custom-domain setup which is a paid feature.

### Option (b): Self-hosted `/status` route

- A **public** page at `https://workforceap.org/status` that reads from `/api/health/slo` (admin-only — see below) plus `/api/health` (public) and renders a buyer-friendly view: green/yellow/red per SLO, last 90 days of uptime, and any active incidents. The page logic itself is admin-curated for incident text but reads live data for the SLO numbers.
- **Pro:** Lives on our domain. Branded the same as the rest of the platform. No third-party logo on a buyer-facing surface.
- **Pro:** Can show our *own* SLOs not just generic "service is up" — Statuspage's component model doesn't naturally express p95 latency or email delivery rate; ours can.
- **Pro:** Cheap. The infra is already there.
- **Con:** *We* are responsible for posting incident updates, which is real ops discipline.
- **Con:** If WorkforceAP itself is down, the status page is also down. Mitigation: the *uptime* number on the page is fed by an external monitor (Better Uptime), not by ourselves. The page is rendered by us, but Better Uptime's hosted page is the fallback if our site is fully down.

**Why option (b)**: control + brand consistency + the SLOs we care about don't fit Statuspage's component model neatly. We absorb the cost of one external uptime monitor (Better Uptime, ~$30/mo) as the only third-party dependency, and we ship a buyer-grade page on our own domain. If we ever outgrow this we can swap to Statuspage in a sprint.

### What the public `/status` page shows

- Banner: overall status (green / yellow / red)
- Last 90-day uptime number (from external monitor, surfaced via webhook into our DB)
- Per-SLO status indicator with target + current value
- Active incidents (admin-posted; markdown rendered)
- Subscribe-to-updates email field (downstream — Sprint D.2)
- Link to `/api/health` for raw JSON (machine-readable, already public)

### What the `/status` page does NOT show

- Internal performance metrics (raw p95 numbers per route, error counts, individual user issues) — those live behind `/api/health/slo`, which is admin-only.
- Customer-specific data — public surface, no PII, no per-tenant numbers.

---

## The internal SLO endpoint: `GET /api/health/slo`

A NEW route landed in this PR. **Admin-only**, returns recent SLO performance as JSON.

### Why admin-only (not public)

`/api/health` is public because it surfaces only configuration presence and DB reachability — no quantitative performance data. `/api/health/slo` is different: it surfaces internal latency numbers, error rates, and email-delivery percentages. Those are not secrets exactly, but they are competitive intelligence and they are the kind of thing that should be shown to buyers in a controlled context (a sales call, not a scraper). The public-facing `/status` page consumes a curated, summarized view of this data; the raw endpoint is gated.

If a buyer wants the raw JSON for diligence, an admin can issue them a one-off snapshot or grant them an admin account scoped to read-only.

### Response shape

```jsonc
{
  "generatedAt": "2026-05-08T14:30:00.000Z",
  "window": "last 7 days",
  "slos": [
    {
      "id": "uptime",
      "name": "Overall uptime",
      "target": "99.9%",
      "current": "99.94%",
      "status": "within"           // "within" | "breaching" | "unknown"
    },
    {
      "id": "dashboard_latency_p95",
      "name": "Dashboard p95 latency",
      "target": "< 500 ms",
      "current": "412 ms",
      "status": "within"
    }
    // ... one entry per SLO
  ]
}
```

The current implementation is **stub data** with `TODO` comments at each measurement site, marking where Sprint D.2 will wire in real Sentry / Vercel / DB queries.

### Why stub now

Wiring real Sentry queries requires a Sentry API token + project configuration and a non-trivial query layer; wiring Vercel Analytics requires their `@vercel/analytics` server-side API that is currently in beta. Neither is in scope for the foundation sprint. Shipping the route stub now means:

1. The contract is fixed (response shape, auth, route path).
2. The status page can be designed against real-shaped data.
3. D.2 is a localized PR — replace each stub function with its real implementation, no surface-area changes.

---

## Quarterly SLO report

**Audience:** Mike, Dad, board, lead investors, top-tier customers (NPower, AAUL leadership) on request.

**Cadence:** Last Friday of each quarter. Generated automatically (Sprint D.2 deliverable; for now, hand-assembled from the same numbers).

**Contents:**

| Field | Source |
|---|---|
| Quarter | (computed) |
| Each SLO: target, average, p95, days breaching, total breach minutes | Sentry / Vercel / DB rollup |
| Top 3 incidents that quarter | Manual incident log + Sentry issues |
| Error budget remaining at quarter end | Computed |
| Top latency-degrading routes | Sentry transactions sorted by impact |
| Closed action items from last quarter's report | Manual |
| Open action items going forward | Manual |

The report is short — 1-2 pages — and shipped as a PDF via the same email pipeline as the marketing newsletter. The point is *consistency and predictability*, not exhaustiveness. A buyer reading four quarters in a row sees a trend; that's the artifact that wins enterprise trust.

---

## What happens when an SLO breaches

1. **Page fires** (via Sentry burn-rate alert or synthetic check failure)
2. On-call engineer (Mike, escalating to Dad if no ack in 15 min) acknowledges
3. Incident is opened in `incidents/YYYY-MM-DD-slug.md`
4. `/status` page is updated with a banner ("Investigating slow dashboard render — started 14:32 UTC")
5. Mitigation deployed; status page updated to "Identified" → "Monitoring" → "Resolved"
6. Within 48h: post-incident review written and committed to `incidents/`. Public-safe summary on `/status`.
7. Within 1 week: action items from the PIR triaged into the backlog; if any structural fix is required, it's owned and dated.

This loop is the actual "incident response story" buyers ask about. It's deliberately tied to *artifacts in the repo* (PIRs, status updates, action items) so it's auditable.

---

## Honest limits and known gaps

- **No multi-region**. All SLOs are measured against a single Vercel deployment region + Supabase region. A region outage is a 100% downtime event by these definitions.
- **Synthetic cross-tenant check (SLO #5) depends on Track A.3 landing.** Until then we treat the SLO as "tracked via CI per-endpoint isolation tests" rather than a continuous runtime probe.
- **No real-user latency telemetry on mobile.** SLOs #2 and #3 are server-render p95, which is the dominant component but not the only one. Adding RUM is a Sprint D.3 candidate.
- **Email delivery SLO requires the Resend delivery webhook to be wired and writing back to the `Email` table.** We have the webhook handler; whether we have all delivery events landing in the `Email` row needs an audit.
- **The `/status` page itself is unbuilt as of this PR.** This doc commits us to its shape; the route + UI are queued.
- **No "burn rate" alerting infrastructure exists yet.** The thresholds in this doc are a contract for Sprint D.2, when we wire Sentry alert rules. Today we have manual review.
- **The only external monitor is the 15-minute GitHub Actions ping on `/api/health/ready`** (see "External readiness monitor"). It emails on failure; it does not page, and it does not cover portal render timeouts (a 504 on `/dashboard` with a healthy database — see `docs/POSTMORTEM-2026-06-18-PORTAL-OUTAGE.md`). A Vercel log drain and a production Sentry alert rule are still unconfigured.
- **Cost SLOs / unit economics** (per-request cost, infra spend per active member) are intentionally out of scope for this doc — that's a finance dashboard, not an availability story.

We list these because pretending they don't exist is what gets you in trouble during diligence. The gap list itself is a buyer-trust artifact: it shows we know what we don't measure.

---

## Summary table — what a buyer should walk away knowing

| Question | Answer |
|---|---|
| What's your uptime target? | 99.9% on `/api/health`, measured over rolling 30 days. |
| Where can I see it? | Public `/status` page (Sprint D.2). Today the external observer is the 15-minute GitHub Actions readiness ping (`uptime-ping.yml` run history); a hosted monitor (Better Uptime or similar) is not yet set up. |
| What if it breaches? | Burn-rate alert pages on-call; incident opened in 15 min; PIR within 48h; action items tracked. |
| What about correctness, not just uptime? | One binary SLO: 0 cross-tenant leaks. Any failure is sev-1. Currently enforced by CI tests; runtime synthetic probe is Track A.3. |
| Do you have an SLO on placement retention? | No, not yet — requires longer dwell and the verification pipeline (Track C). |
| How fresh is your dashboard? | p95 < 500 ms render, rolling 7 days. |
| Who pays the bill if you breach? | We don't offer service credits today. Adding that is a contractual decision Mike makes per enterprise deal, not a platform default. |

---

## Document history

| Date | Change |
|---|---|
| 2026-05-08 | Initial doc; Track D Sprint D.1 foundation. SLOs defined, route stub shipped, Sprint D.2 will wire real telemetry. |
| 2026-09-21 | WAP-164 item 1: documented the external readiness monitor (`.github/workflows/uptime-ping.yml`, 15-minute GitHub Actions probe of `/api/health/ready`, fails on non-200 or >5 s). Log drain + Sentry alert rule remain open operator items. |
| 2026-09-23 | WAP-204: nightly heavy suites, dispatch-only until WAP-66. Authenticated Portal Smoke now refreshes the preview mirror first (planned slot 07:37 UTC). The new `nightly-e2e.yml` runs the public Playwright specs (planned slot 08:47 UTC). Once scheduled, a failed run opens one de-duplicated `Nightly: <suite> failing` issue. Also documented that GitHub throttles schedules here. |

---

*Updated alongside any change to `app/api/health/slo/route.ts`, `.github/workflows/uptime-ping.yml`, the nightly suites (`authenticated-portal-smoke.yml`, `nightly-e2e.yml`), the public `/status` route when it lands, or any change to the committed SLO targets above.*
