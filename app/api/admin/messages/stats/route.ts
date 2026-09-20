import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { countMessageThreadsWithActivity, countThreadsWithSlaBreach, countUnansweredMemberThreads } from '@/lib/messages/superAdminMessageQueries';
import { withApiGuc } from '@/lib/db/withRequestGuc';

async function _GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [threadsWithMessages, unansweredMemberThreads, alerts48, alerts72] = await Promise.all([
      countMessageThreadsWithActivity(),
      countUnansweredMemberThreads(),
      countThreadsWithSlaBreach(48),
      countThreadsWithSlaBreach(72),
    ]);

    return NextResponse.json({
      threadsWithMessages,
      // Member messages with no staff reply yet, any age (WAP-168 fix 3).
      unansweredMemberThreads,
      slaBreaches48h: alerts48,
      slaBreaches72h: alerts72,
    });
  } catch (error) {
    console.error('[admin/messages/stats GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
