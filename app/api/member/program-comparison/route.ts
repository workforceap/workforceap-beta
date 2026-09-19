import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getProgramComparisonTracks } from '@/lib/content/programComparisonTracks';
import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * GET /api/member/program-comparison
 * Read-only, static comparison data (duration/difficulty/demand/certs) for the
 * featured career tracks — powers the compare panel in the program
 * change request modal (components/portal/ProgramChangeRequestModal.tsx) so
 * members can weigh options before requesting a switch. Content mirrors what
 * already exists on the public /program-comparison marketing page; gated
 * behind login only for consistency with other /api/member/* routes, not
 * because the content itself is sensitive.
 */
async function _GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tracks = getProgramComparisonTracks();
    return NextResponse.json({
      tracks: tracks.map((t) => ({
        slug: t.slug,
        shortName: t.shortName,
        duration: t.duration,
        difficulty: t.difficulty,
        demand: t.demand,
        certs: t.certs,
      })),
    });
  } catch (error) {
    console.error('/member/program-comparison GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
