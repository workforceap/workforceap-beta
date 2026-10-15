import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import AssessmentsTable from '@/components/admin/AssessmentsTable';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';
import { TableSkeleton } from '@/components/ui/Skeleton';
import PageHeader from '@/components/portal/PageHeader';
import { DesignSurface } from '@/components/portal/kit';
import {
  AssessmentsKit,
  type AssessmentRow,
} from '@/components/portal/kit/pages/admin-subviews/AssessmentsKit';
// Server-only: holds the answer key. Used here to pre-compute per-question
// correctness so AssessmentsTable (client) doesn't need to ship the key.
import { ASSESSMENT_QUESTIONS, type QuestionChoice } from '@/lib/assessment/answer-key';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin – Skills assessments',
  description: 'View and export member skills assessment results.',
  path: '/admin/assessments',
});
}

export default async function AdminAssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    program?: string;
    minScore?: string;
    maxScore?: string;
    userId?: string;
    ui?: string;
    page?: string;
  }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/assessments');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = await searchParams;

  // --- DEFAULT: design-kit assessments catalog wired into real (lean) data ---
  if (params.ui !== 'legacy') {
    return renderKit(scope);
  }

  // --- LEGACY (?ui=legacy): the proven results table + per-member drill-in ---
  return renderLegacy({ params, scope });
}

/**
 * Design-kit default: dense assessment catalog → <AssessmentsKit/>.
 *
 * The platform tracks one combined skills + readiness assessment per member
 * (User.assessmentCompleted / assessmentScorePct). We feed REAL completion +
 * average figures for that assessment. Lean: a single count + a single average
 * aggregate, run in parallel; aggregate failures degrade gracefully.
 */
async function renderKit(scope: import("@/lib/tenant/adminPageScope").AdminPageTenantOk) {
  const completedWhere = {
    assessmentCompleted: true,
    assessmentCompletedAt: { not: null } as const,
  };

  const [completionsResult, avgResult] = await Promise.allSettled([
    withAdminPageScope(scope, (db) => db.user.count({ where: completedWhere })),
    withAdminPageScope(scope, (db) => db.user.aggregate({
      where: { ...completedWhere, assessmentScorePct: { not: null } },
      _avg: { assessmentScorePct: true },
    })),
  ]);

  // If the core count fails, fall back to the proven legacy table rather than
  // rendering a fabricated/empty kit.
  if (completionsResult.status === 'rejected') {
    redirect('/admin/assessments?ui=legacy');
  }

  const completions = completionsResult.value;
  const avgPct =
    avgResult.status === 'fulfilled' ? avgResult.value._avg.assessmentScorePct : null;
  const avgScore =
    avgPct != null && completions > 0 ? `${Math.round(avgPct)}%` : '—';

  const assessments: AssessmentRow[] = [
    {
      id: 'skills-readiness',
      assessment: 'Skills & Readiness Assessment',
      type: 'Knowledge',
      completions,
      avgScore,
      status: 'Live',
    },
  ];

  return (
    <DesignSurface surface="dense">
      {avgResult.status === 'rejected' ? <span hidden data-portal-error-state="admin-assessments-average-load" /> : null}
      <AssessmentsKit assessments={assessments} totalCompletions={completions} />
    </DesignSurface>
  );
}

/** Legacy results table + per-member drill-in (preserved behind ?ui=legacy). */
async function renderLegacy({
  params,
  scope,
}: {
  params: { program?: string; minScore?: string; maxScore?: string; userId?: string; page?: string };
  scope: import("@/lib/tenant/adminPageScope").AdminPageTenantOk;
}) {
  const programFilter = params.program?.trim() || undefined;
  const minScore = params.minScore ? parseInt(params.minScore, 10) : undefined;
  const maxScore = params.maxScore ? parseInt(params.maxScore, 10) : undefined;
  const highlightUserId = params.userId?.trim() || undefined;
  const pageParam = params.page ? parseInt(params.page, 10) : 1;
  const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const pageSize = 50;

  const andConditions: Array<Record<string, unknown>> = [];
  if (minScore !== undefined && !Number.isNaN(minScore)) {
    andConditions.push({ assessmentScorePct: { gte: minScore } });
  }
  if (maxScore !== undefined && !Number.isNaN(maxScore)) {
    andConditions.push({ assessmentScorePct: { lte: maxScore } });
  }

  const where = {
    assessmentCompleted: true,
    assessmentCompletedAt: { not: null } as const,
    ...(programFilter && { programInterest: { contains: programFilter, mode: 'insensitive' as const } }),
    ...(andConditions.length > 0 && { AND: andConditions }),
  };

  let users;
  let totalCount: number;
  try {
    // Run the page of results and the filtered count in parallel; a count
    // failure degrades to the loaded page length rather than hiding the table.
    const [usersResult, countResult] = await Promise.allSettled([
      withAdminPageScope(scope, (db) => db.user.findMany({
        where,
        orderBy: { assessmentCompletedAt: 'desc' },
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          programInterest: true,
          assessmentScore: true,
          assessmentScorePct: true,
          assessmentCompletedAt: true,
          assessmentAnswers: true,
          assessmentAttemptCount: true,
          assessmentRetakeRequestedAt: true,
        },
      })),
      withAdminPageScope(scope, (db) => db.user.count({ where })),
    ]);
    if (usersResult.status === 'rejected') throw usersResult.reason;
    users = usersResult.value;
    if (countResult.status === 'rejected') {
      console.error('[admin/assessments] count failed', countResult.reason);
      totalCount = users.length;
    } else {
      totalCount = countResult.value;
    }
  } catch (e) {
    console.error('[admin/assessments] load failed', e);
    return <AdminDataLoadError title="Assessments unavailable" />;
  }

  // Pre-compute per-question correctness on the server so the client
  // bundle never receives the answer key (AUDIT §C-B3 defense-in-depth).
  const correctnessByUserId: Record<string, Record<number, boolean>> = {};
  for (const u of users) {
    const map: Record<number, boolean> = {};
    const raw = u.assessmentAnswers;
    if (raw && typeof raw === 'object') {
      const recorded = raw as Record<string | number, string | undefined>;
      for (const q of ASSESSMENT_QUESTIONS) {
        const ans = recorded[q.id] ?? recorded[String(q.id)];
        map[q.id] = ans === (q.correct as QuestionChoice);
      }
    }
    correctnessByUserId[u.id] = map;
  }

  return (
    <div>
      <PageHeader title="Skills assessments" subtitle="View member assessment results and export for counselor review." />

      <div>
          <Suspense fallback={<TableSkeleton rows={8} cols={6} />}>
            <AssessmentsTable
              users={users}
              correctnessByUserId={correctnessByUserId}
              highlightUserId={highlightUserId}
              programFilter={programFilter}
              minScore={minScore}
              maxScore={maxScore}
              totalCount={totalCount}
              currentPage={currentPage}
              pageSize={pageSize}
            />
          </Suspense>
      </div>
    </div>
  );
}
