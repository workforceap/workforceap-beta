# Security Hardening Guide

**Project:** WorkforceAP  
**Last Updated:** 2026-05-13  
**Audience:** Engineers, DevOps, security auditors  
**Purpose:** Step-by-step verification and remediation for every item in `SECURITY-CHECKLIST.md`.

---

## Table of Contents

1. [Auth & Session Management](#auth--session-management)
2. [Data Protection](#data-protection)
3. [API Security](#api-security)
4. [Infrastructure](#infrastructure)
5. [Monitoring & Incident Response](#monitoring--incident-response)
6. [Recommended Tools](#recommended-tools)
7. [Quick Reference Commands](#quick-reference-commands)

---

## Auth & Session Management

### 1. MFA Enforcement for Staff

**What:** Require multi-factor authentication for admin, counselor, and partner portal users.

**How it's implemented:**
- Supabase Auth MFA (TOTP) is wired in `middleware.ts`
- `STAFF_MFA_ENFORCEMENT` env flag controls enforcement
- Trust cookies allow 7-day device exemption (`ADMIN_MFA_TRUST_DAYS`)
- Trust tokens are HMAC-SHA256 signed with `AUTH_TRUST_COOKIE_SECRET`

**How to verify:**
```bash
# Check env
vercel env ls production | grep STAFF_MFA_ENFORCEMENT
# Should return: 1

# Test: log in as admin with MFA disabled → should redirect to /setup-mfa
```

**How to fix:**
```bash
vercel env add STAFF_MFA_ENFORCEMENT production
# Value: 1
```

**Common issues:**
- **Trust cookie not persisting:** Check `AUTH_TRUST_COOKIE_SECRET` is set and ≥32 hex chars.
- **MFA loop on API routes:** Ensure `isAdminApiPath()` in `middleware.ts` covers the route prefix.

---

### 2. Session Timeout & Cookie Security

**What:** Sessions should expire and cookies should be secure.

**Current state:**
```typescript
// lib/supabaseCookieOptions.ts
{
  path: '/',
  maxAge: 60 * 60 * 24 * 7,   // 7 days
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}
```

**How to verify:**
```bash
# Check production cookies
curl -I https://www.workforceap.org | grep -i "set-cookie"
# Should see: SameSite=Lax; Secure; HttpOnly
```

**How to fix if missing:**
- Ensure `NODE_ENV=production` in Vercel production environment.
- Do NOT set `sameSite: 'none'` — that enables CSRF.

**Session-only mode:**
- When user checks "Don't remember me", `SESSION_ONLY_COOKIE=1` omits `maxAge` → session cookie.
- Verified in `middleware.ts` and `createSupabaseServerClient()`.

---

### 3. Rate Limiting on Auth Endpoints

**What:** Prevent brute-force attacks on login, password reset, and MFA verification.

**Current limits:**
| Endpoint | Limit | Identifier |
|----------|-------|------------|
| Login | 20/min | IP |
| Forgot password | 5/hr | IP |
| Forgot password email | 3/24h | email |
| MFA verify | 10/15min | IP |
| Signup | 12/30min | IP |
| Apply signup | 50/30min | IP |

**How to verify:**
```bash
# Test auth rate limit (should return 429 after 20 attempts)
for i in {1..25}; do
  curl -X POST https://www.workforceap.org/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done
```

**How to fix if missing:**
```bash
# Add Upstash Redis credentials
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
```

**Important:** Auth rate limits `FAIL OPEN` — if Redis is down, the app stays usable. This is intentional for member access, but monitor Redis connectivity.

---

### 4. Admin MFA Trust Cookie Security

**What:** Prevent trust cookie forgery and replay.

**Implementation:** `lib/auth/mfaTrust.ts`
- Signs `{userId, userAgentHash, expires}` with `AUTH_TRUST_COOKIE_SECRET`
- `userAgentHash` binds cookie to browser fingerprint
- Cookie name is `wap_mfa_trust_<userId_last_8>`

**How to verify:**
```bash
# Ensure secret is set and >= 32 bytes
openssl rand -hex 32
vercel env add AUTH_TRUST_COOKIE_SECRET production
```

**Common issue:** Changing `AUTH_TRUST_COOKIE_SECRET` invalidates all existing trust cookies — staff will need to re-verify MFA. Rotate during low-traffic windows.

---

## Data Protection

### 5. Row-Level Security (RLS)

**What:** Postgres RLS prevents cross-tenant data leaks even if application-layer checks fail.

**Current state:**
- 5 tables have RLS enabled
- 41+ P0 tables need policies
- Migration drafted: `prisma/migrations/20260513040000_add_rls_policies/`

**How to verify (Supabase Dashboard):**
1. Go to Supabase Studio → Database → Policies
2. Check that P0 tables have `ENABLE ROW LEVEL SECURITY`
3. Verify policies exist for: SELECT, INSERT, UPDATE, DELETE

**How to verify (SQL):**
```sql
-- List tables without RLS
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename NOT IN (
    SELECT relname FROM pg_class WHERE relrowsecurity = true
  );
```

**Critical prerequisite:**
Do NOT enable RLS in production until the Prisma GUC middleware is deployed:
```typescript
// Required per-query context
SET LOCAL app.current_user_id = '<uuid>';
SET LOCAL app.current_org_id = '<uuid>';
SET LOCAL app.current_role = 'member|admin|counselor|...';
```
Without this, Prisma direct queries will be blocked by RLS.

**Deployment order:**
1. Deploy GUC middleware in Prisma extension
2. Enable RLS on staging, run full test suite
3. Performance benchmark (RLS adds ~5-15% overhead on complex joins)
4. Deploy to production

---

### 6. Encryption

**At rest:** ✅ Supabase Postgres uses AES-256 encryption by default. No action needed.

**In transit:**
- HSTS header: `max-age=63072000; includeSubDomains; preload`
- All Supabase connections use TLS (enforced by Supabase)
- WebSocket connections (realtime) use WSS

**How to verify:**
```bash
# SSL Labs scan
npx ssllabs-cli https://www.workforceap.org
# Should return A+ rating

# HSTS check
curl -I https://www.workforceap.org | grep strict-transport-security
```

**How to submit to HSTS preload list:**
1. Ensure `includeSubDomains` and `preload` directives are present ✅
2. Visit https://hstspreload.org and submit `workforceap.org`
3. Monitor for inclusion in Chrome/Firefox releases (~6-12 weeks)

---

### 7. PII Minimization

**What:** Only collect data required for program delivery.

**Current schema fields (PII):**
- `profiles`: name, email, phone, address, DOB, veteran_status, disability_status, income_level
- `applications`: SSN is **NOT** collected ✅
- `placement_records`: salary, employer, start_date

**How to verify:**
```bash
# Search for SSN collection
grep -ri "ssn\|social.security" app/ lib/ prisma/ --include="*.ts" --include="*.prisma"
# Should return no results
```

**Retention rules needed:**
| Data | Retention | Action |
|------|-----------|--------|
| Member resumes | 2 years post-placement | Add Supabase Storage lifecycle rule |
| Voice interview recordings | 90 days | Add lifecycle rule |
| Audit logs | 7 years | Keep indefinitely (compliance) |
| Weekly recaps | 2 years | Prisma migration to add `archivedAt` |

---

## API Security

### 8. Auth Guards on All Routes

**What:** Every API route that serves sensitive data must verify authentication.

**How to verify:**
```bash
# Count routes without getUser() or getSession()
grep -rL "getUser\|getSession\|authorizeCronRequest\|verifyPlacementSurveyToken" app/api --include="route.ts"
# Public routes expected: contact, apply/*, careers/*, health, public/*, webhooks/*, xapi/*, placement-survey
```

**Common pattern (correct):**
```typescript
// Member-scoped routes
const user = await getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// Verify ownership
const record = await prisma.goals.findFirst({
  where: { id: params.id, userId: user.id }
});
if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```

**Anti-pattern (must fix):**
```typescript
// ❌ Trusts body userId without ownership check
const { userId } = await request.json();
// Fix: add assertStaffCanAccessMemberRecord(staffUserId, userId)
```

---

### 9. SQL Injection Prevention

**What:** Prevent attacker-controlled SQL execution.

**Current state:** ✅ Safe — Prisma uses parameterized queries.

**How to verify:**
```bash
# Search for unsafe patterns
grep -r "queryRawUnsafe\|executeRawUnsafe" app/ lib/ --include="*.ts" -n
# Review each call: SQL should be constant string, variables via $1, $2...
```

**How to harden:**
Add ESLint rule to ban new `$queryRawUnsafe`:
```javascript
// eslint.config.mjs
{
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'CallExpression[callee.property.name=/queryRawUnsafe|executeRawUnsafe/]',
      message: 'Use $queryRaw (tagged template) instead. $queryRawUnsafe requires security review.',
    }],
  },
}
```

**Migration path:**
Replace `$queryRawUnsafe` with `$queryRaw` (tagged template):
```typescript
// Before (unsafe-looking but actually parameterized)
prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = $1`, userId)

// After (tagged template — impossible to concat)
prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`
```

---

### 10. XSS Prevention

**What:** Prevent injection of malicious scripts.

**Defense layers:**
1. **React auto-escaping** — all JSX interpolations are escaped by default
2. **CSP** — `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`
3. **Email sanitization** — `escapeHtml()` on user fields in email templates
4. **SVG upload risk** — employer logo allowlist includes `svg` ⚠️

**How to verify:**
```bash
# Search for dangerous HTML
grep -r "dangerouslySetInnerHTML" app/ components/ --include="*.tsx" -n
# Review each: should be static/controlled content only

# Check email template escaping
grep -r "escapeHtml" emails/ lib/email/ --include="*.ts" --include="*.tsx" -n
```

**SVG stored XSS fix:**
```typescript
// Option A: Drop SVG from allowlist (safest)
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif']; // no 'svg'

// Option B: Sanitize before upload
import DOMPurify from 'isomorphic-dompurify';
const sanitizedSvg = DOMPurify.sanitize(svgString, { USE_PROFILES: { svg: true } });
```

---

### 11. Webhook Security

**What:** Verify webhook authenticity and prevent timing attacks.

**Current state:**
- Coursera webhook: ✅ header-based + `timingSafeEqual`
- xAPI token: ✅ `timingSafeEqual`
- Learning completion webhook: ❌ body-based + native `!==`

**Fix for `app/api/webhooks/learning-completion/route.ts`:**
```typescript
import { timingSafeEqual } from 'crypto';

// Before
const { secret } = await request.json();
if (secret !== process.env.WEBHOOK_SECRET) return new Response('Unauthorized', { status: 401 });

// After
const providedSecret = request.headers.get('x-webhook-secret') || '';
const expectedSecret = process.env.WEBHOOK_SECRET || '';
if (providedSecret.length !== expectedSecret.length) {
  return new Response('Unauthorized', { status: 401 });
}
const providedBuf = Buffer.from(providedSecret);
const expectedBuf = Buffer.from(expectedSecret);
if (!timingSafeEqual(providedBuf, expectedBuf)) {
  return new Response('Unauthorized', { status: 401 });
}
```

---

### 12. Counselor Scope Verification

**What:** Prevent counselors from modifying members outside their caseload.

**Gap:** `app/api/counselor/placements/route.ts` POST accepts `userId` from body without verifying counselor-member assignment.

**Fix:**
```typescript
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/scope';

export async function POST(request: Request) {
  const user = await requireCounselor(request); // or requireAdminOrCounselor
  const body = await request.json();
  
  // Add this line
  await assertStaffCanAccessMemberRecord(user.id, body.userId);
  
  // ... proceed with placement creation
}
```

**How to verify all counselor routes have scope checks:**
```bash
grep -r "assertStaffCanAccessMemberRecord" app/api/counselor --include="*.ts" -l
# Should list ALL counselor routes that touch member data
```

---

## Infrastructure

### 13. Content Security Policy

**Current CSP:**
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.googletagmanager.com https://va.vercel-insights.com https://challenges.cloudflare.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co ...;
img-src 'self' data: https: blob:;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
frame-src 'self' https://www.googletagmanager.com https://challenges.cloudflare.com;
form-action 'self' https://formspree.io;
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
```

**Safe additions (no nonce needed):**
- ✅ `object-src 'none'` — blocks plugin injection
- ✅ `base-uri 'self'` — prevents base tag hijacking
- ✅ `frame-ancestors 'none'` — clickjacking defense
- ✅ `upgrade-insecure-requests` — forces HTTPS on mixed content

**Debt items (require nonce migration):**
- `CSP-DEBT-001`: Remove `'unsafe-eval'` from `script-src`
- `CSP-DEBT-002`: Remove `'unsafe-inline'` from `script-src` and `style-src`

**Nonce migration steps:**
1. Generate nonce per request in `middleware.ts`:
   ```typescript
   const nonce = crypto.randomUUID();
   requestHeaders.set('x-nonce', nonce);
   ```
2. Pass nonce to `next.config.ts` headers (requires dynamic header generation — Next.js doesn't support dynamic CSP in config; use middleware response headers instead).
3. Update all inline `<script>` tags to include `nonce`.
4. Configure GTM to use nonce (GTM supports `data-nonce` attribute).
5. Extract inline `style` props to CSS modules or add nonces.

**Effort estimate:** 2-3 days + thorough QA.

#### Phase 1 — Report-Only nonce (shipped 2026-09-21, WAP-36)

Step 1 of the migration is live in observe-only mode. Nothing is enforced by it.

- `middleware.ts` mints a 128-bit base64 nonce for every HTML **document**
  request (not API calls, RSC/prefetch payloads, `/sw.js` or other static
  files) and forwards it to server components on the `x-nonce` request
  header. Client-supplied `x-nonce` is stripped first.
- The same middleware sets `Content-Security-Policy-Report-Only` on the
  response. Its directive list is a verbatim copy of the enforced header
  (`lib/security/csp.ts`, parity-tested against `next.config.ts` in
  `tests/lib/csp-policy.spec.ts`) with three changes: `script-src` gains
  `'nonce-<value>' 'strict-dynamic'`, `upgrade-insecure-requests` is dropped
  (browsers ignore it in report-only mode and warn), and `report-uri
  /api/csp-report` + `report-to csp-endpoint` (with a `Reporting-Endpoints`
  header) are added. Under `'strict-dynamic'` browsers ignore
  `'unsafe-inline'` and the host allow-list, so every script that would break
  under a nonce-only policy produces a report while the enforced header keeps
  the page working.
- The Report-Only header is also forwarded on the **request**: Next.js
  (`app-render`) reads the nonce out of `content-security-policy[-report-only]`
  in the request headers and stamps its own framework `<script>` tags with it.
- `app/layout.tsx` stamps `nonce` on the inline scripts it renders:
  `ThemeInitScript`, the chunk-reload guard, `sw-register`,
  `gtm-consent-default` and `gtm`. Known un-nonced inline scripts that WILL
  show up in reports during the soak: `components/portal/WorkspaceShell.tsx`
  (`data-portal-role` first-paint mirror) — stamp it in phase 2.
- `POST /api/csp-report` (`app/api/csp-report/route.ts`) accepts
  `application/csp-report` and `application/reports+json`, refuses bodies over
  16 KB (413), rate-limits 60/min per proxy-trusted IP (same missing-Redis
  policy as `lib/rate-limit.ts`: fail-closed in production unless
  `RATE_LIMIT_ALLOW_MISSING_UPSTASH=1`, fail-open in dev;
  `lib/security/cspReportRateLimit.ts`),
  increments the hourly aggregate described under "Persisted aggregates"
  below and answers 204 (also when the database write fails). GET is 405.

**Reading the reports.** The sink emits one structured log line per distinct
violation per batch: `{"message":"csp.violation","directive":"script-src-elem",
"blockedHost":"inline","documentPath":"/dashboard","disposition":"report","count":3}`.
Only the blocked resource's host (or CSP keyword: `inline`, `eval`, `data`,
`blob`), the directive, the document path (never the query string) and the
disposition are kept — no script samples, source files, user ids or cookies.
In Vercel logs filter on `csp.violation` and group by `directive` +
`blockedHost`; anything not in the enforced allow-list and not `inline`/`eval`
from our own bundles is a real finding. Expect `inline` from `WorkspaceShell`
and third-party tags GTM injects until those are nonced.

**Persisted aggregates and the viewer (phase 2 prep).** Log lines are enough
to notice a violation, not to triage a week of them, so the sink also keeps an
hourly aggregate in `csp_violation_buckets` (Prisma `CspViolationBucket`,
migration `20260921120000_wap36_csp_violation_buckets`): one row per
`(hour_bucket, directive, blocked_host, document_path, disposition)` with a
`count`, `first_seen_at` and `last_seen_at`. The write path
(`lib/security/cspViolationStore.ts`) dedupes each accepted batch first and
issues one `INSERT … ON CONFLICT` upsert per distinct key inside a single
transaction, so a 20-report batch costs at most 20 statements on one pooled
connection (WAP-17). It stores exactly the fields the log line carries — the
redacted route path (`/admin/members/:id`), the host or CSP keyword, the
directive and the disposition — never the raw URL, query string, script
sample, report body, IP address or user agent. A database error is logged as
`csp.violation.persist_failed` and swallowed; the sink still answers 204.

Because the four key columns come from the client, none of them may carry
free text: the directive is kept only when it is in
`CSP_DIRECTIVE_ALLOWLIST` (the CSP Level 3 names plus `report-uri` /
`block-all-mixed-content`), otherwise stored as `other`; the blocked host is a
CSP keyword (`inline`, `eval`, `data`, `blob`, …), an extension scheme, or a
shape-checked RFC 1123 hostname / IP literal with optional port of at most
253 characters, otherwise `invalid`; the document path collapses UUIDs,
numbers, opaque tokens, token-parent segments and any segment containing `@`
or `%40` to `:id` and is hard-capped at 200 characters. On top of that the
store refuses to create new rows once an hour bucket holds
`CSP_VIOLATION_MAX_BUCKETS_PER_HOUR` (2000) distinct keys — existing rows
still increment, the dropped keys are logged once per batch as
`csp.violation.bucket_ceiling` — so a client that mints paths on purpose can
add at most 2000 rows per hour to the table, not 1,200 per hour per IP for a
month. The
table is platform-wide by design (no tenant column: the policy is set once per
deployment), has RLS enabled with a single `SELECT` policy for the
`super_admin` GUC role and no write policies (the sink writes as the table
owner, like the other log-like tables), and is purged on `hour_bucket` after
`CSP_VIOLATION_BUCKET_RETENTION_DAYS` (30) by the daily data-cleanup cron
(`lib/retention/config.ts`), so it can never grow unbounded.

Super admins read it at **`/admin/csp-report`** ("CSP reports" under Advanced
in the admin sidebar; `app/admin/csp-report/page.tsx`, same guard as
`/admin/data-retention`): totals for the last 24 hours and 7 days, the number
of enforced blocks (expected 0 while Report-Only), and a table grouped by
directive + blocked host with the report count, a sample of up to three
document paths, dispositions and first/last seen. The page is read-only and
states that the policy is Report-Only and that the flip is the checklist
below. Triage rule for the soak: a source that is not in the enforced
allow-list and not `inline`/`eval` from our own bundles is a real finding; an
`inline` row on a known page needs a nonce before the flip.

**Phase 2 — the enforce flip (Mike, after a week-long soak with no unexpected
reports).** (1) In `middleware.ts` set `Content-Security-Policy` instead of
`Content-Security-Policy-Report-Only` from `buildCspReportOnlyPolicy` (rename
it) and drop `'unsafe-inline'`/`'unsafe-eval'` from the `script-src` entry in
`lib/security/csp.ts`; (2) remove the static `Content-Security-Policy` header
from `next.config.ts` (two enforcing policies intersect — the stricter wins,
so leaving both is safe but confusing); (3) keep `report-uri`/`report-to` so
regressions still surface; (4) update the parity test to the new shape.
`style-src 'unsafe-inline'` (CSP-DEBT-002) is untouched by this phase.

---

### 14. Security Headers

**How to verify all headers:**
```bash
curl -I https://www.workforceap.org
```

**Expected output:**
```
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(self), microphone=(self), geolocation=()
content-security-policy: ...
```

**How to test locally:**
```bash
npm run build && npm start
# In another terminal:
curl -I http://localhost:3000
# Headers should appear (except HSTS which requires HTTPS)
```

---

### 15. Secrets Management

**Rules:**
1. No secrets in repo ✅ (`.env.example` has placeholders only)
2. No secrets in logs ✅ (health endpoint reports config presence, not values)
3. No secrets in client bundle ✅ (`NEXT_PUBLIC_*` reviewed — all intentionally public)
4. Rotate secrets on team member departure

**Secret inventory:**
| Secret | Env Var | Client-Safe | Rotation Impact |
|--------|---------|-------------|-----------------|
| Supabase anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes (by design) | Log out all users |
| Supabase service role | `SUPABASE_SERVICE_ROLE_KEY` | ❌ No | Breaks server-side DB ops |
| Cron secret | `CRON_SECRET` | ❌ No | Breaks cron jobs until updated |
| Placement survey token | `PLACEMENT_SURVEY_TOKEN_SECRET` | ❌ No | Invalidates pending survey links |
| MFA trust cookie | `AUTH_TRUST_COOKIE_SECRET` | ❌ No | Forces staff MFA re-verification |
| Resend API key | `RESEND_API_KEY` | ❌ No | Email stops sending |
| ElevenLabs API key | `ELEVENLABS_API_KEY` | ❌ No | Voice features return 503 |
| Turnstile secret | `TURNSTILE_SECRET_KEY` | ❌ No | CAPTCHA verification fails |
| Stripe secrets | `STRIPE_*` | ❌ No | Payment processing breaks |
| Coursera tokens | `COURSERA_*` | ❌ No | Learning integration breaks |

**Rotation procedure:**
1. Generate new secret
2. Add to Vercel production env
3. Redeploy
4. Verify functionality
5. Remove old secret from Vercel
6. Update any external systems (webhook URLs, partner configs)

---

### 16. CAPTCHA Configuration

**How to enable:**
```bash
vercel env add NEXT_PUBLIC_CAPTCHA_ENABLED production      # true
vercel env add NEXT_PUBLIC_TURNSTILE_SITE_KEY production     # from Cloudflare Dashboard
vercel env add TURNSTILE_SECRET_KEY production               # from Cloudflare Dashboard
vercel deploy
```

**Verify it's working:**
```bash
curl https://www.workforceap.org/api/health
# Should show: captcha_turnstile: ok
```

**Forms currently protected:**
- Employer contact form (`/employers` page)

**Forms NOT protected (intentional for launch):**
- `/apply/create-account` — rate-limited instead (abuse vs. drop-off balance)
- `/contact` — rate-limited
- Magic link login — Supabase handles anti-abuse

---

## Monitoring & Incident Response

### 17. Sentry Configuration

**Current setup:**
- `sentry.server.config.ts` — server-side errors
- `sentry.edge.config.ts` — edge runtime errors
- `@sentry/nextjs` in `next.config.ts`
- PII filtering: Sentry scrubs common PII fields by default

**How to verify:**
```bash
# Trigger test error
curl https://www.workforceap.org/api/health?trigger-error=test
# Check Sentry dashboard for the error (should appear within 1 minute)
```

**How to verify PII scrubbing:**
```bash
# Check Sentry issues for email addresses, phone numbers, SSN patterns
grep -r "email\|phone\|ssn" your-sentry-exports/
# Should find NO member PII in error contexts
```

**Sentry DSN safety:**
- `NEXT_PUBLIC_SENTRY_DSN` is client-safe by design (Sentry DSNs are meant to be public)
- `SENTRY_AUTH_TOKEN` (for source maps) is build-time only — not in client bundle ✅

---

### 18. Audit Logging

**Current implementation:** `lib/audit.ts`
```typescript
await auditLog({
  actorUserId: user.id,
  action: 'MEMBER_PLACEMENT_CREATED',
  targetType: 'placement_records',
  targetId: placementId,
  metadata: { salary: body.salary, employerId: body.employerId },
});
```

**Where it's used:** ~7 API routes (admin mutations)

**Where it should be expanded:**
- All admin identity-mapping mutations (`app/api/admin/coursera/*`)
- Role changes (`app/api/admin/roles/*`)
- Member deletions
- Counselor assignment changes
- Employer/partner approval actions

**How to add to a route:**
```typescript
import { auditLog } from '@/lib/audit';

// After successful mutation
await auditLog({
  actorUserId: user.id,
  action: 'ADMIN_COURSERA_MAPPING_CREATED',
  targetType: 'coursera_identity_mappings',
  targetId: mapping.id,
  metadata: { courseraUserId: body.courseraUserId, programId: body.programId },
});
```

---

### 19. Incident Response Plan

**Create `docs/INCIDENT-RESPONSE.md` with:**

1. **Severity levels:**
   - SEV1 — Data breach, production down, active exploit
   - SEV2 — Partial outage, potential data exposure
   - SEV3 — Single feature broken, no data risk

2. **Response team:**
   - Incident commander: Mike (michael.brown2@workforceap.org)
   - Technical lead: (designate)
   - Communications: (designate)

3. **Response steps:**
   - Detect → Alert via Sentry/PagerDuty
   - Triage → Classify severity within 15 minutes
   - Contain → Disable affected feature, rotate compromised secrets
   - Eradicate → Deploy fix
   - Recover → Verify fix, restore service
   - Post-mortem → Within 48 hours for SEV1/SEV2

4. **Contact info:**
   - Supabase support: https://supabase.com/dashboard/support
   - Vercel support: https://vercel.com/help
   - Sentry support: https://sentry.io/contact/support/

5. **Runbook for common incidents:**
   - Suspected data breach: freeze DB writes, export audit logs, notify legal
   - DDoS attack: enable Vercel Attack Challenge Mode, scale up
   - Credential leak: rotate all secrets, force password resets, review audit logs

---

### 20. Backup & Recovery

**Supabase automated backups:**
- Daily backups retained for 7 days (Pro plan)
- Point-in-time recovery available

**How to test recovery:**
1. Create staging environment
2. Restore from production backup
3. Verify data integrity:
   ```sql
   SELECT COUNT(*) FROM users;
   SELECT COUNT(*) FROM profiles;
   SELECT COUNT(*) FROM audit_logs;
   ```
4. Verify application connectivity

**How to create manual backup:**
```bash
# Using Supabase CLI
supabase db dump -f backup-$(date +%Y%m%d).sql
```

**Storage bucket backups:**
- Supabase Storage does not auto-backup
- Enable S3 replication or schedule periodic exports for `member-resumes` and `voice-interview-recordings`

---

## Recommended Tools

### Dependency Scanning

**Snyk (recommended):**
```bash
npm install -g snyk
snyk auth
snyk test                    # One-time scan
snyk monitor                 # Continuous monitoring
snyk code test               # SAST (static analysis)
```

**Dependabot (free, GitHub-native):**
1. Go to repo Settings → Security → Code security and analysis
2. Enable Dependabot alerts
3. Enable Dependabot security updates

**npm audit:**
```bash
npm audit                    # Report
npm audit fix               # Auto-fix where possible
```

### Penetration Testing

**OWASP ZAP (free):**
```bash
# Download from https://www.zaproxy.org/download/
# Quick start: point ZAP at https://www.workforceap.org
# Run automated scan, review alerts
```

**Burp Suite Community (free):**
- Good for manual API testing
- Test auth bypass, IDOR, injection vectors

### CSP Testing

```bash
# Google CSP Evaluator
https://csp-evaluator.withgoogle.com/
# Paste your CSP header value, review warnings

# Mozilla Observatory
https://observatory.mozilla.org/
# Scan https://www.workforceap.org for header grades
```

### SSL/TLS Testing

```bash
# SSL Labs
https://www.ssllabs.com/ssltest/analyze.html?d=workforceap.org

# Command line
npx ssllabs-cli https://www.workforceap.org

# Check certificate expiry
echo | openssl s_client -servername workforceap.org -connect workforceap.org:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Quick Reference Commands

```bash
# ============================================================
# SECURITY VERIFICATION COMMANDS
# ============================================================

# --- Headers ---
curl -I https://www.workforceap.org | grep -E "(strict-transport|x-frame|x-content|referrer|content-security|permissions)"

# --- Cookie security ---
curl -I -c - https://www.workforceap.org | grep -i "Set-Cookie"

# --- Rate limit test (login) ---
for i in {1..25}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://www.workforceap.org/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done

# --- Find unguarded API routes ---
grep -rL "getUser\|getSession\|authorizeCronRequest" app/api --include="route.ts"

# --- Find auditLog coverage ---
grep -r "auditLog" app/api --include="*.ts" -l | wc -l
echo "out of"
find app/api -name "route.ts" | wc -l

# --- Find SQL injection risk ---
grep -r "queryRawUnsafe\|executeRawUnsafe" app/ lib/ --include="*.ts" -n

# --- Find dangerouslySetInnerHTML ---
grep -r "dangerouslySetInnerHTML" app/ components/ --include="*.tsx" -n

# --- Find SVG upload risk ---
grep -r "svg" app/api/employer/logo --include="*.ts" -n

# --- Check RLS status (requires psql) ---
psql $DATABASE_URL -c "\dt *"
# Then check each P0 table for RLS:
psql $DATABASE_URL -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'users';"

# --- Sentry test ---
curl "https://www.workforceap.org/api/health?test-sentry=$(date +%s)"

# --- Dependency audit ---
npm audit

# --- Environment variable review ---
# Ensure no NEXT_PUBLIC_ prefix on secrets:
grep "^NEXT_PUBLIC_" .env.example
# Should only show intentionally public values

# ============================================================
# PRODUCTION DEPLOY CHECKLIST (copy into PR)
# ============================================================
# [ ] STAFF_MFA_ENFORCEMENT=1 in production env
# [ ] NEXT_PUBLIC_CAPTCHA_ENABLED=true + Turnstile keys set
# [ ] CRON_SECRET is set and >= 32 hex chars
# [ ] AUTH_TRUST_COOKIE_SECRET is set and >= 32 hex chars
# [ ] PLACEMENT_SURVEY_TOKEN_SECRET is set and >= 32 hex chars
# [ ] UPSTASH_REDIS_REST_URL + TOKEN set (rate limiting)
# [ ] SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN set
# [ ] All COURSERA_* secrets set (if using learning integration)
# [ ] STRIPE_* secrets set (if using payments)
# [ ] RESEND_API_KEY + EMAIL_FROM set
# [ ] ELEVENLABS_API_KEY set (if using voice features)
# [ ] Security headers verified via curl
# [ ] SSL Labs A+ rating confirmed
# [ ] Rate limit tested on auth endpoints
# [ ] No secrets in client bundle (npm run build + check .next/static)
# [ ] RLS migration NOT deployed yet (wait for GUC middleware)
```

---

*Document history:*
| Date | Change |
|------|--------|
| 2026-05-13 | Initial hardening guide — consolidated from all security audits and codebase review |
