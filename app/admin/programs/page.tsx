import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { ADMIN_SSR_LIST_CAP } from '@/lib/db/queryCaps';

import { getProgramBySlug, PROGRAMS } from '@/lib/content/programs';
import { getValidatedProgramCompletionSpec } from '@/lib/reporting/programCompletion';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import AdminProgramCatalogClient from '@/components/admin/AdminProgramCatalogClient';
import {
  ProgramsCatalogKit,
  type ProgramCard,
} from '@/components/portal/kit/pages/admin-subviews/ProgramsCatalogKit';
import { DesignSurface } from '@/components/portal/kit';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin – Programs',
  description: 'Program overview and enrollment stats.',
  path: '/admin/programs',
});
}

/** Build a short credential/skills description line for a program card. */
function describeProgram(skills: string[], partner: string): string {
  const top = skills.slice(0, 3).filter(Boolean);
  if (top.length > 0) return top.join(', ');
  return partner || 'Workforce program';
}

export default async function AdminProgramsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/programs');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // Multi-program-aware: count members per program from `course_enrollments`
  // (the source of truth for multi-program learners). A learner with rows in
  // both `it-cyber` and `ai-software` is counted once under each program,
  // not just under their primary `User.enrolledProgram`. Lean + degrades
  // gracefully: a failed aggregate still renders the catalog with empty stats.
  const enrollmentResult = await withAdminPageScope(scope, (db) => db.courseEnrollment
    .findMany({
      take: ADMIN_SSR_LIST_CAP,
      where: { user: { deletedAt: null } },
      select: {
        programSlug: true,
        curriculumVersion: true,
        user: {
          select: {
            id: true,
            assessmentScorePct: true,
            memberProgramProgress: {
              select: { programSlug: true, coursesCompleted: true },
            },
          },
        },
      },
    })
    .catch((reason: unknown) => {
      console.error('[admin/programs] enrollment load failed', reason);
      return null;
    }));
  if (!enrollmentResult) {
    return <AdminDataLoadError title="Could not load program enrollment data" />;
  }

  const byProgram = new Map<
    string,
    { count: number; scores: number[]; completed: number; totalCourseSlots: number }
  >();
  const seenLearners = new Set<string>();
  for (const e of enrollmentResult) {
    const completionSpec = getValidatedProgramCompletionSpec(
      e.programSlug,
      e.curriculumVersion,
    );
    const slug =
      completionSpec?.canonicalSlug
      ?? getProgramBySlug(e.programSlug)?.slug
      ?? e.programSlug;
    const prog = byProgram.get(slug) ?? {
      count: 0,
      scores: [],
      completed: 0,
      totalCourseSlots: 0,
    };
    prog.count++;
    if (e.user.assessmentScorePct != null) prog.scores.push(e.user.assessmentScorePct);
    const completed = e.user.memberProgramProgress.find(
      (row) => (getProgramBySlug(row.programSlug)?.slug ?? row.programSlug) === slug,
    )?.coursesCompleted ?? 0;
    prog.completed += completed;
    prog.totalCourseSlots += completionSpec?.totalCourses ?? 0;
    byProgram.set(slug, prog);
    seenLearners.add(e.user.id);
  }

  const totalEnrollments = seenLearners.size;
  const programStats = PROGRAMS.map((program) => {
    const stats = byProgram.get(program.slug) ?? {
      count: 0,
      scores: [],
      completed: 0,
      totalCourseSlots: 0,
    };
    const avgScore = stats.scores.length > 0
      ? Math.round(stats.scores.reduce((sum, score) => sum + score, 0) / stats.scores.length)
      : null;
    const totalCourseSlots = stats.totalCourseSlots;
    const progressPct = totalCourseSlots > 0 && stats.completed > 0
      ? Math.min(100, Math.round((stats.completed / totalCourseSlots) * 100))
      : 0;

    return {
      program,
      stats,
      avgScore,
      progressPct,
    };
  });

  // --- DEFAULT: kit program catalog (card grid + StatusTag) ---
  if (requestedUi !== 'legacy') {
    // Card per enrolled program (mockup shows only programs with learners).
    // Completion % is derived leanly from coursesCompleted / total course slots;
    // when no progress is recorded the % is omitted rather than shown as 0.
    const cards: ProgramCard[] = programStats
      .filter(({ stats }) => stats.count > 0)
      .map(({ program, stats, progressPct }) => ({
        slug: program.slug,
        title: program.title,
        description: describeProgram(program.skills, program.partner),
        category: program.category,
        enrolled: stats.count,
        completion: stats.completed > 0 ? progressPct : null,
      }));

    const activePrograms = cards.length;

    return (
      <DesignSurface surface="dense">
        <ProgramsCatalogKit
          programs={cards}
          activePrograms={activePrograms}
          totalEnrolled={totalEnrollments}
        />
      </DesignSurface>
    );
  }

  // --- LEGACY (?ui=legacy): original catalog editor + enrollment stats ---
  return (
    <PortalPageFrame>
      <PageHeader
        title="Programs"
        subtitle="Manage the program catalog (homepage, enrollment, employer filters). Enrollment stats below."
      />

      {/* Enrollment stats shown first so the stable server-rendered cards are immediately visible */}
      <section aria-labelledby="program-enrollment-stats-heading" style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <h2 id="program-enrollment-stats-heading" style={{ fontSize: '1.15rem', margin: 0 }}>Enrollment stats</h2>
        </div>

        {totalEnrollments === 0 ? (
          <div className="admin-empty-state">
            <h3>No enrollments yet</h3>
            <p>When members choose programs, their enrollment and progress will appear here.</p>
            <Link href="/admin/members" className="btn btn-primary">View Members</Link>
          </div>
        ) : (
          <div
            data-program-stats-tree="single-responsive-tree"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
              gap: '0.75rem',
            }}
          >
            {programStats.map(({ program, stats, avgScore, progressPct }) => (
              <article
                key={program.slug}
                data-program-stats-card
                data-program-slug={program.slug}
                className="portal-card portal-card--flat"
                style={{ padding: '1.125rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.875rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
                      {program.category ?? 'Program'}
                    </p>
                    <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.3, wordBreak: 'break-word' }}>
                      {program.title}
                    </p>
                  </div>
                  {stats.count > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.625rem', borderRadius: '9999px', background: 'rgba(173,44,77,0.1)', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1" }}>school</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-accent)' }}>{stats.count}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.625rem', marginBottom: progressPct > 0 ? '0.875rem' : 0 }}>
                  <div data-program-metric="enrolled">
                    <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Enrolled</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800, color: stats.count > 0 ? 'var(--color-accent)' : 'var(--color-on-surface-variant)', margin: 0, letterSpacing: '-0.03em' }}>{stats.count}</p>
                  </div>
                  <div data-program-metric="avg-score">
                    <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Avg Score</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800, color: avgScore !== null && avgScore >= 70 ? 'var(--color-green, #4a9b4f)' : 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.03em' }}>
                      {avgScore !== null ? `${avgScore}%` : '—'}
                    </p>
                  </div>
                  <div data-program-metric="courses-completed">
                    <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.2rem' }}>Courses</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-on-surface)', margin: 0, letterSpacing: '-0.03em' }}>{stats.completed}</p>
                  </div>
                </div>

                {progressPct > 0 && (
                  <div className="portal-progress-bar portal-progress-bar--thin">
                    <div className="portal-progress-bar__fill" style={{ width: `${progressPct}%` }} />
                  </div>
                )}

                {stats.count > 0 && (
                  <div style={{ marginTop: '0.875rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <a
                      href={`/api/admin/cohort-export?program=${encodeURIComponent(program.slug)}`}
                      className="btn btn-outline btn-sm"
                      data-program-action="cohort-csv"
                      aria-label={`Download cohort CSV for ${program.title}`}
                    >
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                        style={{ fontSize: '1rem', marginRight: '0.25rem', verticalAlign: 'middle' }}
                      >
                        download
                      </span>
                      Cohort CSV
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Program catalog editor — below stats to avoid flash */}
      <section style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Program catalog settings</h2>
          <a href="/api/admin/programs/export-twc" className="btn btn-outline btn-sm">
            Export for TX state approval (CSV)
          </a>
        </div>
        {readOnlyAudit ? (
          <div
            data-portal-audit-suppressed="admin-program-catalog-seed-and-cache"
            className="portal-card portal-card--flat"
            style={{ padding: '1rem' }}
          >
            Catalog editing is reserved for the attended admin check so the release audit cannot seed or cache program rows.
          </div>
        ) : (
          <AdminProgramCatalogClient />
        )}
      </section>
    </PortalPageFrame>
  );
}
