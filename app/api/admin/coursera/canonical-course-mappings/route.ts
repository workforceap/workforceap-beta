import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { promoteCsvProgressToCanonical } from '@/lib/coursera/csvImport.server';
import { getActorOrganizationId } from '@/lib/tenant/organization';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';

async function requireAdminUser() {
  const user = await getUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user;
}async function _POST(request: Request) {
  try {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const organizationId = await getActorOrganizationId(user.id);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    courseraCourseId,
    courseraCourseSlug,
    canonicalProgramSlug,
    canonicalCourseSlug,
    notes,
  } = (body ?? {}) as {
    courseraCourseId?: string;
    courseraCourseSlug?: string | null;
    canonicalProgramSlug?: string;
    canonicalCourseSlug?: string;
    notes?: string | null;
  };

  if (!courseraCourseId || typeof courseraCourseId !== 'string') {
    return NextResponse.json({ error: 'courseraCourseId is required' }, { status: 400 });
  }
  if (!canonicalProgramSlug || typeof canonicalProgramSlug !== 'string') {
    return NextResponse.json({ error: 'canonicalProgramSlug is required' }, { status: 400 });
  }
  if (!canonicalCourseSlug || typeof canonicalCourseSlug !== 'string') {
    return NextResponse.json({ error: 'canonicalCourseSlug is required' }, { status: 400 });
  }

  // Validate the canonical pair actually exists in the program defs so admins
  // can't create dangling mappings.
  const program = getProgramBySlug(canonicalProgramSlug);
  if (!program) {
    return NextResponse.json(
      { error: `No canonical program found for slug "${canonicalProgramSlug}"` },
      { status: 400 },
    );
  }
  const course = program.courses.find((c) => c.slug === canonicalCourseSlug);
  if (!course) {
    return NextResponse.json(
      {
        error: `Program "${canonicalProgramSlug}" has no course with slug "${canonicalCourseSlug}"`,
      },
      { status: 400 },
    );
  }

  const mapping = await prisma.$transaction((tx) => tx.courseraCanonicalCourseMapping.upsert({
    where: { courseraCourseId },
    create: {
      courseraCourseId,
      courseraCourseSlug: courseraCourseSlug ?? null,
      canonicalProgramSlug,
      canonicalCourseSlug,
      notes: notes ?? null,
      createdById: user.id,
    },
    update: {
      courseraCourseSlug: courseraCourseSlug ?? null,
      canonicalProgramSlug,
      canonicalCourseSlug,
      notes: notes ?? null,
    },
  }));

  // Re-run the raw → canonical promotion for every learner who has a row in
  // coursera_course_progress for this courseraCourseId. Without this, the
  // mapping wouldn't take effect on existing progress until the next CSV
  // import or B4B refresh — admins expect the dashboard to update right
  // after they hit "Save mapping".
  const affectedUsers = await prisma.$transaction((tx) => tx.courseraCourseProgress.findMany({
    where: { courseraCourseId, organizationId, userId: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
    take: 100,
  }));
  let promoted = 0;
  for (const { userId } of affectedUsers) {
    if (!userId) continue;
    const result = await promoteCsvProgressToCanonical({ organizationId, userId });
    promoted += result.upserted;
  }

  // Audit (WAP-18): a mapping change rewrites canonical progress for every affected learner.
  void auditLog({
    actorUserId: user.id,
    action: 'admin_coursera_canonical_mapping_upsert',
    targetType: 'coursera_canonical_course_mapping',
    targetId: mapping.id,
    metadata: {
      courseraCourseId,
      canonicalProgramSlug,
      canonicalCourseSlug,
      affectedUsers: affectedUsers.length,
      promotedRows: promoted,
      orgId: organizationId,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    mapping,
    promotedRows: promoted,
    affectedUsers: affectedUsers.length,
  });

  } catch (error) {
    console.error('/admin/coursera/canonical-course-mappings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);async function _DELETE(request: Request) {
  try {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const courseraCourseId = url.searchParams.get('courseraCourseId');
  if (!courseraCourseId) {
    return NextResponse.json({ error: 'courseraCourseId query param is required' }, { status: 400 });
  }

  const removed = await prisma.$transaction((tx) => tx.courseraCanonicalCourseMapping.deleteMany({
    where: { courseraCourseId },
  }));

  void auditLog({
    actorUserId: user.id,
    action: 'admin_coursera_canonical_mapping_delete',
    targetType: 'coursera_canonical_course_mapping',
    targetId: courseraCourseId,
    metadata: { courseraCourseId, removed: removed.count },
  }).catch(() => {});

  return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('/admin/coursera/canonical-course-mappings error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const DELETE = withApiGuc(_DELETE);

