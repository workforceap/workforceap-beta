import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { z } from 'zod';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';

const chapterSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  leaderId: z.string().uuid().optional(),
  meetingSchedule: z.string().max(500).optional(),
  meetingLocation: z.string().max(500).optional(),
  curriculumNotes: z.string().max(5000).optional(),
});

/** List all chapters for admin */
async function _GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const orgId = await getActorOrganizationId(user.id);
    const chapters = await withTenantScope(orgId, (db) =>
      db.chapter.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          leader: { select: { id: true, fullName: true, email: true } },
          _count: { select: { members: true } },
        },
      }),
    );

    return NextResponse.json(chapters);
  } catch (error) {
    console.error('/admin/chapters GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Create a new chapter */
async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = chapterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const orgId = await getActorOrganizationId(user.id);
    if (parsed.data.leaderId) {
      const leader = await withTenantScope(orgId, (db) => db.user.findFirst({
        where: { id: parsed.data.leaderId, organizationId: orgId, deletedAt: null },
        select: { id: true },
      }));
      if (!leader) {
        return NextResponse.json({ error: 'Leader user not found in your organization' }, { status: 400 });
      }
    }
    const chapter = await withTenantScope(orgId, (db) =>
      db.chapter.create({
        data: {
          organizationId: orgId,
          ...parsed.data,
        },
        include: {
          leader: { select: { id: true, fullName: true, email: true } },
        },
      }),
    );

    void auditLog({ actorUserId: user.id, action: 'admin_chapter_create', targetType: 'chapter', targetId: chapter.id, metadata: { name: chapter.name } }).catch(() => {});

    return NextResponse.json(chapter, { status: 201 });
  } catch (error) {
    console.error('/admin/chapters POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
export const POST = withApiGuc(_POST);
