#!/usr/bin/env node
/**
 * CI guardrail: ensures high-risk tenant-boundary routes keep explicit org scoping.
 * See docs/TENANT-ISOLATION.md — "High-risk route checklist".
 *
 * Usage: node scripts/verify-high-risk-tenant-routes.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function fail(msg) {
  console.error(`[verify-high-risk-tenant-routes] ${msg}`);
  process.exit(1);
}

/** @param {string} rel @param {string[]} needles */
function assertContains(rel, needles, label) {
  const src = read(rel);
  for (const n of needles) {
    if (!src.includes(n)) {
      fail(`${rel} missing required fragment for ${label}: expected "${n}"`);
    }
  }
}

/** @param {string} rel @param {RegExp} pattern */
function assertMatches(rel, pattern, label) {
  const src = read(rel);
  if (!pattern.test(src)) {
    fail(`${rel} missing required structure for ${label}: expected ${pattern}`);
  }
}

assertContains(
  'app/api/admin/members/route.ts',
  ['getActorOrganizationId', 'withTenantScope'],
  'admin members list',
);

assertContains(
  'app/api/admin/metrics/route.ts',
  ["getActorOrganizationId(user.id)", "['admin-api-metrics-v1', orgId]", 'computeAdminRouteMetricsPayload'],
  'admin metrics API (per-org cache + scoped compute)',
);

assertMatches(
  'lib/admin/metrics.ts',
  /export\s+async\s+function\s+getAdminMetrics\s*\(\s*orgId:\s*string,\s*opts:\s*\{\s*readOnlyAudit\?:\s*boolean\s*\}\s*=\s*\{\s*\},?\s*\)/,
  'scoped getAdminMetrics signature',
);
assertContains('lib/admin/metrics.ts', ['memberInOrg'], 'scoped getAdminMetrics query');

assertContains(
  'app/api/counselor/inactive-members/route.ts',
  ['getActorOrganizationId', 'buildInactiveMembersQuery'],
  'counselor inactive roster uses getActorOrganizationId + query builder',
);

assertContains(
  'app/api/counselor/inactive-members/_inactiveMembersQuery.ts',
  ['u.organization_id = ${orgId}'],
  'counselor inactive roster query builder scopes by orgId',
);

assertContains(
  'app/api/employer/jobs/route.ts',
  ['withTenantScope', 'employerScope.organizationId'],
  'employer job list',
);

assertContains(
  'app/api/partner/referral-members/route.ts',
  ['loadPartnerReferralBundle(ctx.partnerId, ctx.partner.organizationId)'],
  'partner referral members',
);

assertContains(
  'lib/partner/referralBundle.ts',
  ['tenantOrganizationId', 'partner: { organizationId: tenantOrganizationId }'],
  'referral bundle tenant filter',
);

assertContains(
  'lib/auth/roles.ts',
  ['organizationId: true', 'PARTNER_BRANDING_SELECT'],
  'partner context carries organizationId',
);

// --- AUDIT-2026-05-16 expansion: cross-tenant routes flagged in PR 2 ---

assertContains(
  'lib/counselor/staffMemberAccess.ts',
  ['isAdminInOrg', 'member.organizationId'],
  'counselor staff member access uses isAdminInOrg, not global isAdmin (AUDIT §C-T1)',
);

assertContains(
  'app/api/invite/accept/route.ts',
  ['invitation.invitedById', 'inviter?.organizationId'],
  'invite/accept resolves org from inviter, not getDefaultOrganizationId (AUDIT §C-T2)',
);

assertContains(
  'app/api/admin/members/merge/route.ts',
  ['assertMergeTenantOk', 'isAdminInOrg'],
  'admin/members/merge has tenant gate (AUDIT §C-T3)',
);

assertContains(
  'app/api/admin/subgroups/[id]/members/route.ts',
  ['subgroupOrgId', 'isAdminInOrg'],
  'admin/subgroups/[id]/members enforces tenant scope (AUDIT §C-T4)',
);

assertContains(
  'app/api/partner/referrals/route.ts',
  [
    'tx.partnerReferral.findFirst',
    'partnerId: ctx.partnerId',
    'partner: { organizationId: ctx.partner.organizationId, active: true }',
    'if (!referral)',
  ],
  'partner/referrals POST only acknowledges an existing authorized relationship (AUDIT §C-T5)',
);
assertMatches(
  'app/api/partner/referrals/route.ts',
  /member:\s*\{\s*organizationId:\s*ctx\.partner\.organizationId,\s*deletedAt:\s*null,\s*\.\.\.MEMBER_ONLY_WHERE,?\s*\}/,
  'partner referral must reference an active member in the partner organization',
);
if (/partnerReferral\.(create|createMany|upsert)\s*\(/.test(read('app/api/partner/referrals/route.ts'))) {
  fail('partner/referrals must not create a relationship that grants member access; use the authorized application/admin flow');
}

assertContains(
  'app/api/admin/employers/[id]/approve/route.ts',
  ['getActorOrganizationId(user.id)'],
  'admin/employers/[id]/approve uses actor org, not default (AUDIT §C-T7)',
);

assertContains(
  'app/api/admin/employers/[id]/reject/route.ts',
  ['getActorOrganizationId(user.id)'],
  'admin/employers/[id]/reject uses actor org, not default (AUDIT §C-T7)',
);

assertContains(
  'app/api/admin/invites/route.ts',
  ['leader: { select: { organizationId: true } }', 'p.organizationId !== actorOrgId'],
  'admin/invites POST tenant-scopes subgroupId/partnerId (AUDIT §C-T8)',
);

assertContains(
  'app/api/admin/invites/[id]/resend/route.ts',
  ['invitedBy: { organizationId: actorOrgId!'],
  'admin/invites/[id]/resend scopes by inviter org (AUDIT §H-T1)',
);

assertContains(
  'app/api/admin/partners/[id]/route.ts',
  ['leader: { organizationId: orgId }'],
  'admin/partners/[id] subgroupIds filter is tenant-scoped (AUDIT §H-T2)',
);

assertContains(
  'lib/auth/server.ts',
  ['orgId: userRow?.organizationId'],
  'resolveAuthGucContext looks up orgId from user row (AUDIT §C-T6)',
);

assertContains(
  'app/api/admin/members/export/route.ts',
  ["action: 'admin.export.members'"],
  'admin/members/export emits an auditLog (AUDIT §H-DEP4)',
);

assertContains(
  'app/api/admin/cohort-export/route.ts',
  ["action: 'admin.export.cohort'"],
  'admin/cohort-export emits an auditLog (AUDIT §H-DEP4)',
);

assertContains(
  'app/api/admin/reports/wioa/route.ts',
  ["action: 'admin.report.wioa'"],
  'admin/reports/wioa emits an auditLog (AUDIT §H-DEP4)',
);

assertContains(
  'app/api/admin/members/export/route.ts',
  ['logAuditEvent', "verb: 'exported'", "object: { type: 'MemberRoster', id: 'members' }", 'auditRequestMeta(request)'],
  'admin/members/export emits an xAPI-shaped audit event (AUDIT §H-DEP4)',
);

assertContains(
  'app/api/admin/cohort-export/route.ts',
  ['logAuditEvent', "verb: 'exported'", "object: { type: 'CohortExport', id: slug }", 'auditRequestMeta(req)'],
  'admin/cohort-export emits an xAPI-shaped audit event (AUDIT §H-DEP4)',
);

assertContains(
  'app/api/admin/employers/export/route.ts',
  ['logAuditEvent', "verb: 'exported'", "object: { type: 'EmployerDirectoryExport', id: 'employers' }", 'auditRequestMeta(request)'],
  'admin/employers/export emits an xAPI-shaped audit event (AUDIT §H-DEP4)',
);

assertContains(
  'app/api/admin/partners/export/route.ts',
  ['logAuditEvent', "verb: 'exported'", "object: { type: 'PartnerDirectoryExport', id: 'partners' }", 'auditRequestMeta(request)'],
  'admin/partners/export emits an xAPI-shaped audit event (AUDIT §H-DEP4)',
);

assertContains(
  'app/api/admin/reports/wioa/route.ts',
  ['logAuditEvent', "verb: 'viewed'", "object: { type: 'WioaReport'", 'auditRequestMeta(req)'],
  'admin/reports/wioa emits an xAPI-shaped audit event (AUDIT §H-DEP4)',
);

assertContains(
  'app/api/admin/members/bulk-email/route.ts',
  ['logAuditEvent', "verb: 'emailed'", "object: { type: 'MemberBulkEmail', id: member.id }", 'auditRequestMeta(request)'],
  'admin/members/bulk-email emits an xAPI-shaped audit event (AUDIT §H-DEP4)',
);

assertContains(
  'app/api/admin/members/bulk-update/route.ts',
  ['logAuditEvent', "verb: 'updated'", "object: { type: 'MemberBulkUpdate', id: member.id }", 'auditRequestMeta(request)'],
  'admin/members/bulk-update emits an xAPI-shaped audit event (AUDIT §H-DEP4)',
);

// --- Sprint 3 FORCE RLS prep expansion (plan #1393): money paths, PII exports, staff access ---

assertContains(
  'app/api/admin/partner-payouts/route.ts',
  ['getActorOrganizationId', 'withTenantScope'],
  'admin partner-payouts list/mark-paid is tenant-scoped (money path)',
);

assertContains(
  'app/api/partner/payout/route.ts',
  ['getActorOrganizationId(user.id)', 'withTenantScope', 'organizationId: orgId'],
  'partner payout request scopes partner + placement to actor org (money path)',
);

assertContains(
  'app/api/admin/placements/route.ts',
  ['memberInOrg(orgId)', "assertSameTenant('user', userId, orgId)"],
  'admin placements scoped through member FK (PlacementRecord has no organizationId; withTenantScope alone is a no-op here)',
);

assertContains(
  'app/api/admin/users/route.ts',
  ['getActorOrganizationId', 'withTenantScope'],
  'admin users list/create is tenant-scoped (PII)',
);

assertContains(
  'app/api/partner/export/referrals/route.ts',
  ['loadPartnerReferralBundle(ctx.partnerId, ctx.partner.organizationId)'],
  'partner referral export uses tenant-filtered bundle (PII export)',
);

assertContains(
  'app/api/employer/applications/route.ts',
  ['job: { employerId: ctx.employerId }'],
  'employer applications list scopes by owning employer (applicant PII)',
);

assertContains(
  'app/api/partner/earnings/route.ts',
  ['partnerId: ctx.partnerId', 'isReferralPartner'],
  'partner earnings scoped to own partner + referral-partner gate (money path)',
);

assertContains(
  'app/api/counselor/members/[memberId]/route.ts',
  ['assertStaffCanAccessMemberRecord'],
  'counselor member detail goes through staff access gate',
);

// token-links: getSubjectOrganizationId is a cross-tenant lookup that is only
// safe behind resolveActOnBehalf (TODO-005 fix, 2026-06-12). The gate must run
// BEFORE the org resolution, and the silent `.catch(() => null)` orgId
// degradation must stay gone.
{
  const rel = 'app/api/admin/token-links/route.ts';
  const src = read(rel);
  const gateIdx = src.indexOf('resolveActOnBehalf(user.id, subjectUserId)');
  const lookupIdx = src.indexOf('getSubjectOrganizationId(subjectUserId)');
  if (gateIdx === -1) {
    fail(`${rel} missing act-on-behalf gate: expected "resolveActOnBehalf(user.id, subjectUserId)"`);
  }
  if (lookupIdx === -1) {
    fail(`${rel} missing scoped org resolution: expected "getSubjectOrganizationId(subjectUserId)"`);
  }
  if (gateIdx > lookupIdx) {
    fail(`${rel}: resolveActOnBehalf gate must run BEFORE getSubjectOrganizationId`);
  }
  if (src.includes('getSubjectOrganizationId(subjectUserId).catch') || src.includes('getActorOrganizationId(user.id).catch')) {
    fail(`${rel}: orgId resolution must fail loudly, not degrade to null via .catch()`);
  }
}

// --- Sprint 2 compliance expansion (CEO review 2026-06-14): member PII, voice sessions, messaging, applications ---

assertContains(
  'app/api/member/voice-interview/session/route.ts',
  ['getUser', 'checkVoiceSessionRateLimit'],
  'member voice-interview session has auth + rate limit',
);

assertContains(
  'app/api/member/voice-interview/transcript/route.ts',
  ['getUser', 'prisma.$transaction'],
  'member voice-interview transcript uses $transaction for audit event',
);

assertContains(
  'app/api/member/voice-interview/recording/route.ts',
  ['getUser'],
  'member voice-interview recording has auth',
);

assertContains(
  'app/api/member/settings/route.ts',
  ['getUser'],
  'member settings has auth',
);

assertContains(
  'app/api/member/resume/route.ts',
  ['getUser'],
  'member resume has auth',
);

assertContains(
  'app/api/member/notifications/route.ts',
  ['getUser'],
  'member notifications has auth',
);

assertContains(
  'app/api/member/matched-jobs/route.ts',
  ['getUser'],
  'member matched-jobs has auth',
);

assertContains(
  'app/api/member/request-help/route.ts',
  ['getUser'],
  'member request-help has auth',
);

// NOTE: app/api/(portal)/dashboard/jobs/route.ts is a PUBLIC job listing —
// no auth required by design (employer job board browsable without login).
// Tenant scoping is handled by published status + org-scoped RLS on jobs table.
// The detail and apply routes are also public-facing.

// NOTE: app/api/(portal)/dashboard/jobs/[id]/route.ts is a PUBLIC job detail —
// no auth required by design (employer job board browsable without login).
// Tenant scoping is handled by published status + org-scoped RLS on jobs table.

// NOTE: app/api/(portal)/dashboard/jobs/[id]/apply/route.ts is also public-facing
// — apply flow starts from public job board.

assertContains(
  'app/api/(portal)/dashboard/jobs/[id]/apply/route.ts',
  ['getUser'],
  'dashboard job apply has auth',
);

assertContains(
  'app/api/member/application-ai-feedback/route.ts',
  ['getUser'],
  'member application-ai-feedback has auth',
);

assertContains(
  'app/api/member/wioa-qualification/route.ts',
  ['getUser'],
  'member wioa-qualification has auth',
);

assertContains(
  'app/api/member/wioa-qualification/voice-session/route.ts',
  ['getUser'],
  'member wioa-qualification voice session has auth',
);

assertContains(
  'app/api/member/prep-bundle/route.ts',
  ['getUser'],
  'member prep-bundle has auth',
);

assertContains(
  'app/api/member/prep-bundle/send/route.ts',
  ['getUser'],
  'member prep-bundle send has auth',
);

assertContains(
  'app/api/member/interest-profiler/questions/route.ts',
  ['getUser'],
  'member interest-profiler questions has auth',
);

assertContains(
  'app/api/member/interest-profiler/score/route.ts',
  ['getUser'],
  'member interest-profiler score has auth',
);

assertContains(
  'app/api/member/interview-request/route.ts',
  ['getUser'],
  'member interview-request has auth',
);

assertContains(
  'app/api/member/pitch-deployments/route.ts',
  ['getUser'],
  'member pitch-deployments has auth',
);

// NOTE: app/api/member/signup/route.ts is a PUBLIC signup route — no auth required
// by design (new members create accounts). Tenant scoping is handled by
// rate limiting + org resolution from request headers.

assertContains(
  'app/api/member/resume/generate/route.ts',
  ['getUser'],
  'member resume generate has auth',
);

assertContains(
  'app/api/member/resume/upload/route.ts',
  ['getUser'],
  'member resume upload has auth',
);

assertContains(
  'app/api/member/resume/preview/route.ts',
  ['getUser'],
  'member resume preview has auth',
);

assertContains(
  'app/api/member/resume/plain-text/route.ts',
  ['getUser'],
  'member resume plain-text has auth',
);

assertContains(
  'app/api/member/resume/docx-html/route.ts',
  ['getUser'],
  'member resume docx-html has auth',
);

assertContains(
  'app/api/gdpr/export/route.ts',
  ['getUser'],
  'gdpr export has auth',
);

assertContains(
  'app/api/gdpr/delete/route.ts',
  ['getUser'],
  'gdpr delete has auth',
);

assertContains(
  'app/api/gdpr/consent/route.ts',
  ['getUser'],
  'gdpr consent has auth',
);

assertContains(
  'app/api/subgroup/dashboard/route.ts',
  ['getUser'],
  'subgroup dashboard has auth',
);

assertContains(
  'app/api/subgroup/members/route.ts',
  ['getUser'],
  'subgroup members has auth',
);

assertContains(
  'app/api/subgroup/members/[id]/route.ts',
  ['getUser'],
  'subgroup member detail has auth',
);

// NOTE: app/api/apply/signup/route.ts is a PUBLIC apply signup route — no auth
// required by design (new applicants create accounts). Tenant scoping is handled
// by org resolution from request headers + rate limiting.

// NOTE: app/api/apply/confirmation-email/route.ts is a PUBLIC route — sends
// confirmation email to applicants. No auth required.

// NOTE: app/api/apply/status-lookup/route.ts is a PUBLIC route — applicants
// check status without login. No auth required.

assertContains(
  'app/api/onboarding/complete/route.ts',
  ['getUser'],
  'onboarding complete has auth',
);

assertContains(
  'app/api/onboarding/tour-complete/route.ts',
  ['getUser'],
  'onboarding tour-complete has auth',
);

assertContains(
  'app/api/onboarding/reset/route.ts',
  ['getUser'],
  'onboarding reset has auth',
);

// --- Admin SSR residual pages: isAdminInOrg gate + scoped lists (sprint finish) ---
// Super-admin stays intentionally cross-tenant (see lib/tenant/adminPageScope.ts).

assertContains(
  'lib/tenant/adminPageScope.ts',
  ['isAdminInOrg', 'withTenantScope', 'superAdmin', 'inheritUserOrg'],
  'admin SSR page scope helper (org admin scoped; super-admin cross-tenant)',
);

assertContains(
  'app/admin/layout.tsx',
  ['resolveAdminPageTenant'],
  'admin layout uses isAdminInOrg via resolveAdminPageTenant (not global isAdmin)',
);

assertContains(
  'app/admin/page.tsx',
  ['resolveAdminPageTenant', 'getTriageDigest(scope)'],
  'admin home passes tenant scope into triage digest',
);

assertContains(
  'lib/admin/trainingDashboard.ts',
  ['withAdminPageScope', 'AdminPageTenantOk'],
  'loadTrainingDashboardData is org-scoped (super-admin unscoped)',
);

// The admin "who needs attention" roster (Command Center + Detailed overview
// digest) is loaded once in lib/attention/admin.ts inside withAdminPageScope
// over member-role accounts; every relation-less fact query (applications,
// events, alerts, message SQL) is keyed by that tenant-scoped id set.
assertContains(
  'lib/attention/admin.ts',
  ['withAdminPageScope', 'MEMBER_ONLY_WHERE', 'loadAttentionFacts'],
  'admin attention queue is org-scoped (super-admin unscoped)',
);

assertContains(
  'lib/admin/triageDigest.ts',
  ['getAdminAttention'],
  'getTriageDigest reads the org-scoped attention queue',
);

assertContains(
  'app/admin/members/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope'],
  'admin members roster is org-scoped',
);

assertContains(
  'app/admin/members/[id]/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope', 'findFirst'],
  'admin member detail is org-scoped (findFirst + injected organizationId)',
);

assertContains(
  'app/admin/members/new/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope', 'inheritLeaderOrg'],
  'admin add-member partner/subgroup lists are org-scoped',
);

assertContains(
  'app/admin/members/training/page.tsx',
  ['resolveAdminPageTenant', 'loadTrainingDashboardData(scope)'],
  'admin training dashboard passes tenant scope',
);

assertContains(
  'app/admin/placements/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope', 'inheritUserOrg'],
  'admin placements list inherits tenant via user',
);

assertContains(
  'app/admin/placements/retention/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope', 'inheritUserOrg'],
  'admin retention queue inherits tenant via user',
);

assertContains(
  'app/admin/partners/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope'],
  'admin partners directory is org-scoped',
);

assertContains(
  'app/admin/programs/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope'],
  'admin programs enrollment stats are org-scoped',
);

assertContains(
  'app/admin/assessments/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope'],
  'admin assessments completions are org-scoped',
);

assertContains(
  'app/admin/subgroups/page.tsx',
  ['resolveAdminPageTenant', 'inheritLeaderOrg'],
  'admin subgroups directory inherits tenant via leader',
);

assertContains(
  'app/admin/settings/page.tsx',
  ['resolveAdminPageTenant'],
  'admin settings requires isAdminInOrg even though queries are org-config',
);

assertContains(
  'app/admin/feature-flags/page.tsx',
  ['resolveAdminPageTenant'],
  'admin feature-flags requires isAdminInOrg',
);

assertContains(
  'app/admin/crons/page.tsx',
  ['resolveAdminPageTenant'],
  'admin crons requires isAdminInOrg',
);

assertContains(
  'app/admin/diagnostics/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope'],
  'admin diagnostics requires isAdminInOrg and scopes member drift list',
);

assertContains(
  'app/admin/sessions/[memberId]/run/page.tsx',
  ['resolveAdminPageTenant', 'withAdminPageScope', 'findFirst'],
  'admin session run member lookup is org-scoped',
);

console.log('[verify-high-risk-tenant-routes] OK — 68 routes verified');
