import 'server-only';

import { FundingSource } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { ANALYTICS_SAMPLE_CAP } from '@/lib/db/scanCaps';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { loadTrainingDashboardData } from '@/lib/admin/trainingDashboard';
import { calculateHealthStatus, MEMBER_ACTIVITY_EVENT_WHERE, type HealthStatus } from '@/lib/admin/healthScore';
import { MEMBER_OR_DOGFOOD_WHERE } from '@/lib/admin/memberOnlyWhere';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScope';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type AnalyticsFunnel = {
  totalMembers: number;
  enrolledInProgram: number;
  activeInTraining: number;
  completed: number;
};

export type AnalyticsEngagement = {
  active: number;
  atRisk: number;
  inactive: number;
  notStarted: number;
  stalled: number;
};

export type AnalyticsOutcomes = {
  placements: number;
  pendingPlacements: number;
  completedTraining: number;
  /** placements / completed-training, 0–100 (null when no completers). */
  placementRatePct: number | null;
};

export type AnalyticsFundingRow = {
  source: string;
  label: string;
  count: number;
};

export type AnalyticsProgramRow = {
  slug: string;
  title: string;
  count: number;
};

export type AnalyticsAcquisitionStep = {
  key: string;
  label: string;
  hint: string;
  count: number;
  /** Conversion from the previous step, 0–100 (null on the first step or when previous step is 0). */
  conversionPct: number | null;
};

export type AnalyticsAcquisition = {
  windowDays: number;
  steps: AnalyticsAcquisitionStep[];
  qualifiedScreenings: number;
};

export type AnalyticsOverview = {
  funnel: AnalyticsFunnel;
  engagement: AnalyticsEngagement;
  outcomes: AnalyticsOutcomes;
  funding: AnalyticsFundingRow[];
  programs: AnalyticsProgramRow[];
  acquisition: AnalyticsAcquisition;
};

const FUNDING_LABELS: Record<FundingSource, string> = {
  [FundingSource.GRANT]: 'Grant',
  [FundingSource.EMPLOYER]: 'Employer-sponsored',
  [FundingSource.PARTNER_ORG]: 'Partner organization',
  [FundingSource.SELF]: 'Self-funded',
  [FundingSource.OTHER]: 'Other',
};

/**
 * Single fast read for the admin analytics overview page. Reuses the existing
 * training dashboard aggregate for funnel/engagement and runs lightweight
 * prisma count/groupBy queries (no per-member N+1) for everything else. Every
 * slice is settled independently so one failing query degrades to zero rather
 * than blanking the page.
 */
export async function loadAnalyticsOverview(
  scope: AdminPageTenantOk,
): Promise<AnalyticsOverview> {
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

  const [
    trainingResult,
    totalMembersResult,
    lastEventsResult,
    recentEventsResult,
    courseActivityResult,
    membersForHealthResult,
    placementsResult,
    pendingPlacementsResult,
    fundingResult,
    programResult,
    newAccountsResult,
    screeningsResult,
    qualifiedScreeningsResult,
    applicationsSubmittedResult,
    applicationsApprovedResult,
  ] = await Promise.allSettled([
    loadTrainingDashboardData(scope),
    prisma.user.count({ where: { deletedAt: null, ...MEMBER_OR_DOGFOOD_WHERE } }),
    // Same Health inputs as the /admin/members roster: system-sent mail is
    // not activity, and logins + Coursera/course work are (Mike, 2026-09-20).
    prisma.memberEvent.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: thirtyDaysAgo }, ...MEMBER_ACTIVITY_EVENT_WHERE },
      _max: { createdAt: true },
    }),
    prisma.memberEvent.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: thirtyDaysAgo }, ...MEMBER_ACTIVITY_EVENT_WHERE },
      _count: { _all: true },
    }),
    prisma.courseProgress.groupBy({
      by: ['userId'],
      _max: { lastActivityAt: true },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, ...MEMBER_OR_DOGFOOD_WHERE, enrolledProgram: { not: null } },
      take: ANALYTICS_SAMPLE_CAP,
      orderBy: { enrolledAt: 'desc' },
      select: { id: true, enrolledAt: true, lastLoginAt: true },
    }),
    prisma.placementRecord.count({
      where: { user: { deletedAt: null, ...MEMBER_OR_DOGFOOD_WHERE } },
    }),
    // Member-confirmed placements still awaiting counselor verification.
    prisma.placementRecord.count({
      where: { startDateVerified: false, user: { deletedAt: null, ...MEMBER_OR_DOGFOOD_WHERE } },
    }),
    prisma.courseEnrollment.groupBy({
      by: ['fundingSource'],
      _count: { _all: true },
    }),
    prisma.courseEnrollment.groupBy({
      by: ['programSlug'],
      _count: { _all: true },
    }),
    prisma.user.count({
      where: { deletedAt: null, ...MEMBER_OR_DOGFOOD_WHERE, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.applyEligibilityScreening.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.applyEligibilityScreening.count({
      where: { createdAt: { gte: thirtyDaysAgo }, qualifies: true },
    }),
    prisma.application.count({
      where: { createdAt: { gte: thirtyDaysAgo }, submittedAt: { not: null } },
    }),
    prisma.application.count({
      where: { createdAt: { gte: thirtyDaysAgo }, status: 'APPROVED' },
    }),
  ]);

  // ── Funnel + engagement (reuse the training dashboard aggregate) ──
  const training = trainingResult.status === 'fulfilled' ? trainingResult.value : null;
  const metrics = training?.metrics ?? {
    enrolledMembers: 0,
    activeInTraining: 0,
    notStarted: 0,
    completed: 0,
    stale: 0,
    averagePercent: 0,
  };

  const totalMembers = totalMembersResult.status === 'fulfilled' ? totalMembersResult.value : 0;

  const funnel: AnalyticsFunnel = {
    totalMembers,
    enrolledInProgram: metrics.enrolledMembers,
    activeInTraining: metrics.activeInTraining,
    completed: metrics.completed,
  };

  // ── Risk via the shared health-score helper over enrolled members ──
  const lastEventMap = new Map<string, Date | null>();
  if (lastEventsResult.status === 'fulfilled') {
    for (const row of lastEventsResult.value) lastEventMap.set(row.userId, row._max.createdAt);
  }
  const recentEventMap = new Map<string, number>();
  if (recentEventsResult.status === 'fulfilled') {
    for (const row of recentEventsResult.value) recentEventMap.set(row.userId, row._count._all);
  }
  const courseActivityMap = new Map<string, Date>();
  if (courseActivityResult.status === 'fulfilled') {
    for (const row of courseActivityResult.value) {
      if (row._max.lastActivityAt) courseActivityMap.set(row.userId, row._max.lastActivityAt);
    }
  }

  const healthCounts: Record<HealthStatus, number> = { green: 0, yellow: 0, red: 0 };
  if (membersForHealthResult.status === 'fulfilled') {
    for (const m of membersForHealthResult.value) {
      const status = calculateHealthStatus({
        lastEventAt: lastEventMap.get(m.id) ?? null,
        recentEventCount: recentEventMap.get(m.id) ?? 0,
        enrolledAt: m.enrolledAt,
        lastLoginAt: m.lastLoginAt,
        lastCourseActivityAt: courseActivityMap.get(m.id) ?? null,
      });
      healthCounts[status] += 1;
    }
  }

  const engagement: AnalyticsEngagement = {
    active: healthCounts.green,
    atRisk: healthCounts.yellow,
    inactive: healthCounts.red,
    notStarted: metrics.notStarted,
    stalled: metrics.stale,
  };

  // ── Outcomes ──
  const placements = placementsResult.status === 'fulfilled' ? placementsResult.value : 0;
  const pendingPlacements =
    pendingPlacementsResult.status === 'fulfilled' ? pendingPlacementsResult.value : 0;
  const completedTraining = metrics.completed;
  const outcomes: AnalyticsOutcomes = {
    placements,
    pendingPlacements,
    completedTraining,
    placementRatePct:
      completedTraining > 0 ? Math.round((placements / completedTraining) * 100) : null,
  };

  // ── Funding mix ──
  const funding: AnalyticsFundingRow[] = [];
  if (fundingResult.status === 'fulfilled') {
    for (const row of fundingResult.value) {
      const source = row.fundingSource;
      funding.push({
        source: source ?? 'UNSPECIFIED',
        label: source ? FUNDING_LABELS[source] : 'Not specified',
        count: row._count._all,
      });
    }
    funding.sort((a, b) => b.count - a.count);
  }

  // ── Programs (enrollment count per program) ──
  const programs: AnalyticsProgramRow[] = [];
  if (programResult.status === 'fulfilled') {
    for (const row of programResult.value) {
      programs.push({
        slug: row.programSlug,
        title: programDisplayTitle(row.programSlug),
        count: row._count._all,
      });
    }
    programs.sort((a, b) => b.count - a.count);
  }

  // ── Acquisition funnel (last 30 days, first-party data only) ──
  const settled = (r: PromiseSettledResult<number>) => (r.status === 'fulfilled' ? r.value : 0);
  const newAccounts = settled(newAccountsResult);
  const screenings = settled(screeningsResult);
  const qualifiedScreenings = settled(qualifiedScreeningsResult);
  const applicationsSubmitted = settled(applicationsSubmittedResult);
  const applicationsApproved = settled(applicationsApprovedResult);

  const rawSteps: Array<Omit<AnalyticsAcquisitionStep, 'conversionPct'>> = [
    {
      key: 'accounts',
      label: 'Accounts created',
      hint: 'New member accounts started in the apply flow.',
      count: newAccounts,
    },
    {
      key: 'screenings',
      label: 'Eligibility checks finished',
      hint: 'Members who answered the 3 eligibility questions.',
      count: screenings,
    },
    {
      key: 'applications',
      label: 'Applications submitted',
      hint: 'Members who picked a program and submitted.',
      count: applicationsSubmitted,
    },
    {
      key: 'approved',
      label: 'Applications approved',
      hint: 'Members approved and ready to enroll.',
      count: applicationsApproved,
    },
  ];

  const steps: AnalyticsAcquisitionStep[] = rawSteps.map((step, i) => {
    const prev = i > 0 ? rawSteps[i - 1].count : 0;
    return {
      ...step,
      conversionPct: i > 0 && prev > 0 ? Math.round((step.count / prev) * 100) : null,
    };
  });

  const acquisition: AnalyticsAcquisition = {
    windowDays: 30,
    steps,
    qualifiedScreenings,
  };

  return { funnel, engagement, outcomes, funding, programs, acquisition };
}
