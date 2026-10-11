import type { Prisma } from '@prisma/client';
import { MEMBER_ONLY_WHERE, MEMBER_ONLY_EXCLUDED_EMAILS } from '@/lib/admin/memberOnlyWhere';
import { FIXTURE_EMAIL_DOMAINS, FIXTURE_LOCAL_PART_PREFIXES, FIXTURE_LOCAL_PART_SUFFIX, WORKFORCEAP_SENDING_DOMAIN } from '@/lib/email/fixtureEmailPatterns';

/** Established roster/recipient fixture policy; never infer QA from a person's name. */
export function operationalMemberWhere(options: { includePlaced?: boolean } = {}): Prisma.UserWhereInput {
  const domains = [...FIXTURE_EMAIL_DOMAINS, ...(process.env.EMAIL_FIXTURE_DOMAINS ?? '').split(',')]
    .map((domain) => domain.trim().toLowerCase().replace(/^[@.]/, '').replace(/\.$/, ''))
    .filter(Boolean);
  const addresses = [...MEMBER_ONLY_EXCLUDED_EMAILS, ...(process.env.EMAIL_FIXTURE_ADDRESSES ?? '').split(',')]
    .map((address) => address.trim().toLowerCase()).filter(Boolean);
  const sendingDomain = (process.env.EMAIL_FROM ?? '').match(/@([^>\s]+)>?$/)?.[1]?.toLowerCase().replace(/\.$/, '')
    ?? WORKFORCEAP_SENDING_DOMAIN;
  const fixtureNot: Prisma.UserWhereInput[] = [
    ...domains.flatMap((domain) => [
      { email: { endsWith: `@${domain}`, mode: 'insensitive' as const } },
      { email: { endsWith: `.${domain}`, mode: 'insensitive' as const } },
    ]),
    ...addresses.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
    ...FIXTURE_LOCAL_PART_PREFIXES.map((prefix) => ({ email: { startsWith: prefix, mode: 'insensitive' as const } })),
    { email: { endsWith: `${FIXTURE_LOCAL_PART_SUFFIX}@${sendingDomain}`, mode: 'insensitive' } },
  ];
  return {
    AND: [
      MEMBER_ONLY_WHERE,
      { deletedAt: null },
      // Null is a legacy account with unknown status, not proof of inactivity.
      { OR: [{ memberStatus: { in: options.includePlaced ? ['active', 'placed'] : ['active'] } }, { memberStatus: null }] },
      { NOT: fixtureNot },
    ],
  };
}

export const OPERATIONAL_QUEUE_CAP = 500;

export function cappedQueue<T>(rows: readonly T[]): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, OPERATIONAL_QUEUE_CAP), truncated: rows.length > OPERATIONAL_QUEUE_CAP };
}

/** Response age starts at the latest recorded employer action, not just application age. */
export function employerResponseWaitStartedAt(application: {
  appliedAt: Date;
  statusUpdatedAt: Date | null;
  lastEmployerMessageAt: Date | null;
}): Date {
  return new Date(Math.max(application.appliedAt.getTime(), application.statusUpdatedAt?.getTime() ?? 0,
    application.lastEmployerMessageAt?.getTime() ?? 0));
}
