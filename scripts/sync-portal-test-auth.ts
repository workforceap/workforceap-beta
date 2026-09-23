#!/usr/bin/env npx tsx
/**
 * Creates fresh Supabase Auth users and Prisma fixtures in the demo project
 * so `User.id` matches `auth.users.id` (required for /dashboard, /employer, etc.).
 *
 * Requires explicit demo target, dedicated fixture organization, and unique
 * per-account secrets supplied through environment variables. See
 * docs/PORTAL-QA-FIXTURES.md. Never updates or deletes existing accounts.
 *
 * Run: node scripts/prisma-env.js npx tsx scripts/sync-portal-test-auth.ts
 *
 */
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'node:url';
import { PrismaClient, ApplicationStatus, type Prisma } from '@prisma/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { QA_ROLES, readPortalQaConfig, assertPortalQaOrganization } from './lib/portal-qa-guard.cjs';

type QaRole = 'member' | 'partner' | 'employer' | 'admin' | 'counselor';
const QA_AUTH_ROLES = QA_ROLES as readonly QaRole[];

const QA_EMAILS = [
  ...QA_AUTH_ROLES.map(role => `${role}-test@workforceap.org`),
  'referral-member-a@workforceap.org',
  'referral-member-b@workforceap.org',
  'match-candidate@workforceap.org',
];

async function createFreshAuthUser(supabase: SupabaseClient, email: string, fullName: string, password: string, orgId: string): Promise<string> {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { portal_qa_fixture: true, portal_qa_organization_id: orgId },
  });

  if (!createErr && created.user) {
    return created.user.id;
  }

  // Provider errors may include request context. Do not print them or rotate
  // an existing account just because its email resembles a fixture.
  throw new Error('Portal QA Auth creation failed. Existing accounts were not changed; inspect exact fixture IDs before recovery.');
}

async function assertAuthFixturesAbsent(supabase: SupabaseClient) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error('Portal QA Auth inventory failed. No fixtures were created.');
    if (data.users.some(user => QA_EMAILS.includes(user.email?.toLowerCase() ?? ''))) {
      throw new Error('Portal QA account already exists. Automatic replacement and password rotation are disabled.');
    }
    if (data.users.length < 200) return;
  }
  throw new Error('Portal QA Auth inventory was incomplete. No fixtures were created.');
}

async function seedQaWithAuthIds(
  prisma: Prisma.TransactionClient,
  orgId: string,
  ids: Record<QaRole, string>
) {
  const memberRole = await prisma.role.findUniqueOrThrow({ where: { name: 'member' } });
  const partnerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'partner' } });
  const employerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'employer' } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
  const counselorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'counselor' } });

  const partnerOrg = await prisma.partner.create({
    data: {
      organizationId: orgId,
      name: 'Portal QA Partner Organization',
      slug: `portal-qa-${ids.partner}`,
      referralCode: `QA-${ids.partner}`,
      status: 'active',
      notifyOnEnrollment: false,
    },
    select: { id: true },
  });

  await prisma.user.create({
    data: {
      id: ids.member,
      organizationId: orgId,
      email: 'member-test@workforceap.org',
      fullName: 'Portal QA Member',
      phone: '5125550100',
      userRoles: { create: { roleId: memberRole.id } },
      profile: { create: { zip: '78701', consentTerms: true } },
      applications: {
        create: {
          status: ApplicationStatus.PENDING,
          programInterest: 'Not sure — help me choose',
          submittedAt: new Date(),
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      id: ids.partner,
      organizationId: orgId,
      email: 'partner-test@workforceap.org',
      fullName: 'Portal QA Partner',
      phone: '5125550101',
      userRoles: { create: { roleId: partnerRole.id } },
      profile: { create: { consentTerms: true } },
      ...(partnerOrg
        ? {
            partnerUser: {
              create: { partnerId: partnerOrg.id },
            },
          }
        : {}),
    },
  });

  const refA = randomUUID();
  const refB = randomUUID();
  await prisma.user.create({
    data: {
      id: refA,
      organizationId: orgId,
      email: 'referral-member-a@workforceap.org',
      fullName: 'Referral Member A',
    },
  });
  await prisma.user.create({
    data: {
      id: refB,
      organizationId: orgId,
      email: 'referral-member-b@workforceap.org',
      fullName: 'Referral Member B',
    },
  });
  if (partnerOrg) {
    await prisma.partnerReferral.createMany({
      data: [
        { partnerId: partnerOrg.id, memberId: refA },
        { partnerId: partnerOrg.id, memberId: refB },
      ],
      skipDuplicates: true,
    });
  }

  const matchMemberId = randomUUID();
  await prisma.user.create({
    data: {
      id: matchMemberId,
      organizationId: orgId,
      email: 'match-candidate@workforceap.org',
      fullName: 'Match Candidate',
    },
  });

  await prisma.user.create({
    data: {
      id: ids.employer,
      organizationId: orgId,
      email: 'employer-test@workforceap.org',
      fullName: 'Portal QA Employer',
      phone: '5125550102',
      userRoles: { create: { roleId: employerRole.id } },
      profile: { create: { consentTerms: true } },
      employer: {
        create: {
          organizationId: orgId,
          companyName: 'QA Employer Co',
          contactName: 'Portal QA Employer',
          contactEmail: 'employer-test@workforceap.org',
          tier: 'basic',
          jobs: {
            create: [
              {
                organizationId: orgId,
                title: '[QA] Software Engineer',
                description: 'QA seed job for employer portal.',
                location: 'Austin, TX',
                status: 'live',
              },
              {
                organizationId: orgId,
                title: '[QA] Data Analyst',
                description: 'QA seed job for employer portal.',
                location: 'Remote',
                status: 'live',
              },
            ],
          },
        },
      },
    },
  });

  const emp = await prisma.employer.findUniqueOrThrow({
    where: { userId: ids.employer },
    include: { jobs: true },
  });
  const jobs = emp.jobs.filter((j) => j.title.startsWith('[QA]'));
  for (const j of jobs) {
    await prisma.aIJobMatch.createMany({
      data: [
        {
          jobId: j.id,
          studentId: matchMemberId,
          matchScore: j.title.includes('Software') ? 88 : 72,
          matchReasons: ['QA seed'],
          status: j.title.includes('Software') ? 'suggested' : 'contacted',
          ...(j.title.includes('Data') ? { statusUpdatedAt: new Date() } : {}),
        },
      ],
    });
  }

  await prisma.user.create({
    data: {
      id: ids.admin,
      organizationId: orgId,
      email: 'admin-test@workforceap.org',
      fullName: 'Portal QA Admin',
      phone: '5125550103',
      userRoles: { create: { roleId: adminRole.id } },
      profile: { create: { zip: '78701', consentTerms: true, role: 'admin' } },
    },
  });

  await prisma.user.create({
    data: {
      id: ids.counselor,
      organizationId: orgId,
      email: 'counselor-test@workforceap.org',
      fullName: 'Portal QA Counselor',
      userRoles: { create: { roleId: counselorRole.id } },
      profile: { create: { consentTerms: true, role: 'counselor' } },
      counselorProfile: { create: { affiliation: 'wap_staff', active: true } },
    },
  });

}

export async function syncPortalTestAuth(env: NodeJS.ProcessEnv = process.env) {
  const config = readPortalQaConfig(env);
  // Bind the effective DB explicitly: validation must not check one URL while
  // Prisma inherits a different one through process-global configuration.
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const createdAuthIds: string[] = [];
  try {
    const org = await prisma.organization.findUnique({
      where: { id: config.organizationId }, select: { id: true, slug: true, active: true },
    });
    assertPortalQaOrganization(org, config);
    if (await prisma.user.count({ where: { email: { in: QA_EMAILS, mode: 'insensitive' } } })) {
      throw new Error('Portal QA rows already exist. Automatic replacement is disabled.');
    }
    // Preflight role configuration before creating any Auth accounts.
    for (const name of QA_AUTH_ROLES) {
      await prisma.role.findUniqueOrThrow({ where: { name } });
    }
    await assertAuthFixturesAbsent(supabase);
    const ids = {} as Record<QaRole, string>;
    for (const role of QA_AUTH_ROLES) {
      ids[role] = await createFreshAuthUser(supabase, `${role}-test@workforceap.org`, `Portal QA ${role}`, config.passwords[role], config.organizationId);
      createdAuthIds.push(ids[role]);
    }
    await prisma.$transaction(async tx => {
      // Revalidate the exact fixture organization in the same transaction as
      // all database writes. Auth and Postgres cannot share one transaction.
      const currentOrg = await tx.organization.findUnique({ where: { id: config.organizationId }, select: { id: true, slug: true, active: true } });
      assertPortalQaOrganization(currentOrg, config);
      await seedQaWithAuthIds(tx, config.organizationId, ids);
    });
    console.log('Portal QA fixtures created. Sign in using the supplied per-account secrets.');
  } catch {
    // Only exact newly created IDs are useful for a separately reviewed
    // recovery. Never dump provider/Prisma errors, URLs, or credentials.
    if (createdAuthIds.length) console.error('New fixture Auth IDs requiring inspection:', createdAuthIds.join(', '));
    throw new Error('Portal QA provisioning stopped. No existing accounts were changed. Review target and exact fixture IDs before retrying.');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncPortalTestAuth().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Portal QA provisioning stopped.');
    process.exitCode = 1;
  });
}
