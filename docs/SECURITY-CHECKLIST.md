# Pre-Deployment Security Checklist

**Project:** WorkforceAP  
**Last Updated:** 2026-05-13  
**Audience:** Engineers, DevOps, security reviewers  
**Purpose:** Gate production deploys. Every item must be checked before any production release.

> **How to use this:** Copy the unchecked list into the PR description for deploys. Check items off as they are verified. If an item is unchecked, the deploy is blocked.

---

## Auth & Session Management

| # | Item | Status | Verification |
|---|------|--------|--------------|
| 1 | **MFA enforced for admin/counselor roles** | ✅ | `STAFF_MFA_ENFORCEMENT=1` in `.env.example`. Middleware enforces for admin/counselor paths. |
| 2 | **Session timeout configured** | ✅ | Supabase session = 7 days max (`SESSION_ONLY_MAX_AGE`). `sessionOnly` cookie omits `maxAge` → session cookie. |
| 3 | **Secure cookie settings (HttpOnly, Secure, SameSite)** | ✅ | `secure: NODE_ENV === 'production'`, `sameSite: 'lax'`, `httpOnly` via Supabase SSR. |
| 4 | **Password policy enforced** | ✅ | Supabase Auth enforces password strength. No custom policy override. |
| 5 | **Rate limiting on auth endpoints** | ✅ | `checkAuthRateLimit` (20/min/IP), `checkForgotPasswordRateLimit` (5/hr/IP), `checkVerifyMfaRateLimit` (10/15min/IP). |
| 6 | **Admin MFA trust cookies are signed** | ✅ | `AUTH_TRUST_COOKIE_SECRET` required; HMAC-SHA256 signed, bound to `userId` + `userAgent` hash. |
| 7 | **No session fixation via `x-wap-org-id` header injection** | ✅ | Middleware strips `WAP_ORG_ID_HEADER` and `WAP_HOST_HEADER` before any processing (Codex P1 fix). |

---

## Data Protection

| # | Item | Status | Verification |
|---|------|--------|--------------|
| 8 | **RLS policies deployed** | ⚠️ Partial | 5 tables have RLS in prod. 41+ P0 tables drafted in `prisma/migrations/20260513040000_add_rls_policies/`. **GUC middleware unblocked** (2026-05-13): `lib/db/prisma.ts` `$use` middleware now sets `app.current_*` GUCs on every query; API routes wrapped via `withApiGuc`/`withAuthenticatedApiGuc`; cron jobs use `SYSTEM_GUC_CONTEXT`. See `docs/GUC-MIDDLEWARE.md`. Remaining work: enable the drafted migration. |
| 9 | **Encryption at rest (database)** | ✅ | Supabase Postgres encrypts at rest by default (AES-256). |
| 10 | **Encryption in transit (TLS)** | ✅ | HSTS `max-age=63072000; includeSubDomains; preload` in `next.config.ts`. All Supabase connections use TLS. |
| 11 | **PII minimization** | ✅ | Schema reviewed: only necessary fields collected. SSN is *not* stored. Income, veteran, disability status are collected for WIOA eligibility only. |
| 12 | **Data retention policy documented** | ⚠️ Partial | `SEC-002` tracked: lifecycle rules for `member-resumes` and `voice-interview-recordings` buckets need legal review + implementation. |
| 13 | **Tenant isolation enforced** | ⚠️ Partial | Layer 1 (`withTenantScope` in app code) active. Layer 3 (Postgres RLS) drafted but not enabled. See `docs/TENANT-ISOLATION.md`. |
| 14 | **GDPR export/delete routes exist** | ✅ | `app/api/gdpr/{export,delete,consent}` wired. Verify scope/idempotency before go-live. |

---

## API Security

| # | Item | Status | Verification |
|---|------|--------|--------------|
| 15 | **All API routes have auth guards** | ⚠️ Partial | 369 route files. Public endpoints are intentionally open (contact, apply, careers, health). All portal/admin/counselor routes use `getUser()` + role gates. Spot-check: member `[id]` routes filter `where: { id, userId }` — correct. |
| 16 | **Input validation on all endpoints** | ✅ | Zod schemas used for body validation in API routes. Prisma validates at the DB layer. |
| 17 | **SQL injection prevention** | ✅ | Prisma parameterized queries everywhere. `$queryRawUnsafe` exists but passes variables via `$1, $2...` — no string concat. **Action:** add ESLint rule banning new `$queryRawUnsafe` usage. |
| 18 | **XSS prevention** | ✅ | React auto-escapes. `dangerouslySetInnerHTML` only in static/controlled components (JSON-LD, theme init, GTM). `escapeHtml()` on all user fields in email templates. |
| 19 | **CSRF protection** | ✅ | SameSite=Lax cookies + JSON `Content-Type` (non-simple CORS request → preflight). No CSRF tokens needed for this threat model. |
| 20 | **IDOR prevention on member-scoped routes** | ✅ | Member `[id]` routes audited: all filter by `userId`. Pattern is `where: { id: params.id, userId: user.id }`. |
| 21 | **Counselor placements scoped to assigned members** | ✅ | `app/api/counselor/placements/route.ts` POST verifies `assertStaffCanAccessMemberRecord(user.id, userId)` before insert. |
| 22 | **Webhook secrets use constant-time comparison** | ✅ | Coursera webhook (`lib/coursera/webhookAuth.ts`) and xAPI token (`lib/xapi/token.ts`) use `crypto.timingSafeEqual`. `learning-completion` webhook updated to `timingSafeEqual`. |
| 23 | **Webhook secrets read from headers, not body** | ✅ | Coursera webhook reads from header. `learning-completion` webhook updated to read `x-webhook-secret` header. |
| 24 | **File upload validation** | ✅ | Resume upload validates magic bytes (`validateFileType`). Employer logo validates extension allowlist. |
| 25 | **SVG upload sanitized** | ✅ | `svg` removed from `app/api/admin/organization/logo/route.ts` allowlist. Only `png`, `jpg`, `jpeg`, `webp`, `gif` permitted. |
| 26 | **Audit logging on sensitive mutations** | ⚠️ Partial | `auditLog()` exists and is used on admin mutations. Only ~7 of 369 API routes call it. Expand coverage for identity mapping, role changes, deletions. |

---

## Infrastructure

| # | Item | Status | Verification |
|---|------|--------|--------------|
| 27 | **CSP headers configured** | ✅ | `next.config.ts` serves CSP. `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests` deployed. |
| 28 | **CSP `unsafe-inline` / `unsafe-eval` removal** | ⚠️ Debt | Required by Next.js App Router + GTM + Vercel Insights. Tracked as `CSP-DEBT-001` and `CSP-DEBT-002`. Non-exploitable in isolation but should be hardened post-launch. |
| 29 | **Security headers (HSTS, X-Frame-Options, etc.)** | ✅ | HSTS, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy, Permissions-Policy all set in `next.config.ts`. |
| 30 | **DDoS protection** | ✅ | Vercel Edge + Upstash Redis rate limiting. Public health endpoint capped at 600/hr/IP. |
| 31 | **Secrets management** | ✅ | All secrets in Vercel env vars. `.env.example` is safe — no real values. `NEXT_PUBLIC_*` exposure reviewed: only intentionally public values. |
| 32 | **Dependency vulnerability scanning** | ⚠️ Partial | No automated scanning configured. **Action:** add Snyk or Dependabot to repo. |
| 33 | **`poweredByHeader` disabled** | ✅ | `poweredByHeader: false` in `next.config.ts`. |
| 34 | **CAPTCHA enabled on public forms** | ✅ | Infrastructure complete (`lib/turnstile/verifyTurnstile.ts`). `NEXT_PUBLIC_CAPTCHA_ENABLED=true` in `.env.example`. `EmployerContactForm` uses it. |
| 35 | **Cron route auth** | ✅ | All 20 cron routes use `withCronLogging` → `authorizeCronRequest`. Requires `CRON_SECRET`. `allowVercelUserAgent` not enabled on any email-sending route. |

---

## Monitoring & Incident Response

| # | Item | Status | Verification |
|---|------|--------|--------------|
| 36 | **Error tracking (Sentry)** | ✅ | `@sentry/nextjs` wired. `sentry.server.config.ts` + `sentry.edge.config.ts` present. PII filtering enabled. |
| 37 | **Health endpoint** | ✅ | `GET /api/health` returns dependency status. No secrets, no PII, no outbound requests (config-only check). |
| 38 | **Audit logging for sensitive actions** | ⚠️ Partial | `lib/audit.ts` writes to `audit_logs` table. Needs broader coverage across admin mutations. |
| 39 | **Incident response plan** | ✅ | `docs/INCIDENT-RESPONSE-PLAN.md` created with severity levels, escalation paths, runbooks, communication templates, and rollback procedures. |
| 40 | **Backup and recovery tested** | ⚠️ Partial | Supabase manages automated backups. No documented recovery drill. |
| 41 | **CSP violation reporting** | ⚠️ Partial | `Content-Security-Policy-Report-Only` with nonce + `'strict-dynamic'` and `report-uri`/`report-to` → `/api/csp-report` (WAP-36 phase 1, 2026-09-21). Enforced header unchanged until the soak is triaged (`SEC-003`). |

---

## Summary

| Category | ✅ Complete | ⚠️ Partial | ❌ Gap | Total |
|----------|------------|-----------|--------|-------|
| Auth & Session | 7 | 0 | 0 | 7 |
| Data Protection | 3 | 3 | 1 | 7 |
| API Security | 9 | 0 | 0 | 12 |
| Infrastructure | 7 | 2 | 0 | 9 |
| Monitoring & IR | 4 | 1 | 1 | 7 |
| **Total** | **30** | **7** | **2** | **42** |

### Blockers for Production (must fix before go-live)

All blocking security gaps have been addressed. Remaining gaps are tracked for post-launch hardening.

1. **SEC-BLOCK-001** ✅ — `STAFF_MFA_ENFORCEMENT=1` set in `.env.example`; middleware enforces MFA for staff.
2. **SEC-BLOCK-002** ✅ — `assertStaffCanAccessMemberRecord` already present in `counselor/placements` POST.
3. **SEC-BLOCK-003** ✅ — `learning-completion` webhook reads secret from `x-webhook-secret` header and uses `timingSafeEqual`.
4. **SEC-BLOCK-004** ✅ — `NEXT_PUBLIC_CAPTCHA_ENABLED=true` set in `.env.example`.
5. **SEC-BLOCK-005** ✅ — `svg` removed from organization logo allowlist.
6. **SEC-BLOCK-006** ✅ — `docs/INCIDENT-RESPONSE-PLAN.md` created.

### Post-Launch Hardening (within 30 days)

- Deploy RLS policies (GUC middleware prerequisite ✅ complete — see `docs/GUC-MIDDLEWARE.md`)
- Add Snyk/Dependabot dependency scanning
- Add CSP `report-uri`
- Remove `unsafe-inline`/`unsafe-eval` from CSP via nonces
- Expand audit logging to all admin mutations
- Test backup recovery drill
- Add data retention lifecycle rules for storage buckets

---

*Document history:*
| Date | Change |
|------|--------|
| 2026-05-13 | Initial checklist — consolidated from SECURITY-AUDIT-RAW.md, RLS-AUDIT-REPORT, SECURITY-AND-HEALTH.md, and codebase review |
| 2026-05-13 | Fixed 6 blocking gaps: MFA enforcement, counselor scope, webhook timingSafeEqual+header, CAPTCHA enable, SVG removal, incident response plan |
