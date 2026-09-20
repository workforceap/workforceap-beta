import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { getProgramByInterestValue, getProgramBySlug } from '@/lib/content/programs';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import {
  localizeApplicantTriage,
  triageApplicant,
  type ApplicantTriageDisplay,
  type ApplicantTriageResult,
} from '@/lib/admin/applicantTriage';

/**
 * Read-only loader for the applicant triage. One `findMany` over the page's
 * member ids (<= 50 on the members list, 1 on the detail page), only for
 * members whose latest application is still open (PENDING / NEEDS_INFO).
 * Everything it reads already exists; it writes nothing.
 */

type TriageDb = { user: { findMany: PrismaClient['user']['findMany'] } };

export type ApplicantTriageLoaded = ApplicantTriageResult & {
  applicationStatus: 'PENDING' | 'NEEDS_INFO';
};

const OPEN_STATUSES = ['PENDING', 'NEEDS_INFO'] as const;

export async function loadApplicantTriageByUserIds(
  db: TriageDb,
  userIds: readonly string[],
): Promise<Map<string, ApplicantTriageLoaded>> {
  const out = new Map<string, ApplicantTriageLoaded>();
  if (userIds.length === 0) return out;

  const rows = await db.user.findMany({
    where: {
      id: { in: [...userIds] },
      applications: { some: { status: { in: [...OPEN_STATUSES] } } },
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      programInterest: true,
      wioaReviewStatus: true,
      wioaQualificationJson: true,
      profile: {
        select: { profilePhone: true, authorizedToWork: true, usCitizen: true, isMinor: true },
      },
      applications: {
        where: { status: { in: [...OPEN_STATUSES] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { status: true, programInterest: true, referralPartnerId: true, referralSource: true },
      },
      applyEligibilityScreenings: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: {
          q1: true,
          q2: true,
          q3: true,
          receivingUnemployment: true,
          snapWic: true,
          publicAssistancePrograms: true,
          publicAssistanceHelpRequested: true,
          partnerAmbassadorReferral: true,
        },
      },
      partnerReferrals: { take: 1, select: { id: true } },
    },
  });

  for (const row of rows) {
    const application = row.applications[0];
    if (!application) continue;
    const status = application.status as 'PENDING' | 'NEEDS_INFO';
    const screening = row.applyEligibilityScreenings[0] ?? null;
    const interest = application.programInterest || row.programInterest || null;
    const programRecognized = interest
      ? Boolean(getProgramBySlug(interest) ?? getProgramByInterestValue(interest))
      : null;

    const result = triageApplicant({
      application: {
        status,
        programInterest: application.programInterest ?? null,
        referralPartnerId: application.referralPartnerId,
        referralSource: application.referralSource,
      },
      user: {
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        programInterest: row.programInterest,
        wioaReviewStatus: row.wioaReviewStatus,
      },
      profile: row.profile,
      applyScreening: screening
        ? {
            q1: asYesNo(screening.q1),
            q2: asYesNo(screening.q2),
            q3: asYesNo(screening.q3),
            receivingUnemployment: asYesNo(screening.receivingUnemployment),
            snapWic: asYesNo(screening.snapWic),
            publicAssistancePrograms: screening.publicAssistancePrograms,
            publicAssistanceHelpRequested: asYesNo(screening.publicAssistanceHelpRequested),
            partnerAmbassadorReferral: screening.partnerAmbassadorReferral,
          }
        : null,
      wioaSnapshot: parseWioaQualificationSnapshot(row.wioaQualificationJson),
      programRecognized,
      hasPartnerReferral: row.partnerReferrals.length > 0,
    });

    out.set(row.id, { ...result, applicationStatus: status });
  }

  return out;
}

function asYesNo(v: string | null | undefined): 'yes' | 'no' | null {
  if (v === 'yes' || v === 'no') return v;
  return null;
}

export type ApplicantTriageDisplayLoaded = ApplicantTriageDisplay & {
  applicationStatus: 'PENDING' | 'NEEDS_INFO';
};

/** Resolve a loaded map to display strings with the caller's translator (next-intl `admin` namespace). */
export function localizeApplicantTriageMap(
  loaded: Map<string, ApplicantTriageLoaded>,
  t: (key: string) => string,
): Record<string, ApplicantTriageDisplayLoaded> {
  const out: Record<string, ApplicantTriageDisplayLoaded> = {};
  for (const [id, row] of loaded) {
    out[id] = { ...localizeApplicantTriage(row, t), applicationStatus: row.applicationStatus };
  }
  return out;
}
