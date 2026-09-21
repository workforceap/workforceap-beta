import type { PrismaClient } from '@prisma/client';
import { shouldSkipOptionalDbQueriesAtBuild } from '@/lib/db/optionalBuildDb';
import { SMALL_SAMPLE_THRESHOLD } from '@/lib/admin/boardOutcomes';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

export type OutcomesSocialProofRate = { label: string; suppressed: boolean };

export type PlacementStoryCard = {
  id: string;
  jobTitle: string;
  programSlug: string | null;
  placedAt: Date;
  memberName?: never;
  employerName?: never;
  salaryOffered?: never;
};

export type PartnerOutcomeSnapshot = {
  referrals: number;
  placements: number;
  activePartners: number;
  placementRate: OutcomesSocialProofRate;
};

export type PartnerReferralBadge = { href: string; embedCode: string };

export type OutcomesSocialProofBundle = {
  enabled: boolean;
  storyCards: PlacementStoryCard[];
  partnerSnapshot: PartnerOutcomeSnapshot | null;
  badge: PartnerReferralBadge | null;
  methodologyNote: string;
};

type SocialProofDb = Pick<PrismaClient, 'placementRecord' | 'user' | 'partnerReferral' | 'partner'>;
type Env = Record<string, string | undefined>;
type Options = { enabled?: boolean; baseUrl?: string; referralCode?: string; partnerName?: string };
type StoryRecord = { id: string; jobTitle: string; programSlug: string | null; placedAt: Date };

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEFAULT_SITE_URL = 'https://www.workforceap.org';

function normalizeBaseUrl(baseUrl = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL): string {
  return baseUrl.replace(/\/+$/, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isOutcomesSocialProofEnabled(env: Env = process.env): boolean {
  return TRUE_VALUES.has((env.WORKFORCEAP_PUBLIC_OUTCOMES_SOCIAL_PROOF || '').trim().toLowerCase());
}

export function formatSuppressedRate(numerator: number, denominator: number): OutcomesSocialProofRate {
  if (denominator < SMALL_SAMPLE_THRESHOLD) {
    return { label: `${numerator.toLocaleString('en-US')} of ${denominator.toLocaleString('en-US')}`, suppressed: true };
  }
  return { label: `${Math.round((numerator / denominator) * 100)}%`, suppressed: false };
}

export function buildPartnerReferralBadge({
  baseUrl,
  referralCode,
  partnerName,
}: {
  baseUrl?: string;
  referralCode: string;
  partnerName: string;
}): PartnerReferralBadge {
  const url = new URL('/apply', normalizeBaseUrl(baseUrl));
  url.searchParams.set('ref', referralCode);
  const href = url.toString();
  return {
    href,
    embedCode: `<a href="${escapeHtml(href)}" style="display:inline-flex;align-items:center;gap:8px;padding:12px 16px;border-radius:999px;background:#AD2C4D;color:#fff;font-weight:700;text-decoration:none;" target="_blank" rel="noopener noreferrer">Refer through ${escapeHtml(partnerName)} → WorkforceAP</a>`,
  };
}

function buildOptionalBadge(options: Options): PartnerReferralBadge | null {
  const referralCode = options.referralCode?.trim();
  const partnerName = options.partnerName?.trim();
  if (!referralCode || !partnerName) return null;
  return buildPartnerReferralBadge({ baseUrl: options.baseUrl, referralCode, partnerName });
}

export async function getOutcomesSocialProof(
  db: SocialProofDb,
  options: Options = {},
): Promise<OutcomesSocialProofBundle> {
  const enabled = options.enabled ?? isOutcomesSocialProofEnabled();
  const empty: OutcomesSocialProofBundle = {
    enabled,
    storyCards: [],
    partnerSnapshot: null,
    badge: enabled ? buildOptionalBadge(options) : null,
    methodologyNote: `Live placement data only. Rates and story cards are suppressed when N < ${SMALL_SAMPLE_THRESHOLD}.`,
  };

  if (!enabled || shouldSkipOptionalDbQueriesAtBuild()) return empty;

  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    // Public outcomes count member-role accounts only (`MEMBER_ONLY_WHERE`):
    // a staff dogfood placement is never a public story or a partner
    // placement rate (number audit 2026-09-20, F1).
    const [enrolled, placed, referrals, placements, activePartners] = await Promise.all([
      db.user.count({ where: { deletedAt: null, enrolledProgram: { not: null }, ...MEMBER_ONLY_WHERE } }),
      db.placementRecord.count({ where: { user: { deletedAt: null, ...MEMBER_ONLY_WHERE } } }),
      db.user.count({
        where: { deletedAt: null, partnerReferrals: { some: {} }, ...MEMBER_ONLY_WHERE },
      }),
      db.placementRecord.count({
        where: { user: { deletedAt: null, partnerReferrals: { some: {} }, ...MEMBER_ONLY_WHERE } },
      }),
      db.partner.count({ where: { active: true, status: 'active', referrals: { some: { member: { deletedAt: null } } } } }),
    ]);

    if (placed <= 0) return empty;

    const storyCards: PlacementStoryCard[] = enrolled >= SMALL_SAMPLE_THRESHOLD
      ? (await db.placementRecord.findMany({
          where: { jobTitle: { not: '' }, placedAt: { gte: twoYearsAgo }, user: { deletedAt: null, ...MEMBER_ONLY_WHERE } },
          orderBy: { placedAt: 'desc' },
          take: 6,
          select: { id: true, jobTitle: true, programSlug: true, placedAt: true },
        })).map((row: StoryRecord) => ({ id: row.id, jobTitle: row.jobTitle, programSlug: row.programSlug, placedAt: row.placedAt }))
      : [];

    const partnerSnapshot = referrals > 0 && placements > 0
      ? { referrals, placements, activePartners, placementRate: formatSuppressedRate(placements, referrals) }
      : null;

    return { ...empty, storyCards, partnerSnapshot };
  } catch {
    return empty;
  }
}
