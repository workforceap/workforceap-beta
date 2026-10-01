import 'server-only';

import { Prisma, type PrismaClient } from '@prisma/client';
import { MEMBER_ONLY_WHERE, memberOnlyEmailSql, memberOnlyRoleSql } from '@/lib/admin/memberOnlyWhere';
import { prisma } from '@/lib/db/prisma';
import { shouldSkipOptionalDbQueriesAtBuild } from '@/lib/db/optionalBuildDb';
import { VERIFIED_PLACEMENT_WHERE } from '@/lib/placement/verifiedPlacement';
import { sqlCount } from '@/lib/db/scanCaps';
import {
  VALIDATED_PROGRAM_COMPLETION_SPECS,
  validatedProgramAssignmentRowsSql,
  validatedProgramCompletionValuesSql,
} from '@/lib/reporting/programCompletion';
import { getDefaultOrganizationId } from '@/lib/tenant/organization';

export const GOOGLE_IT_LANDING_SLUG = 'google-it-support';

export const GOOGLE_IT_PROGRAM_SLUGS = [
  'google-it-support',
  'google-it-support-professional-certificate',
  'it-support-professional-certificate-google',
  'it-support-professional-certificate-ibm',
  'it-support-and-entry-level-cyber-security-certificate',
  'comptia-a-professional-certificate',
] as const;

const GOOGLE_IT_VALIDATED_COMPLETION_SPECS = Array.from(
  new Map(
    VALIDATED_PROGRAM_COMPLETION_SPECS
      .filter((spec) =>
        spec.storageValues.some((value) =>
          (GOOGLE_IT_PROGRAM_SLUGS as readonly string[]).includes(value),
        ),
      )
      .map((spec) => [`${spec.canonicalSlug}\0${spec.curriculumVersion}`, spec] as const),
  ).values(),
);
const GOOGLE_IT_VALIDATED_CANONICAL_SLUGS = GOOGLE_IT_VALIDATED_COMPLETION_SPECS.map(
  (spec) => spec.canonicalSlug,
);
const GOOGLE_IT_PROGRAM_STORAGE_VALUES = Array.from(
  new Set([
    ...GOOGLE_IT_PROGRAM_SLUGS,
    ...GOOGLE_IT_VALIDATED_COMPLETION_SPECS.flatMap((spec) => spec.storageValues),
  ]),
);

export const GOOGLE_IT_PRIMARY_HANDOFF_PROGRAM_SLUG = 'it-support-professional-certificate-ibm';

export const GOOGLE_IT_COMPLETION_RATE_MIN_ENROLLMENTS = 10;
export const GOOGLE_IT_PLACEMENT_RATE_MIN_ENROLLMENTS = 40;

export type GoogleItLandingMetrics = {
  enrollmentCount: number;
  completionCount: number;
  placementCount: number;
  hasLiveData: boolean;
  asOfLabel: string;
};

export type GoogleItPublicMetricCard = {
  key: 'enrollment' | 'completion' | 'placement';
  label: string;
  value: string;
  detail: string;
};

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function buildGoogleItPublicMetricCards(metrics: GoogleItLandingMetrics): GoogleItPublicMetricCard[] {
  if (!metrics.hasLiveData || metrics.enrollmentCount <= 0) return [];

  const cards: GoogleItPublicMetricCard[] = [
    {
      key: 'enrollment',
      label: 'Current enrollments',
      value: metrics.enrollmentCount.toLocaleString('en-US'),
      detail: 'Learners enrolled in the IT support pathway.',
    },
  ];

  if (metrics.enrollmentCount >= GOOGLE_IT_COMPLETION_RATE_MIN_ENROLLMENTS) {
    cards.push({
      key: 'completion',
      label: 'Completion rate',
      value: formatPercent(metrics.completionCount, metrics.enrollmentCount),
      detail: 'Members with completed program progress divided by enrollments.',
    });
  }

  if (metrics.enrollmentCount >= GOOGLE_IT_PLACEMENT_RATE_MIN_ENROLLMENTS) {
    cards.push({
      key: 'placement',
      label: 'Placement rate',
      value: formatPercent(metrics.placementCount, metrics.enrollmentCount),
      detail: 'Verified placement records divided by enrollments.',
    });
  }

  return cards;
}

function unavailableMetrics(asOfLabel = 'No reliable program outcomes available yet'): GoogleItLandingMetrics {
  return {
    enrollmentCount: 0,
    completionCount: 0,
    placementCount: 0,
    hasLiveData: false,
    asOfLabel,
  };
}

export async function getGoogleItLandingMetrics(
  orgId: string,
  db: PrismaClient = prisma,
): Promise<GoogleItLandingMetrics> {
  if (shouldSkipOptionalDbQueriesAtBuild()) return unavailableMetrics('Build mode');

  try {
    const enrolledWhere = {
      organizationId: orgId,
      programSlug: { in: GOOGLE_IT_PROGRAM_STORAGE_VALUES },
    };
    const memberWhere = {
      organizationId: orgId,
      deletedAt: null,
      ...MEMBER_ONLY_WHERE,
    };

    const completionRowsPromise = GOOGLE_IT_VALIDATED_CANONICAL_SLUGS.length > 0
      ? db.$queryRaw<Array<{ count: bigint | number }>>`
          WITH validated_programs(canonical_slug, storage_value, curriculum_version, total_courses) AS (
            VALUES ${validatedProgramCompletionValuesSql()}
          ), learner_program_assignments(user_id, program_slug, curriculum_version) AS (
            ${validatedProgramAssignmentRowsSql()}
          )
          SELECT
            COUNT(DISTINCT (mpp.user_id, progress_program.canonical_slug))::bigint AS count
          FROM learner_program_assignments ce
          INNER JOIN validated_programs enrolled_program
            ON enrolled_program.storage_value = ce.program_slug
            AND enrolled_program.curriculum_version = ce.curriculum_version
          INNER JOIN member_program_progress mpp
            ON mpp.user_id = ce.user_id
          INNER JOIN validated_programs progress_program
            ON progress_program.canonical_slug = enrolled_program.canonical_slug
            AND progress_program.storage_value = mpp.program_slug
            AND progress_program.curriculum_version = ce.curriculum_version
          INNER JOIN users u
            ON u.id = mpp.user_id
          WHERE u.organization_id = ${orgId}
            AND u.deleted_at IS NULL
            AND ${memberOnlyRoleSql('u')}
            AND ${memberOnlyEmailSql('u')}
            AND progress_program.canonical_slug IN (${Prisma.join(GOOGLE_IT_VALIDATED_CANONICAL_SLUGS)})
            AND mpp.courses_completed = progress_program.total_courses
        `
      : Promise.resolve([]);

    const [enrollmentCount, completionRows, placementCount] = await Promise.all([
      db.courseEnrollment.count({ where: enrolledWhere }),
      completionRowsPromise,
      // Staff-verified placements only, matching the card's "Verified
      // placement records" label (docs/OUTCOMES-METHODOLOGY.md, "Public
      // placement counts").
      db.placementRecord.count({
        where: {
          ...VERIFIED_PLACEMENT_WHERE,
          user: memberWhere,
          OR: [
            { programSlug: { in: GOOGLE_IT_PROGRAM_STORAGE_VALUES } },
            { user: { courseEnrollments: { some: { programSlug: { in: GOOGLE_IT_PROGRAM_STORAGE_VALUES } } } } },
          ],
        },
      }),
    ]);
    const completionCount = sqlCount(completionRows[0]?.count ?? 0);

    return {
      enrollmentCount,
      completionCount,
      placementCount,
      hasLiveData: enrollmentCount > 0,
      asOfLabel: 'Live WorkforceAP program data; rates shown only after minimum sample thresholds are met.',
    };
  } catch {
    return unavailableMetrics('Outcomes data unavailable');
  }
}

export async function loadGoogleItLandingMetrics(): Promise<GoogleItLandingMetrics> {
  if (shouldSkipOptionalDbQueriesAtBuild()) return unavailableMetrics('Build mode');

  try {
    const orgId = await getDefaultOrganizationId();
    return getGoogleItLandingMetrics(orgId);
  } catch {
    return unavailableMetrics('Outcomes data unavailable');
  }
}
