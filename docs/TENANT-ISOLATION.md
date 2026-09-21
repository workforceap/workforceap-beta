# Tenant Isolation — Architecture & Invariants

**Track:** A (Tenant Isolation Hardening) of the enterprise-grade program. See `docs/PROGRAM-ENTERPRISE-GRADE.md`.
**Status:** Sprint A.1 (foundation) — this doc, the helper, the audit, the test.

> The single most important question a procurement officer asks: *"if I'm AAUL, can NPower's admin see my members?"* Today the answer is "they shouldn't, but I can't prove it without an audit." After this track, the answer is *"no — here's the test that fails CI on a regression."*

---

## Today's reality (current-state audit)

### Schema is multi-tenant ready

Ten models carry `organizationId` as their tenant boundary:

| Model | Cardinality | What it scopes |
|---|---|---|
| `User` | 1:N | All members, admins, counselors, employers — every human in the system |
| `Partner` | 1:N | Referral-source organizations |
| `Employer` | 1:N | Hiring organizations |
| `Job` | 1:N | Posted positions |
| `Course` | 1:N | Org-specific course catalog |
| `CourseEnrollment` | 1:N | Per-member program enrollment |
| `OrganizationProgramCatalog` | 1:N | Org-specific program offerings |
| `PreScreeningResponse` | 1:N | Pre-screening answers |
| `ApplyEligibilityScreening` | 1:N | Apply-flow eligibility answers (q1/q2/q3) |
| `PublicWioaScreening` | 1:N | Anonymous WIOA qualification submissions |

**Tenant inheritance**: tables not directly scoped (`Application`, `JobApplication`, `Profile`, `MemberEvent`, `PlacementRecord`, `Message`, `MessageThread`, `CourseProgress`, `Goal`, `AIToolResult`, etc.) inherit their tenant via FK to a scoped row. E.g. `Application.userId → User.organizationId`.

### Production is single-tenant

- `lib/tenant/organization.ts` exposes `getDefaultOrganizationId()` returning the seeded `workforceap` org
- All write paths (signup, admin create-member, etc.) tag new rows with that org
- All read paths assume there's only one org and don't filter

This is fine **today** because there's only one tenant. It's a **gating issue** the moment WorkforceAP licenses to AAUL or any second org.

### What's missing

1. **Read enforcement** — there is no helper that *requires* an `organizationId` filter. A dev writing a new admin endpoint can `prisma.user.findMany()` with no scope and the query returns every user across every tenant.
2. **CI gate** — no test currently asserts that an admin from Org A cannot see Org B's data via any endpoint.
3. **DB-level enforcement** — Postgres RLS policies do not exist on tenant-scoped tables. The connecting role is privileged enough that even if RLS were enabled, queries would bypass it.
4. **Audit trail** — `audit_logs` records actor + action but doesn't record *which tenant* the action affected, making cross-tenant leak detection impossible from logs.

---

## Target architecture

Defense in depth — three layers, any one of which would prevent a leak:

### Layer 1 — Application-layer scoping (`withTenantScope`)

Every API endpoint that touches tenant data **must** wrap its Prisma calls in:

```ts
withTenantScope(orgId, async (tx) => {
  // tx is a tenant-scoped Prisma client.
  // Reads/writes against tenant-scoped models auto-include
  // `where: { organizationId: orgId }` (or assert it via runtime check).
  return tx.user.findMany({ ... });
});
```

Authenticated handlers usually resolve `orgId` with `getActorOrganizationId(sessionUserId)` (admin/counselor acting in their home tenant) or with the **subject** employer/partner row's `organizationId` when the portal context is implied by `employerId` / `partnerId` (see below). Convenience wrapper:

```ts
import { withActorTenantScope } from '@/lib/tenant/withTenantScope';

await withActorTenantScope(user.id, (db) => db.user.findMany({ ... }));
```

The helper:

- Takes the resolved `orgId` once (from the authenticated user's `User.organizationId`)
- Returns a Prisma-typed wrapper that **runtime-asserts** every call to a tenant-scoped model includes the right `organizationId`
- Throws `TenantScopeViolation` if a query escapes — caught by middleware, sentry-captured, returns 500
- Cached lookup so the assertion is cheap

This is the **primary** line of defense. If every endpoint goes through `withTenantScope`, application-layer scoping is enforced and CI tests can prove it.

### High-risk route checklist (Track A batch)

These endpoints historically aggregated or listed rows without an org filter; they are guarded in-code and checked by `npm run check:tenant-routes` (runs in CI).

| Surface | Scope source | Pattern |
|--------|----------------|---------|
| `GET /api/admin/members` | `getActorOrganizationId(adminUserId)` | `withTenantScope` on `user.findMany` |
| `GET /api/admin/metrics` + `getAdminMetrics` | Actor org | All aggregates filter by org; **cache key** includes `orgId` so tenants never share a cached payload |
| `GET /api/counselor/inactive-members` | Actor org | Raw SQL adds `users.organization_id = $orgId` |
| `GET /api/employer/jobs` | Employer row | `withTenantScope(employer.organizationId)` on `job.findMany` |
| Partner referrals (`loadPartnerReferralBundle`, `/api/partner/referral-members`, …) | Partner row | `partner.organizationId` + `member.organizationId` on referral queries; `ctx.partner.organizationId` threaded from `getPartnerForUser` |
| Admin SSR residual pages (`/admin` home, members list/detail/new/training, placements, partners, programs, assessments, subgroups, Coursera roster, sessions run, weekly-recap, …) plus `loadTrainingDashboardData` / `getTriageDigest` (which reads the org-scoped attention roster in `lib/attention/admin.ts`) | `resolveAdminPageTenant` → actor org | `isAdminInOrg` + `withAdminPageScope`. **Super-admin stays cross-tenant** (support / ops). Org admins use `withTenantScope` plus FK helpers (`inheritUserOrg` / `inheritMemberOrg` / `inheritLeaderOrg` / `inheritInvitedByOrg`) for models without `organizationId`. Settings / feature-flags / crons / diagnostics still require `isAdminInOrg` even when the payload is org-config or ops. |
| Member program / Coursera support mutations (`/api/admin/members/[id]/program`, `/api/admin/members/[id]/coursera-enrollment-approval`, `/api/admin/coursera/enroll-member`) | Verified subject member org | Org admins must match the subject org. Super-admin support may act in the subject org after resolving the member server-side; denied and missing subject IDs both return 404. Client-supplied organization IDs are never trusted. |

**Adding a new high-risk read:** thread `organizationId` from the authenticated actor or from the portal parent row (never from client input alone), use `withTenantScope` for tenant-scoped models, and for FK-scoped models use `where: { user: { organizationId: orgId } }` (or the appropriate parent relation). Register the route in `scripts/verify-high-risk-tenant-routes.cjs` if it bulk-loads PII or aggregates cross-member metrics.

### Layer 2 — CI test (`tests/tenant-isolation.test.ts`)

A fixture-based test that:

1. Seeds two orgs (`org-a`, `org-b`) with disjoint members, jobs, employers, partners
2. Creates an admin user in each org
3. For every admin endpoint in a registry list, fires the request authenticated as Org A's admin
4. Asserts the response **never** contains any Org B identifier (UUID match against the Org B fixture set)

This test is run in CI on every PR. A new endpoint that hasn't been registered fails. A registered endpoint that leaks fails. The signal is binary.

### Layer 3 — Postgres RLS (Sprint A.3, deferred)

Defense in depth: even if app-layer scoping were bypassed, the database itself would refuse to return another tenant's rows.

- `ALTER TABLE users ENABLE ROW LEVEL SECURITY`
- `CREATE POLICY tenant_isolation ON users USING (organization_id::text = current_setting('app.current_org_id'))`
- A Prisma extension that runs `SET LOCAL app.current_org_id = $1` at the start of every transaction
- The connecting role configured to honor RLS (i.e. not a superuser)

This is **Sprint A.3** because enabling RLS on tables an app currently queries without setting the GUC will return empty results — production-breaking unless every endpoint has been migrated to the new pattern first.

---

## Invariants this track must hold

These are testable. Every Track A PR must preserve them.

### I-1: No tenant-scoped Prisma read outside `withTenantScope`

**Test:** static-analysis script that scans `app/`, `lib/`, `components/` for `prisma.<scopedModel>.{findMany|findFirst|findUnique|count|aggregate}` calls. Any hit not wrapped in `withTenantScope` (or explicitly allowlisted as a cross-tenant utility, e.g. `getDefaultOrganizationId`) fails the script.

### I-2: No admin endpoint returns another tenant's data

**Test:** `tests/tenant-isolation.test.ts` — fixture two orgs, fire every registered endpoint as Org A's admin, assert no Org B UUID in the response.

### I-3: No write path tags a row with an unauthorized tenant

**Test:** the admin "create member" / "create job" / "assign counselor" endpoints, when called by an Org A admin with body `{ organizationId: 'org-b' }`, must reject the request (or silently overwrite to Org A's id). Org admins remain bound to their actor org. The audited exception is a platform super-admin support mutation that first resolves an existing subject member server-side and scopes the write to that member's organization. Assert both the regular-admin rejection and super-admin subject-org path via fixtures.

### I-4: Audit log records the affected tenant

**Test:** every `auditLog()` call now requires an `organizationId` parameter. The audit_log table gains a `tenant_org_id` column. Test: fire an admin action; the resulting audit row has the matching tenant id.

### I-5: FK targets to tenant-scoped models share the actor's tenant

**Why:** the application-layer proxy (`withTenantScope`) injects `organizationId` on the row being written, but it does not verify that *other* foreign-key targets belong to the same tenant. Concretely: an admin in Org A who controls the request body could send `data: { employerId: '<org-b-employer-id>', ... }` to a job-create endpoint. The proxy stamps `organizationId: orgA` on the new row, but the row's `employerId` points at an Org B parent. Any later read via `include: { employer: true }` exposes Org B's employer data.

**Interim mitigation (Sprint A.2):** every migrated endpoint that accepts a user-controlled FK to a tenant-scoped model must call `assertSameTenant(model, id, expectedOrgId)` before the write. It uses the unscoped client to fetch the parent's `organizationId` and throws `TenantScopeViolation` on mismatch (also throws on not-found, so an Org A admin can't probe whether an Org B id exists).

**Structural fix (Sprint A.3):** Postgres CHECK constraints on cross-tenant FKs (`CHECK (employer.organization_id = job.organization_id)`) plus RLS row-level policies. This makes the invariant impossible to violate even with raw SQL or a buggy migration.

**Test:** Org A admin POSTs a job with `employerId` of an Org B employer → expect 400 (rejected by `assertSameTenant`), no row written, no leak in any later GET.

Codex P2 catch on PR #1041 (commit 5db07b2bc9). Documented to make it tractable; per-callsite enforcement rolls out across the Sprint A.2 migration batches.

---

## Allowlist — legitimately cross-tenant operations

Some operations cross tenants by design. These get explicit annotation and review:

- **`getDefaultOrganizationId()`** — single-tenant lookup at write time
- **Super-admin debug endpoints** — `isSuperAdmin(userId)` is the gate; logs the action
- **Super-admin subject-member support mutations** — program assignment, Coursera approval, and paid Coursera enrollment resolve the member and subject organization server-side; org admins cannot cross tenants
- **System cron jobs** that aggregate across tenants for platform-wide metrics (e.g. monthly Coursera sync) — wrapped in `withSystemScope()`, audited, doc'd
- **`getBoardSnapshot()`** in `lib/admin/boardOutcomes.ts` — currently aggregates platform-wide; will be scoped to the requesting admin's org in Sprint A.2
- **Inbound xAPI identity resolution** (`lib/xapi/mappings.ts` direct-email lookup, `recordXapiEvent` org lookup, `upsertCourseraIdentityMapping` user lookup; `lib/xapi/reprocess.ts` direct-email candidates) — a statement carries an actor, not a tenant, so the `users` read runs under the system GUC (`withSystemGuc`, inside `$transaction`) and is marked `crossTenantOK`. Each read still narrows by `organizationId` where the caller has one (WAP-24, 2026-09-21).

Anything not on this list must be tenant-scoped.

---

## Migration approach (Sprint A.2)

After this PR (foundation) lands:

1. **Per-endpoint PRs** — each endpoint that touches tenant data gets a dedicated PR migrating it to `withTenantScope`. Small, verifiable, easy to roll back.
2. **The CI isolation test grows** — each PR adds the migrated endpoint to the registry, so the test surface expands.
3. **Audit script trends to zero** — the script's "violations remaining" count is the migration burndown chart.

Estimated 30 endpoints to migrate. ~3-5 per PR, ~6-10 PRs for full migration.

---

## What this PR (Sprint A.1) ships

- ✅ This doc + the program plan (`docs/PROGRAM-ENTERPRISE-GRADE.md`)
- ✅ `lib/tenant/withTenantScope.ts` — the foundation helper
- ✅ `scripts/audit-tenant-scoping.cjs` — the static-analysis script. Since 2026-09-21 (WAP-24) it is also a required CI gate: `ci-gate.yml` runs it with `--max-unscoped <pin>` and fails when the UNSCOPED count exceeds the pin; when a PR lowers the count the script asks for the pin to be lowered in the same PR. The pin only goes down.
- ✅ One reference endpoint migration — demonstrates the pattern
- ✅ `tests/tenant-isolation.test.ts` — fixture seeds, isolation assertion for the migrated endpoint

What this PR **does not** do:
- Does not enable RLS (Sprint A.3)
- Does not migrate other endpoints (Sprint A.2)
- Does not modify the audit log schema (Sprint A.2)
- Does not change production behavior — every existing endpoint keeps working exactly as it does today

---

## How to review this PR

1. Read this doc + the program plan
2. Read `lib/tenant/withTenantScope.ts` — the API surface
3. Run `node scripts/audit-tenant-scoping.cjs` — see the current violation count (`--max-unscoped <n>` is what CI runs; the pin lives in `.github/workflows/ci-gate.yml`)
4. Read the migrated endpoint's diff — note how short the change is
5. Run the isolation test — confirm it passes for the migrated endpoint and fails (intentionally documented) for the un-migrated comparison

---

## Document history

| Date | Change |
|---|---|
| 2026-08-27 | Documented subject-member scoping for admin program assignment and Coursera approval/enrollment: org admins stay same-tenant; super-admin support writes use the verified member org. |
| 2026-08-24 | Residual admin SSR pages + overview helpers (`loadTrainingDashboardData`, `getTriageDigest`): `resolveAdminPageTenant` + `withAdminPageScope`. Super-admin remains cross-tenant. |
| 2026-05-08 | Initial doc; Sprint A.1 in flight |

---

*Update on every Track A PR landing.*

---


## Track E.1 — Custom-domain → organization resolution

As of Sprint E.1 PR 1, an `Organization` can be resolved from the request
`Host` header via the `customDomain` field in the schema. This is the
plumbing for white-label deployments (e.g. `aaul.workforceap.org` ->
the AAUL org with their branding).

### Resolution pipeline

```
   Request
      |
      v
  middleware.ts (Edge runtime)
      |
      |-- normalizes Host header -> `x-wap-host`
      |-- consults customDomainCache (in-memory, 60s TTL)
      |-- if hit: sets `x-wap-org-id`
      |-- if miss/canonical: leaves `x-wap-org-id` unset
      v
   Server component / API route (Node runtime)
      |
      v
   resolveOrgFromRequest(headers)
      |
      |-- if `x-wap-org-id` is set: return it (fast path)
      |-- else: read `x-wap-host`, look up customDomain in Prisma,
      |         populate cache, return resolved orgId
      |-- else: fall back to getDefaultOrganizationId()
```

### Files

| File | Runtime | Purpose |
|------|---------|---------|
| `middleware.ts` | Edge | Reads Host, normalizes, sets `x-wap-host` and (on cache hit) `x-wap-org-id`. **Never calls Prisma.** |
| `lib/tenant/hostMatch.ts` | Edge-safe pure utils | `normalizeHost`, `isCanonicalHost`. Lowercases, strips port, identifies canonical/local hosts. |
| `lib/tenant/customDomainCache.ts` | Edge-safe (Map + Date.now) | Process-local 60s TTL cache of normalized host -> orgId. Caches a `NO_ORG_SENTINEL` for confirmed misses to avoid repeat DB hits. |
| `lib/tenant/resolveOrgFromRequest.ts` | Node | `resolveOrgFromRequest(headers)` → orgId (with default fallback). `tryResolveOrgFromRequest(headers)` → orgId or `null`. Calls Prisma on cache miss. |
| `lib/tenant/organization.ts` | Node | Existing `getDefaultOrganizationId()` (slug `workforceap`). Used as fallback. |

### Canonical hosts (no override)

These hosts always resolve to the default `workforceap` tenant — they are
NEVER looked up against `customDomain`:

- `workforceap.org`, `www.workforceap.org`
- `workforceap.com`, `www.workforceap.com`
- `*.vercel.app` (preview deployments)
- `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`

Subdomains under `workforceap.org` (e.g. `aaul.workforceap.org`) are
**NOT** treated as canonical — they go through `customDomain` lookup so
tenants can use vanity subdomains.

### How to read the active org in your code

**Server component / route handler (App Router):**

```ts
import { headers } from 'next/headers';
import { resolveOrgFromRequest } from '@/lib/tenant/resolveOrgFromRequest';

export default async function Page() {
  const orgId = await resolveOrgFromRequest(await headers());
  // …
}
```

**API route (`app/api/.../route.ts`):**

```ts
import { resolveOrgFromRequest } from '@/lib/tenant/resolveOrgFromRequest';

export async function GET(request: Request) {
  const orgId = await resolveOrgFromRequest(request.headers);
  // …
}
```

If you want orgId-or-null without the default-org fallback (e.g. for
analytics or feature flags that should ONLY fire for white-label
tenants), use `tryResolveOrgFromRequest(headers)`.

### Edge runtime constraint

Middleware runs on the Edge runtime, where Prisma is unavailable. We
cannot do `prisma.organization.findUnique({ where: { customDomain } })`
there. Instead:

- Middleware only **reads** `customDomainCache` (a plain `Map` — Edge-safe).
- The cache is **populated** by `resolveOrgFromRequest()` calls during
  Node-runtime request handling (server components, API routes).
- TTL is 60s, so a deleted/renamed customDomain stops resolving within
  a minute without redeploy.

This means the **first request** to a brand-new customDomain hits the
DB once via the resolver in a Node-runtime handler, then subsequent
requests in the same isolate are served from the in-process cache.

### What is NOT yet implemented (next PRs)

- Existing call sites still use `getDefaultOrganizationId()` directly.
  No production code currently routes through `resolveOrgFromRequest`.
  The next PR migrates the high-traffic code paths.
- Email templates still hard-code WorkforceAP branding (Track E.2).
- `withTenantScope` / RLS work lives in Track A and is intentionally
  not modified by this PR.
- No build-time pre-warm of the cache. Considered for a later PR if
  cold-start DB hits become an issue.

---

## Default organization fallback

Single-tenant code paths use `getDefaultOrganizationId()` from
`lib/tenant/organization.ts`, which looks up the org with slug
`workforceap` (seeded by `prisma/seed.ts`) and caches it in module scope.

`resolveOrgFromRequest` falls back to this for canonical hosts and
unknown custom domains, which preserves backward compatibility for any
caller that hasn't been migrated yet.
