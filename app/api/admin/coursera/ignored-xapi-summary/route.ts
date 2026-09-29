import { NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/server';
import { isAdminInOrg, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { captureApiError } from '@/lib/observability/captureApiError';
import { getActorOrganizationId } from '@/lib/tenant/organization';

import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * GET /api/admin/coursera/ignored-xapi-summary
 *
 * Diagnostic for the most common cause of a stuck Coursera pipeline:
 * inbound xAPI progress events whose course doesn't resolve through any of
 * (a) `coursera_canonical_course_mappings`, (b) the discovered catalog,
 * (c) the static `Program.courses[]` slug list. Those land with
 * `completion_status='unresolved_course'` and never promote to
 * `course_progress`; `'unmatched'` events never bound to a member.
 *
 * `'ignored'` is normal traffic (progress written, or not a course-progress
 * verb), so it is reported as a context total only and is not "stuck"
 * (WAP-276). Rows recorded before that status existed may still read
 * `'ignored'` although they dropped progress.
 *
 * Returns the top N stuck course slugs in the last 30 days, plus an
 * `outstandingTotal` (unresolved + unmatched) so the admin UI can flag a
 * backlog.
 *
 * Read-only. Auth: super_admin OR admin in the actor's org.
 */

const DEFAULT_LIMIT = 25;
const LOOKBACK_DAYS = 30;

type IgnoredSlugRow = {
  course_slug: string | null;
  course_name: string | null;
  event_count: bigint;
  distinct_learners: bigint;
  first_seen: Date | null;
  last_seen: Date | null;
};export const GET = withApiGuc(async (request: Request) => {
  try {
    const actor = await getUser();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    let orgId: string;
    try {
      orgId = await getActorOrganizationId(actor.id);
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/ignored-xapi-summary' });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const superAdmin = await isSuperAdmin(actor.id);
    if (!superAdmin && !(await isAdminInOrg(actor.id, orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get('limit'));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 100
      ? Math.floor(rawLimit)
      : DEFAULT_LIMIT;
  
    // Same scope as the health page loaders: super admins see every tenant,
    // an org admin sees only their own org's events (WAP-276).
    const organizationId: string | null = superAdmin ? null : orgId;

    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  
      // Two raw queries: one for the top-N detail, one for the outstanding
      // totals. Kept simple instead of a single window-function query so the
      // shape is easy to read in admin diagnostics.
      const rows = await prisma.$queryRaw<IgnoredSlugRow[]>`
        SELECT
          course_slug,
          MAX(course_name) AS course_name,
          COUNT(*)::bigint AS event_count,
          COUNT(DISTINCT actor_email)::bigint AS distinct_learners,
          MIN(received_at) AS first_seen,
          MAX(received_at) AS last_seen
        FROM coursera_xapi_events
        WHERE completion_status IN ('unresolved_course', 'unmatched')
          AND received_at >= ${since}
          AND (${organizationId}::text IS NULL OR organization_id = ${organizationId})
        GROUP BY course_slug
        ORDER BY event_count DESC
        LIMIT ${limit}
      `;
  
      const totals = await prisma.$queryRaw<
        { completion_status: string; total: bigint }[]
      >`
        SELECT completion_status, COUNT(*)::bigint AS total
        FROM coursera_xapi_events
        WHERE completion_status IN ('ignored', 'unresolved_course', 'unmatched')
          AND received_at >= ${since}
          AND (${organizationId}::text IS NULL OR organization_id = ${organizationId})
        GROUP BY completion_status
      `;
  
      const totalFor = (status: string) =>
        Number(totals.find((t) => t.completion_status === status)?.total ?? 0);
      const ignoredTotal = totalFor('ignored');
      const unresolvedTotal = totalFor('unresolved_course');
      const unmatchedTotal = totalFor('unmatched');
      const outstandingTotal = unresolvedTotal + unmatchedTotal;
  
      return NextResponse.json({
        lookbackDays: LOOKBACK_DAYS,
        outstandingTotal,
        ignoredTotal,
        unresolvedTotal,
        unmatchedTotal,
        topSlugs: rows.map((r) => ({
          courseSlug: r.course_slug,
          courseName: r.course_name,
          eventCount: Number(r.event_count),
          distinctLearners: Number(r.distinct_learners),
          firstSeen: r.first_seen,
          lastSeen: r.last_seen,
        })),
      });
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/ignored-xapi-summary' });
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'Failed to compute ignored xAPI summary',
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('/admin/coursera/ignored-xapi-summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
