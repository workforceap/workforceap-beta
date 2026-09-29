/**
 * Partner data-access tiers — the one place that decides what a partner may
 * see about the members it referred. Every partner loader, page, API route,
 * export and partner email reads its rules from here (docs/PARTNER_TIERS.md).
 *
 * Tier is derived from `Partner.partnerType`; there is no separate column, so
 * the rule ships without a migration.
 *
 *  - `restricted` — referral-track (payout) partners, i.e. affiliates. Status
 *    only: member name, application status + submitted date, program,
 *    progress, certification names, and placed yes/no + placement date. Never
 *    email, phone, city/state/ZIP, employment status, education level,
 *    employer, job title, salary or retention details.
 *  - `full` — community, high_school and any other/unknown type (unknown
 *    types normalize to `community`). Today's partner view: the above plus
 *    email in the CSV, location / employment / education in the demographics
 *    export, and employer, job title and retention for verified placements.
 *
 * Minors: a referred member who is a minor (`Profile.isMinor`, or a saved
 * date of birth under 18) is hidden from every non-school partner unless
 * `Profile.ferpaConsentGiven` is true. High-school partners work with minors
 * by design (sponsored school enrollment) and keep seeing them.
 */
import type { Prisma } from '@prisma/client';
import { isPayoutEligibleType, normalizePartnerType, type PartnerType } from '@/lib/partner/partnerType';

export type PartnerDataTier = 'full' | 'restricted';

export type PartnerDataAccess = {
  tier: PartnerDataTier;
  partnerType: PartnerType;
  /** High-school partners see minors they referred (school enrollment). */
  isSchoolPartner: boolean;
  /** Member email (CSV) and phone. */
  canSeeContact: boolean;
  /** City, state, ZIP, employment status and education level. */
  canSeeProfileDetails: boolean;
  /** Employer name, job title, salary, onboarding window and retention. */
  canSeePlacementDetails: boolean;
};

type PartnerTypeCarrier = { partnerType?: string | null } | null | undefined;

/** The partner type that works with minors by design (school enrollment). */
export const PARTNER_SCHOOL_TYPE = 'high_school' satisfies PartnerType;

/**
 * Partner types limited to the status-only view. Derived from the payout
 * track so a new payout-eligible type is restricted by default — the safer
 * failure mode for an affiliate that is paid per placement.
 */
function isRestrictedPartnerType(type: unknown): boolean {
  return isPayoutEligibleType(type);
}

export function partnerDataAccess(partner: PartnerTypeCarrier): PartnerDataAccess {
  const partnerType = normalizePartnerType(partner?.partnerType);
  const restricted = isRestrictedPartnerType(partnerType);
  return {
    tier: restricted ? 'restricted' : 'full',
    partnerType,
    isSchoolPartner: partnerType === PARTNER_SCHOOL_TYPE,
    canSeeContact: !restricted,
    canSeeProfileDetails: !restricted,
    canSeePlacementDetails: !restricted,
  };
}

// ── Minors ──────────────────────────────────────────────────────────────────

export type MinorProfileFacts = {
  isMinor?: boolean | null;
  dob?: Date | string | null;
  ferpaConsentGiven?: boolean | null;
} | null | undefined;

/**
 * The instant a member born after it is still under 18 (UTC calendar day).
 *
 * On Feb 29 the date 18 years earlier never exists (18 is not a multiple of
 * 4, so that year is not a leap year), and `Date.UTC` would roll it to Mar 1,
 * treating a member born on Mar 1, who is still 17 that day, as an adult.
 * Clamp the day to the last day of that month instead, so the cutoff is
 * Feb 28 and the Mar 1 birthday stays a minor.
 */
export function minorBirthDateCutoff(now: Date = new Date()): Date {
  const year = now.getUTCFullYear() - 18;
  const month = now.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(now.getUTCDate(), lastDayOfMonth)));
}

/**
 * The same cutoff as a `YYYY-MM-DD` calendar date, for raw SQL against the
 * `profiles.dob` DATE column. A bound `Date` parameter is a timestamptz, and
 * casting that to `date` uses the session time zone, which could move the
 * cutoff a day; a date string cannot.
 */
export function minorBirthDateCutoffIsoDate(now: Date = new Date()): string {
  return minorBirthDateCutoff(now).toISOString().slice(0, 10);
}

/** True when the saved profile flags the member as under 18. */
export function isMinorProfile(profile: MinorProfileFacts, now: Date = new Date()): boolean {
  if (!profile) return false;
  if (profile.isMinor === true) return true;
  if (!profile.dob) return false;
  const dob = profile.dob instanceof Date ? profile.dob : new Date(profile.dob);
  if (Number.isNaN(dob.getTime())) return false;
  return dob.getTime() > minorBirthDateCutoff(now).getTime();
}

/** May this partner see this referred member at all? */
export function partnerMayViewMember(
  access: PartnerDataAccess,
  profile: MinorProfileFacts,
  now: Date = new Date(),
): boolean {
  if (access.isSchoolPartner) return true;
  if (!isMinorProfile(profile, now)) return true;
  return profile?.ferpaConsentGiven === true;
}

/**
 * Prisma `User` condition that matches the members this partner may NOT see
 * (same rule as `partnerMayViewMember`), or null when the partner may see
 * every referred member (school partners). A member without a profile row is
 * not a known minor and stays visible.
 *
 * NULL-safe on purpose. Callers put this inside `NOT`, and Prisma renders a
 * to-one `profile: { is }` filter as a LEFT JOIN, so the whole condition is
 * negated in SQL. With a bare `dob > cutoff`, an adult whose date of birth was
 * never saved (the usual case) made the OR `false OR NULL` = NULL, `NOT NULL`
 * is NULL, and PostgreSQL dropped the row: every such adult was hidden from
 * every non-school partner. `dob IS NOT NULL AND dob > cutoff` is false, not
 * NULL, for a missing date. `isMinor` and `ferpaConsentGiven` are NOT NULL
 * columns (lib/partner/partnerVisibility.realdb.test.ts).
 */
export function partnerHiddenMemberWhere(
  access: PartnerDataAccess,
  now: Date = new Date(),
): Prisma.UserWhereInput | null {
  if (access.isSchoolPartner) return null;
  return {
    profile: {
      is: {
        ferpaConsentGiven: false,
        OR: [{ isMinor: true }, { dob: { not: null, gt: minorBirthDateCutoff(now) } }],
      },
    },
  };
}

/**
 * `where` narrowed to the members this partner may see. The hidden-member
 * condition is appended to the caller's `NOT` list (Prisma: none of the `NOT`
 * conditions may match), so keys such as `MEMBER_ONLY_WHERE`'s own `NOT`
 * entries are kept, never overwritten.
 */
export function withPartnerMemberVisibility<T extends Prisma.UserWhereInput>(
  where: T,
  access: PartnerDataAccess,
  now: Date = new Date(),
): T {
  const hidden = partnerHiddenMemberWhere(access, now);
  if (!hidden) return where;
  const existing = where.NOT === undefined ? [] : Array.isArray(where.NOT) ? where.NOT : [where.NOT];
  return { ...where, NOT: [...existing, hidden] };
}

// ── Field projections ───────────────────────────────────────────────────────

export type PartnerPlacementFacts = {
  employerName?: string | null;
  jobTitle?: string | null;
  salaryOffered?: number | null;
  placedAt?: Date | null;
  startDateVerified?: boolean | null;
  onboardingWindowEnd?: Date | null;
  retentionDecision?: string | null;
  retentionStatus?: string | null;
};

export type PartnerVisiblePlacement = {
  employerName: string | null;
  jobTitle: string | null;
  salaryOffered: number | null;
  placedAt: Date | null;
  startDateVerified: boolean;
  onboardingWindowEnd: Date | null;
  retentionDecision: string | null;
  retentionStatus: string | null;
};

/**
 * The placement a partner may see. Restricted partners keep only whether the
 * placement exists / is verified and its date; everything about the job is
 * dropped. Apply this even when the select was already narrowed, so a caller
 * that loaded more cannot pass it through.
 */
export function partnerVisiblePlacement(
  access: PartnerDataAccess,
  placement: PartnerPlacementFacts | null | undefined,
): PartnerVisiblePlacement | null {
  if (!placement) return null;
  const details = access.canSeePlacementDetails;
  return {
    employerName: details ? placement.employerName ?? null : null,
    jobTitle: details ? placement.jobTitle ?? null : null,
    salaryOffered: details ? placement.salaryOffered ?? null : null,
    placedAt: placement.placedAt ?? null,
    startDateVerified: placement.startDateVerified === true,
    onboardingWindowEnd: details ? placement.onboardingWindowEnd ?? null : null,
    retentionDecision: details ? placement.retentionDecision ?? null : null,
    retentionStatus: details ? placement.retentionStatus ?? null : null,
  };
}

/** Prisma select for a referred member's placement record, narrowed by tier. */
export function partnerPlacementSelect(access: PartnerDataAccess) {
  return access.canSeePlacementDetails
    ? {
        employerName: true,
        jobTitle: true,
        salaryOffered: true,
        placedAt: true,
        startDateVerified: true,
        onboardingWindowEnd: true,
        retentionDecision: true,
      } as const
    : { placedAt: true, startDateVerified: true } as const;
}

/**
 * Partner milestone email details. Restricted partners get program, course
 * and certification names only (never employer, role or salary).
 */
const RESTRICTED_EMAIL_DETAIL_KEYS = new Set(['Program', 'Course', 'Certification']);

export function partnerEmailDetails(
  access: PartnerDataAccess,
  details: Record<string, string | undefined> | undefined,
): Record<string, string | undefined> | undefined {
  if (!details || access.tier === 'full') return details;
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => RESTRICTED_EMAIL_DETAIL_KEYS.has(key)),
  );
}

// ── Coarse progress stage (restricted exports) ──────────────────────────────

export type PartnerProgressStage = 'not_enrolled' | 'enrolled' | 'in_progress' | 'completed';

export const PARTNER_PROGRESS_STAGE_LABELS: Record<PartnerProgressStage, string> = {
  not_enrolled: 'Not enrolled yet',
  enrolled: 'Enrolled',
  in_progress: 'In progress',
  completed: 'Completed',
};

export function partnerProgressStage(input: { enrolled: boolean; progressPct: number }): PartnerProgressStage {
  if (input.progressPct >= 100) return 'completed';
  if (input.progressPct > 0) return 'in_progress';
  return input.enrolled ? 'enrolled' : 'not_enrolled';
}

// ── Disclosure copy keys (apply funnel) ─────────────────────────────────────

/**
 * What the applicant is told the referring partner will see, per tier. The
 * message keys live under `apply.partnerDisclosure.*` in messages/*.json and
 * must stay in step with the flags above (lib/partner/dataAccess.test.ts).
 */
export function partnerDisclosureMessageKey(tier: PartnerDataTier): 'restricted' | 'full' {
  return tier === 'restricted' ? 'restricted' : 'full';
}

/** Version stamp recorded with the disclosure acknowledgement. */
export const PARTNER_DISCLOSURE_VERSION = '2026-09-28';
