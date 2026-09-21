import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadata } from '@/app/seo';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { isSuperAdmin } from '@/lib/auth/roles';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { getProfileRole } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_HISTORY_CAP } from '@/lib/db/queryCaps';

import { withDbRetry } from '@/lib/db/withDbRetry';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import CourseraProgressCard from '@/components/portal/CourseraProgressCard';
import DataTable from '@/components/portal/ui/DataTable';
import SectionHeader from '@/components/portal/ui/SectionHeader';
import {
  loadLearnerProgressByUserId,
  type LearnerBadgeRow,
  type LearnerCourseRow,
} from '@/lib/coursera/progressQueries';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { programDisplayTitle } from '@/lib/content/programTitle';

export const metadata: Metadata = buildPageMetadata({
  title: 'Coursera learner detail',
  description: 'Per-learner Coursera course progress and identity mappings.',
  path: '/admin/coursera/learners',
});

export const dynamic = 'force-dynamic';

type IdentityMappingRow = {
  id: string;
  courseraEmail: string | null;
  actorIdentifier: string | null;
  actorHomePage: string | null;
  source: string;
  notes: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
};

async function loadIdentityMappingsForUser(userId: string): Promise<IdentityMappingRow[]> {
  // The table is now modeled as `CourseraIdentityMapping` in Prisma. We still
  // tolerate "table does not exist" errors so the page renders against fresh
  // DBs that haven't run `prisma migrate deploy` yet (the on-demand creator
  // in lib/xapi/mappings.ts only fires on xAPI ingest, not on this page).
  try {
    const rows = await prisma.courseraIdentityMapping.findMany({
      take: MEMBER_HISTORY_CAP,
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        courseraEmail: true,
        actorIdentifier: true,
        actorHomePage: true,
        source: true,
        notes: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return rows;
  } catch (err) {
    console.error('[admin/coursera/learners] failed to load identity mappings:', err);
    return [];
  }
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleString();
}

export default async function AdminCourseraLearnerPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const actor = await getUser();
  if (!actor) redirect(`/login?redirectTo=/admin/coursera/learners/${userId}`);
  const scope = await resolveAdminPageTenant(actor.id);
  if (!scope.ok) redirect('/dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const actorOrgId = await getActorOrganizationId(actor.id);
  const isSuper = await isSuperAdmin(actor.id);

  const member = await withAdminPageScope(scope, (db) => db.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
      ...(isSuper ? {} : { organizationId: actorOrgId }),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      enrolledProgram: true,
      workspaceEmail: true,
      workspaceEmailProvisioned: true,
    },
  }));
  if (!member) notFound();

  const role = await withDbRetry(() => getProfileRole(member.id)).catch((err) => {
    console.error('[admin:coursera-learner] profileRole lookup failed; degrading to member', err);
    return 'member';
  });

  const identityMappings = await loadIdentityMappingsForUser(member.id);
  const csvProgress = await loadLearnerProgressByUserId(member.id);

  return (
    <PortalPageFrame>
      <PageHeader
        title={member.fullName || member.email}
        subtitle="Read-only Coursera detail for this learner."
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Coursera', href: '/admin/coursera' },
          { label: member.fullName || member.email },
        ]}
      />

      <section
        className="content-card"
        style={{
          padding: '1rem 1.1rem',
          marginBottom: '1rem',
          display: 'grid',
          gap: '0.4rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Identity</h2>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(8rem, max-content) 1fr',
            columnGap: '1rem',
            rowGap: '0.35rem',
            margin: 0,
            fontSize: '0.9rem',
          }}
        >
          <dt style={{ color: 'var(--color-on-surface-variant)' }}>Name</dt>
          <dd style={{ margin: 0 }}>{member.fullName || '—'}</dd>
          <dt style={{ color: 'var(--color-on-surface-variant)' }}>Email</dt>
          <dd style={{ margin: 0 }}>{member.email}</dd>
          <dt style={{ color: 'var(--color-on-surface-variant)' }}>Role</dt>
          <dd style={{ margin: 0 }}>{role}</dd>
          <dt style={{ color: 'var(--color-on-surface-variant)' }}>Enrolled program</dt>
          <dd style={{ margin: 0 }}>{member.enrolledProgram ? programDisplayTitle(member.enrolledProgram) : '—'}</dd>
          <dt style={{ color: 'var(--color-on-surface-variant)' }}>Workspace email</dt>
          <dd style={{ margin: 0 }}>
            {member.workspaceEmail
              ? `${member.workspaceEmail}${member.workspaceEmailProvisioned ? '' : ' (not yet provisioned)'}`
              : '—'}
          </dd>
        </dl>
      </section>

      <div style={{ marginBottom: '1rem' }}>
        <CourseraProgressCard userId={member.id} readOnlyAudit={readOnlyAudit} />
      </div>

      {csvProgress && csvProgress.courses.length > 0 ? (
        <section
          className="content-card"
          style={{ padding: '1rem 1.1rem', marginBottom: '1rem', display: 'grid', gap: '0.6rem' }}
        >
          <SectionHeader title={`Coursera courses (from CSV) (${csvProgress.courses.length})`} />
          <div style={{ overflowX: 'auto' }}>
            <DataTable<LearnerCourseRow>
              density="compact"
              scrollX={false}
              rows={csvProgress.courses}
              rowKey={(course) => course.id}
              columns={[
                {
                  key: 'course',
                  header: 'Course',
                  cell: (course) => (
                    <>
                      <strong>{course.courseName}</strong>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                        {course.university ?? course.programName ?? course.programSlug}
                      </div>
                    </>
                  ),
                },
                {
                  key: 'progress',
                  header: 'Progress',
                  align: 'right',
                  cell: (course) => (
                    <>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{course.overallProgress.toFixed(2)}%</span>
                      {course.isCompleted ? (
                        <span
                          style={{
                            marginLeft: '0.4rem',
                            fontSize: '0.8125rem',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '0.4rem',
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: 'rgb(22, 163, 74)',
                          }}
                        >
                          done
                        </span>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: 'hours',
                  header: 'Hours',
                  align: 'right',
                  cell: (course) => (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{course.learningHours.toFixed(2)}</span>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'last',
                  header: 'Last activity',
                  cell: (course) => formatDateTime(course.lastActivityTime),
                },
                {
                  key: 'cert',
                  header: 'Certificate',
                  cell: (course) =>
                    course.certificateUrl ? (
                      <a href={course.certificateUrl} target="_blank" rel="noreferrer">
                        view ↗
                      </a>
                    ) : (
                      '—'
                    ),
                  hideOnMobile: true,
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      {/* Learning Path rows are Coursera's program-level percentage, not
          courses: they are kept out of the course table and its count (which
          otherwise read 5 of 7 where 5 of 6 is true) but still shown here, so
          this raw learner view does not silently drop rows that exist in
          coursera_course_progress. */}
      {csvProgress && csvProgress.learningPaths.length > 0 ? (
        <section
          className="content-card"
          style={{ padding: '1rem 1.1rem', marginBottom: '1rem', display: 'grid', gap: '0.6rem' }}
        >
          <SectionHeader title={`Coursera Learning Paths (${csvProgress.learningPaths.length})`} />
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Coursera&rsquo;s program-level percentage. Not counted as a course anywhere.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <DataTable<LearnerCourseRow>
              density="compact"
              scrollX={false}
              rows={csvProgress.learningPaths}
              rowKey={(path) => path.id}
              columns={[
                {
                  key: 'path',
                  header: 'Learning Path',
                  cell: (path) => (
                    <>
                      <strong>{path.courseName}</strong>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                        {path.courseraCourseId}
                      </div>
                    </>
                  ),
                },
                {
                  key: 'progress',
                  header: 'Progress',
                  align: 'right',
                  cell: (path) => (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{path.overallProgress.toFixed(2)}%</span>
                  ),
                },
                {
                  key: 'last',
                  header: 'Last activity',
                  cell: (path) => formatDateTime(path.lastActivityTime),
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      {csvProgress && csvProgress.badges.length > 0 ? (
        <section
          className="content-card"
          style={{ padding: '1rem 1.1rem', marginBottom: '1rem', display: 'grid', gap: '0.6rem' }}
        >
          <SectionHeader title={`Specializations / badges (from CSV) (${csvProgress.badges.length})`} />
          <div style={{ overflowX: 'auto' }}>
            <DataTable<LearnerBadgeRow>
              density="compact"
              scrollX={false}
              rows={csvProgress.badges}
              rowKey={(badge) => badge.id}
              columns={[
                {
                  key: 'badge',
                  header: 'Badge',
                  cell: (badge) => (
                    <>
                      <strong>{badge.badgeTitle}</strong>
                      {badge.badgeCompleted ? (
                        <span
                          style={{
                            marginLeft: '0.4rem',
                            fontSize: '0.8125rem',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '0.4rem',
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: 'rgb(22, 163, 74)',
                          }}
                        >
                          completed
                        </span>
                      ) : null}
                      {badge.badgeLink ? (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                          <a href={badge.badgeLink} target="_blank" rel="noreferrer">
                            badge link ↗
                          </a>
                        </div>
                      ) : null}
                    </>
                  ),
                },
                {
                  key: 'progress',
                  header: 'Progress',
                  align: 'right',
                  cell: (badge) => (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{badge.progressPercent.toFixed(2)}%</span>
                  ),
                },
                {
                  key: 'coursesDone',
                  header: 'Courses done',
                  align: 'right',
                  cell: (badge) => (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {badge.coursesCompleted}/{badge.numberOfCourses}
                    </span>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'current',
                  header: 'Current course',
                  cell: (badge) => badge.currentCourseName ?? '—',
                  hideOnMobile: true,
                },
                {
                  key: 'last',
                  header: 'Last activity',
                  cell: (badge) => formatDateTime(badge.lastActivityTime),
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      <section
        className="content-card"
        style={{ padding: '1rem 1.1rem', display: 'grid', gap: '0.6rem' }}
      >
        <SectionHeader
          title="Coursera identity mappings"
          subtitle="How this learner's Coursera activity is bound to their WorkforceAP account. Edits live on the main Coursera admin page."
        />
        {identityMappings.length === 0 ? (
          <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
            No identity mappings recorded for this learner.
          </span>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <DataTable<IdentityMappingRow>
              density="compact"
              scrollX={false}
              rows={identityMappings}
              rowKey={(row) => row.id}
              columns={[
                { key: 'email', header: 'Coursera email', cell: (row) => row.courseraEmail || '—' },
                {
                  key: 'actor',
                  header: 'Actor identifier',
                  cell: (row) =>
                    row.actorIdentifier ? (
                      <span style={{ wordBreak: 'break-all' }}>
                        {row.actorIdentifier}
                        {row.actorHomePage ? (
                          <span style={{ color: 'var(--color-on-surface-variant)' }}> @ {row.actorHomePage}</span>
                        ) : null}
                      </span>
                    ) : (
                      '—'
                    ),
                },
                { key: 'source', header: 'Source', cell: (row) => row.source },
                { key: 'last', header: 'Last seen', cell: (row) => formatDateTime(row.lastSeenAt) },
              ]}
            />
          </div>
        )}
      </section>
    </PortalPageFrame>
  );
}
