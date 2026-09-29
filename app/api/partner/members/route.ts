import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';
import { withApiGuc } from '@/lib/db/withRequestGuc';

/** GET /api/partner/members
 *  Returns members referred by the partner.
 */
async function _GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const ctx = await getPartnerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { pipelineMembers } = await loadPartnerReferralBundle(
      ctx.partnerId,
      ctx.partner.organizationId,
    );

    const members = pipelineMembers.map((p) => {
      const verifiedPlacement = p.member.placementRecord?.startDateVerified === true
        ? p.member.placementRecord
        : null;
      return {
        id: p.member.id,
        fullName: p.member.fullName,
        stage: p.stage,
        progress: p.progress,
        programTitle: p.programTitle,
        allProgramTitles: p.allProgramTitles,
        referredAt: p.referredAt.toISOString(),
        enrolledAt: p.member.enrolledAt?.toISOString() ?? null,
        placedAt: verifiedPlacement?.placedAt?.toISOString() ?? null,
        employerName: verifiedPlacement?.employerName ?? null,
        jobTitle: verifiedPlacement?.jobTitle ?? null,
      };
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error('/partner/members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
