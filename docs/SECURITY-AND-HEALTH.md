# Security & Health Posture

**Audience:** Partner / employer IT due diligence, internal monitoring, and the security backlog.

This document is the single answer to *"what's your security and uptime story?"* It's intentionally honest about what's hard now (so we can fix the right things) rather than aspirational.

---

## Health endpoints

Canonical operator contract: [`docs/HEALTH-PROBES.md`](HEALTH-PROBES.md).

### `GET /api/health` — liveness

Cheap process probe. **No Prisma.** HTTP 200 means the Next isolate is up — not that portal pages render. Do not page 504s from this staying green (2026-06-18).

```jsonc
{
  "status": "ok",
  "probe": "live",
  "version": "5147c79",
  "timestamp": "2026-08-23T17:00:00.000Z",
  "note": "Liveness only. Use GET /api/health/ready for Prisma/org readiness…"
}
```

### `GET /api/health/ready` — readiness

One Prisma `$transaction` → default org `findUnique` (`slug=workforceap`). **503 / `status: "fail"`** if Prisma is down or the org row is missing — the same failure that 500s every page via `app/layout.tsx`.

```jsonc
{
  "status": "ok" | "fail",
  "probe": "ready",
  "version": "5147c79",
  "timestamp": "2026-08-23T17:00:00.000Z",
  "checks": {
    "database": { "status": "ok", "responseTimeMs": 12 },
    "organization": { "status": "ok", "slug": "workforceap", "responseTimeMs": 12 }
  }
}
```

### What these endpoints do NOT do

- **Liveness makes no outbound requests** (no DB ping).
- **No secrets.** No env values, no PII.
- **Ready is not a portal-render smoke.** A green ready + 504 on `/dashboard` still happened in June 2026 — also alert on Vercel runtime timeouts.

Both probes are public. `/api/health/slo` stays admin-only.

---

## Content Security Policy

Defined in `next.config.ts` under `headers()`. Hardened in this PR with these additions:

- `object-src 'none'` — blocks all `<object>`, `<embed>`, `<applet>` injection vectors
- `base-uri 'self'` — prevents `<base>` tag injection from rebasing relative URLs
- `frame-ancestors 'none'` — prevents the platform from being embedded in any iframe (clickjacking defense). Supersedes `X-Frame-Options: DENY` in modern browsers; we keep both for older clients.
- `upgrade-insecure-requests` — forces accidental `http://` references to `https://` on supporting browsers

### Known security debt

- **`'unsafe-inline'` and `'unsafe-eval'` remain on `script-src`.** Required by Next.js App Router runtime, GTM bootstrap, and Vercel Insights inline beacons. Removing them needs a nonce migration. Estimated 1–2 day effort + thorough QA. Tracked here as **CSP-DEBT-001**.
- **`'unsafe-inline'` on `style-src`.** Many components use inline `style={...}` props plus Material Symbols variation settings. Removing it requires either: (a) extracting all inline styles to CSS modules, or (b) per-render style nonces. Both are mid-effort. Tracked as **CSP-DEBT-002**.

These are **real** debt items but they are not exploitable in isolation. The XSS surface they widen requires either:
- A successful HTML injection somewhere in the platform (we sanitize all user input via `escapeHtml()` and Prisma parameterizes queries), OR
- A malicious browser extension running in the user's session (out of scope for any application's CSP)

So while removing them is the right move, ranking them above the items in DEMO-PATH-AUDIT.md or the WIOA push is wrong.

---

## CAPTCHA (Cloudflare Turnstile)

- **Wired:** `lib/turnstile/verifyTurnstile.ts` (server) + `app/employers/EmployerContactForm.tsx` (client) + `app/api/contact/route.ts` (verification gate).
- **Status:** Infrastructure complete. Disabled by default.
- **To enable in production:**
  1. Set `NEXT_PUBLIC_CAPTCHA_ENABLED=true` in Vercel
  2. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<your_site_key>` in Vercel
  3. Set `TURNSTILE_SECRET_KEY=<your_secret>` in Vercel
  4. Redeploy

The `/api/health` endpoint will report `captcha_turnstile: ok` once enabled and configured, `fail` if enabled without keys, and `skipped` while disabled.

### Forms currently behind CAPTCHA (when enabled)

- `EmployerContactForm` → `POST /api/contact`

### Forms NOT behind CAPTCHA (today)

- `/apply/create-account` — the apply funnel is the highest-priority funnel. Adding CAPTCHA there is a future call balancing abuse risk vs. drop-off. Today: rate-limited via `checkApplySignupRateLimit`. Missing Redis: stays open when `RATE_LIMIT_ALLOW_MISSING_UPSTASH=1` (pre-prod default). Set `WAP_APPLY_RATE_LIMIT_FAIL_CLOSED=1` to 429 apply/signup without Redis.
- `/contact` — same pattern. Rate-limited.
- Magic-link login — Supabase has its own anti-abuse; OK.

---

## Other security posture (current state)

| Area | Status | Notes |
|---|---|---|
| HSTS | ✅ on | `max-age=63072000; includeSubDomains; preload` |
| X-Content-Type-Options | ✅ on | `nosniff` |
| X-Frame-Options | ✅ on | `DENY` (plus CSP `frame-ancestors 'none'`) |
| Referrer-Policy | ✅ on | `strict-origin-when-cross-origin` |
| Permissions-Policy | ✅ on | camera/mic on self only, geolocation off |
| Rate limiting | ✅ on | apply signup, login, password reset, admin mutations |
| SQL injection | ✅ defended | Prisma parameterized queries everywhere; no string concat |
| XSS in emails | ✅ defended | `escapeHtml()` on every user-supplied field in templates |
| Secrets management | ✅ via Vercel | env vars only; nothing in repo |
| Sentry error capture | ✅ on | server + client; PII filtering at source |
| Audit log | ✅ on | `auditLog()` writes for every admin mutation that touches member data |

---

## Outstanding security items (the honest backlog)

| ID | Item | Priority | Effort |
|---|---|---|---|
| CSP-DEBT-001 | Remove `'unsafe-eval'` from `script-src` via nonces | Medium | 1–2 days |
| CSP-DEBT-002 | Remove `'unsafe-inline'` from `script-src` and `style-src` via nonces | Medium | 2–3 days |
| SEC-001 | Enable CAPTCHA in production (env-var flip) | Low | 5 min |
| SEC-002 | Lifecycle / retention rules for `member-resumes` and `voice-interview-recordings/*` storage buckets | Low | 1 day, gate on legal review |
| SEC-003 | CSP `report-uri` / `report-to` for violation telemetry — **phase 1 shipped 2026-09-21** (`Content-Security-Policy-Report-Only` + `/api/csp-report`, WAP-36; see `docs/SECURITY-HARDENING.md` §13). Enforce flip pending soak. | Low | done (observe) |
| SEC-004 | Apply CAPTCHA to `/apply/create-account` after measuring drop-off | Low | half day |

Missing production secrets no longer appear as `not_configured` rows on `/api/health` (that payload is liveness-only). Confirm env presence from `.env.example` / Vercel — not the public probe.

---

## Document history

| Date | Change |
|---|---|
| 2026-05-07 | Initial doc; Track C of the three-track day. CSP hardened with safe additions; `/api/health` upgraded to dependency-aware. |
| 2026-08-23 | Split liveness (`/api/health`) from readiness (`/api/health/ready`). See `docs/HEALTH-PROBES.md`. |

---

*Updated alongside any change to `next.config.ts` headers, `app/api/health/route.ts`, `app/api/health/ready/route.ts`, or the Turnstile / Resend integration paths.*
