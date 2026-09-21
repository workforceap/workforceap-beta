import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';

async function _GET(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
    const skip = (page - 1) * limit;
    // `unreadFirst=1` lists every unread row before any read one (newest first
    // within each group) so a short dropdown can never hide unread rows behind
    // newer read ones while the badge still counts them.
    const unreadFirst = url.searchParams.get('unreadFirst') === '1';

    const [notifications, unreadCount, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: unreadFirst
          ? [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }]
          : { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({
        where: { userId: user.id, readAt: null },
      }),
      prisma.notification.count({
        where: { userId: user.id },
      }),
    ]);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data ?? null,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('/member/notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiGuc(_GET);
