# Cross-portal audit — execution plan

This plan coordinates **route coverage**, **automation**, **manual UX**, and **role-appropriate QA** across **member**, **admin**, **employer**, **partner**, and **counselor** surfaces. It builds on [`MEMBER-PAGES-AUDIT.md`](./MEMBER-PAGES-AUDIT.md) and [`PORTAL-UI-UX-AUDIT-FINDINGS.md`](./PORTAL-UI-UX-AUDIT-FINDINGS.md).

---

## 1. Objectives

| Goal | Success criteria |
|------|------------------|
| **No broken static routes** | Every static path loads without an unauthenticated redirect to `/login` for a user who should have access. |
| **Dynamic routes spot-checked** | Visible same-origin fixtures are audited automatically; checked-in required fixtures fail closed when missing, and data-dependent routes remain explicitly not applicable when no safe fixture is visible. |
| **UX consistency** | Shell (`WorkspaceShell`), heading hierarchy, mobile bottom clearance, focus states — tracked in findings docs, not only in automation. |
| **Repeatable runs** | One command reproduces the route pass; output is committed or archived for comparison. |

---

## 2. Inventory (automation scope)

| Surface | Static paths (automated) | Dynamic patterns (discovered / gated) |
|---------|--------------------------|-------------------------------------|
| Member | 53 | 6 patterns |
| Admin | 74 | 16 patterns |
| Employer | 16 | 5 patterns |
| Partner | 10 | 1 pattern |
| Counselor | 14 | 2 patterns |

**Source of truth:** `scripts/lib/portal-audit-paths.mjs` — rendered pages belong in `STATIC_PATHS`; intentional redirect aliases belong in `REDIRECT_ONLY_PATHS` with their target and reason. Route discovery compares `app/**/page.tsx` against both manifests, but the browser never counts redirect-only aliases as rendered-page coverage.

**Subagent verification (2026-04-08):** Parallel codebase walks confirmed admin JSON array and employer/partner/counselor path sets align with `app/admin` and `app/(portal)/{employer,partner,counselor}`.

---

## 3. Phases

### Phase A — Automated static route pass (required each release)

1. Use distinct, single-purpose identity pairs: `E2E_<ROLE>_EMAIL` and `E2E_<ROLE>_PASSWORD` for every role selected by the target policy. Identities may never be reused across roles.
2. Use one of the target policies:
   - `isolated_preview`: `PLAYWRIGHT_BASE_URL` must exactly equal the origin in `PORTAL_AUDIT_TRUSTED_PREVIEW_ORIGIN`; this uses five distinct identities and runs every rendered route at desktop and mobile widths.
   - `production_canary`: the target must be exactly `https://workforceap.org` or `https://www.workforceap.org`; this uses only member, employer, and partner identities and visits their roots at desktop width. Those three source roles still probe authorization against all five portal roots. Admin and counselor production authentication remain attended because staff MFA must not be bypassed by CI, and their secrets are not injected into this job.
   - `local`: only a loopback origin is accepted; `PORTAL_AUDIT_SECTION` may narrow the run while developing.
3. Run **`npm run audit:portal`**. The target is validated before the credential file is read or Playwright starts.
4. Inspect **`test-results/portal-audit-results.json`**. The artifact includes an explicit `evidenceScope` (`complete_five_role_matrix`, `production_nonstaff_canary`, or local subset), route results, actual authenticated-identity distinctness, and every applicable allowed/denied access-matrix probe. A fresh failed/incomplete artifact is written before browser work starts.
   Redirect-only rows require the exact target and a healthy rendered destination. Canceled read GETs remain diagnostics only after that destination is verified; page, console, HTTP, fallback, and blocked-write failures still fail the row. Sanitized `pageErrors` and `consoleErrors` on each redirect row support triage without exposing fixture identifiers.
   On a manual isolated Preview run, `capture_hydration_trace` may be enabled to log allowlisted route templates and root structure only when a rendered or redirect-only probe reports React #418. The trace is diagnostic and does not change the row verdict.
5. Optional: **`npx playwright test tests/e2e/cross-portal-routes.spec.ts`** with the same trusted-target and credential variables.

Both the target deployment and the workflow runner require the same secret `PORTAL_AUDIT_READ_ONLY_TOKEN` (minimum 32 characters). The token must be stored only in the deployment/workflow secret stores; it must never be committed, logged, or copied into the result artifact. A missing or mismatched token blocks the audit.

### Phase B — Dynamic routes (automated discovery plus attended gaps)

For each entry in `DYNAMIC_PATHS` in `portal-audit-paths.mjs`:

1. The runner discovers visible same-origin links from audited list/index routes and audits the concrete destination while storing only the checked-in redacted pattern.
2. Patterns in `REQUIRED_DYNAMIC_PATHS` must resolve and pass. Other patterns are audited whenever a safe fixture is visible and remain explicitly `not_applicable` otherwise.
3. Record any attended or data-fixture gap in [`CROSS-PORTAL-PAGES-AUDIT.md`](./CROSS-PORTAL-PAGES-AUDIT.md) or a ticket; never paste live IDs into the artifact.

### Phase C — Visual / UX pass (sampled)

Per surface, at **390px** and **1280px** width:

- Scroll to bottom: footer not hidden under fixed bottom nav (member/employer/partner/counselor where applicable).
- One form page: labels, errors, primary action visible.
- One data-dense page: table/card grid does not force horizontal page scroll.

Use [`PORTAL-PRE-PR-AUDIT.md`](./PORTAL-PRE-PR-AUDIT.md) for shell-specific checks.

### Phase D — trusted manual workflow

- `.github/workflows/authenticated-portal-smoke.yml` exposes `isolated_preview`, `production_canary`, and a lighter `hub_smoke` choice (member/counselor/employer login→hub→one deep link via `npm run test:e2e:portal-hubs`); it has no arbitrary URL input.
- The job runs only from the canonical repository's `master` ref and checks out trusted `master` before any credentialed browser step.
- `PREVIEW_SITE_URL` is the exact isolated-preview origin. Never replace this with a broad `*.vercel.app` allow rule.
- The isolated preview is produced by `.github/workflows/mirror-master-to-preview.yml`: every push to `master` points the machine-owned `preview` branch at the same commit, `vercel.json` lets Vercel build that branch in its **Preview** environment (DEMO Supabase project — see [`STAGING_ENV.md`](./STAGING_ENV.md)), and the stable branch alias of that deployment is the value `PREVIEW_SITE_URL` must hold. A production alias is never an acceptable value: it serves real member data, so the five-role sign-in would not be isolated at all.
- Before any credentialed step, `scripts/portal-audit-health-gate.mjs` polls the target's `/api/health` until `version` is a prefix of the trusted master SHA **and** `supabaseRef` is the DEMO project (the real project for `production_canary`). A target on the wrong Supabase project fails immediately; a preview that is still building is retried for up to ten minutes; the origin is never written to the log. The gate's decisions live in `scripts/lib/portal-audit-health-gate.mjs` and are unit-tested in `tests/portal-audit-health-gate.test.ts`.
- Artifact upload uses `if-no-files-found: error`; a missing result is a failed audit, not a warning.
- Authentication is the only permitted write: the login route may update its dedicated test account's login telemetry. The browser sends the external capability-token header only to the exact trusted origin. Middleware strips caller-supplied audit headers, validates the capability with constant-time comparison after authentication, and then mints the internal audit header. A naked public header cannot enable audit behavior.
- In read-only audit mode, server and client surfaces suppress write-on-read behavior and provider/cache side effects such as onboarding persistence, tours, notification polling, message-thread provisioning/read receipts, referral-code minting, resume object downloads/signed URLs, personalized LLM calls, Coursera lookups, Redis-backed metrics, and health-provider diagnostics. Every suppression emits a stable `data-portal-audit-suppressed` marker that is captured in the result.
- Every other non-GET request fails closed in the browser guard. Required same-origin data-request failures and stable `data-portal-error-state` fallbacks fail the route instead of passing as an empty 200 page.
- Result URLs and dynamic record references use checked-in route patterns with `[redacted]`; page body text, raw record IDs, credentials, tokens, resume text, and provider payloads are not written to artifacts.

### Phase E — attended proof gates

Automation does not manufacture consequential evidence. A release still needs attended confirmation for a real PDF/DOCX/TXT upload and parsed resume preview, spoken Lilley voice behavior, email receipt, staff MFA, and any action that sends, enrolls, assigns, publishes, or mutates real member/employer/partner records.

---

## 4. Commands reference

| Command | Purpose |
|---------|---------|
| `npm run audit:portal` | Policy-selected routes plus access matrix → `test-results/portal-audit-results.json` |
| `PORTAL_AUDIT_MODE=local PORTAL_AUDIT_SECTION=admin npm run audit:portal` | Local admin-only development run; isolated preview requires all five roles and production uses the fixed non-staff canary matrix |
| `npm run audit:member-pages` | Member only → `docs/member-pages-live-results.json` |
| `npx playwright test tests/e2e/cross-portal-routes.spec.ts` | Same coverage as audit script, Playwright runner |

---

## 5. Subagent playbook (for future Cursor runs)

Use **parallel explore** subagents to:

1. **Diff-check** `portal-audit-paths.mjs` vs `glob **/page.tsx` under `app/admin` and `app/(portal)` — after large route refactors.
2. **Find** new `redirect()` or `next.config` redirects that change canonical URLs — update §Legacy tables in member/cross-portal docs.
3. **Scan** for new `MobileBottomNav` or layout wrappers on a surface — trigger Phase C for that surface only.

---

## 6. Deliverables checklist

- [x] Shared path data: `scripts/lib/portal-audit-paths.mjs`
- [x] Runner: `scripts/audit-portal-routes.mjs` + `npm run audit:portal`
- [x] Member script refactored to reuse shared member paths
- [x] Playwright: `tests/e2e/cross-portal-routes.spec.ts`
- [x] Summary doc: `docs/CROSS-PORTAL-PAGES-AUDIT.md`
- [x] Manual trusted-target workflow uploads the current result; generated run artifacts are never committed

---

## 7. Changelog

| Date | Change |
|------|--------|
| 2026-09-23 | Redirect probes now verify destination health before treating canceled read requests as diagnostics, and retain sanitized page and console errors in the result artifact. |
| 2026-08-29 | Hardened target trust, middleware-minted read-only capability, provider/write-on-read suppression, five-account isolated-preview coverage, explicit three-role non-staff production scope, negative role probes, redirect-only inventory, deterministic data settlement, redacted artifacts, and current failure artifacts. |
| 2026-04-08 | Initial cross-portal plan, unified audit runner, subagent route verification. |
