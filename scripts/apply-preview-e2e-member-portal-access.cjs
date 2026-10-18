#!/usr/bin/env node

/**
 * Preview-only DEMO bootstrap: the standing PREVIEW_E2E member must reach the
 * five live C dashboard routes. Ops gates members with assessmentCompleted=false
 * and loginCount > 5 to /dashboard/assessment; the portal-qa fixture often sits
 * there. Idempotently mark assessment complete for member-test in the isolated
 * portal-qa org only. Never runs outside Vercel Preview + DEMO.
 */
const { validatePreviewTarget } = require('./apply-preview-training-workspace-schema.cjs');

const E2E_MEMBER_EMAIL = 'member-test@workforceap.org';
const PORTAL_QA_ORG_SLUG = 'portal-qa-september-smoke';

async function ensureE2eMemberPortalAccess(prisma, options = {}) {
  const email = options.email ?? E2E_MEMBER_EMAIL;
  const orgSlug = options.orgSlug ?? PORTAL_QA_ORG_SLUG;

  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug, active: true },
    select: { id: true },
  });
  if (!org) {
    return { updated: false, reason: `organization ${orgSlug} not found` };
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, organizationId: org.id },
    select: { id: true, assessmentCompleted: true, assessmentCompletedAt: true },
  });
  if (!user) {
    return { updated: false, reason: `member ${email} not in ${orgSlug}` };
  }
  if (user.assessmentCompleted) {
    return { updated: false, reason: 'already complete' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      assessmentCompleted: true,
      assessmentCompletedAt: user.assessmentCompletedAt ?? new Date(),
    },
  });
  return { updated: true };
}

async function main() {
  const target = validatePreviewTarget();
  console.log('[preview-e2e-member-access] target verified: Vercel Preview + DEMO Supabase.');
  if (process.argv.includes('--check')) {
    console.log('[preview-e2e-member-access] target verified; no database command executed.');
    return;
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: target.directDatabaseUrl } } });
  try {
    const result = await ensureE2eMemberPortalAccess(prisma);
    console.log(
      `[preview-e2e-member-access] ${result.updated ? 'marked preassessment complete' : `skipped (${result.reason})`}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error('[preview-e2e-member-access] BLOCKED: target guard or database update failed.');
    process.exitCode = 1;
  });
}

module.exports = {
  E2E_MEMBER_EMAIL,
  PORTAL_QA_ORG_SLUG,
  ensureE2eMemberPortalAccess,
  main,
};
