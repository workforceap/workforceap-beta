import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';
import {
  partnerEventLabel,
  partnerPlacementLabel,
  partnerVisibleEventNames,
} from '@/lib/partner/partnerVisibleEvents';
import { captureApiError } from '@/lib/observability/captureApiError';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const GET = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const ctx = await getPartnerForUser(user.id);
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const { searchParams } = new URL(request.url);
    const memberIdFilter = searchParams.get('memberId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
  
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
  
    if (fromDate && isNaN(fromDate.getTime())) {
      return NextResponse.json({ error: 'Invalid from date' }, { status: 400 });
    }
    if (toDate && isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Invalid to date' }, { status: 400 });
    }
  
    try {
    const { members } = await loadPartnerReferralBundle(ctx.partnerId, ctx.partner.organizationId);
  
    type MilestoneRow = {
      id: string;
      kind: string;
      label: string;
      memberId: string;
      memberName: string;
      at: string;
    };
  
    const rows: MilestoneRow[] = [];
  
    const inRange = (d: Date) => {
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    };
  
    for (const m of members) {
      if (memberIdFilter && m.id !== memberIdFilter) continue;
  
      for (const c of m.userCertifications) {
        if (!c.earnedAt) continue;
        if (!inRange(c.earnedAt)) continue;
        rows.push({
          id: `cert-${m.id}-${c.certName}-${c.earnedAt.toISOString()}`,
          kind: 'certification',
          label: `Earned ${c.certName}`,
          memberId: m.id,
          memberName: m.fullName,
          at: c.earnedAt.toISOString(),
        });
      }
  
      const placedAt = m.placementRecord?.placedAt;
      if (placedAt && inRange(placedAt)) {
        rows.push({
          id: `placement-${m.id}`,
          kind: 'placement',
          // Confirmed wording (employer, job) only once the start date is
          // verified; a member self-report reads as pending (#2570 rule).
          label: partnerPlacementLabel(m.placementRecord!),
          memberId: m.id,
          memberName: m.fullName,
          at: placedAt.toISOString(),
        });
      }
    }
  
    const ids = memberIdFilter
      ? members.filter((m) => m.id === memberIdFilter).map((m) => m.id)
      : members.map((m) => m.id);
  
    if (ids.length > 0) {
      // Partner-visible milestone events only (WAP-214, Vision C3): logins,
      // page views, tool runs and staff events are never shown, and the rail
      // badge counts this same list.
      const eventWhere: {
        userId: { in: string[] };
        eventName: { in: string[] };
        createdAt?: { gte?: Date; lte?: Date };
      } = {
        userId: { in: ids },
        eventName: { in: partnerVisibleEventNames() },
      };
      if (fromDate || toDate) {
        eventWhere.createdAt = {};
        if (fromDate) eventWhere.createdAt.gte = fromDate;
        if (toDate) eventWhere.createdAt.lte = toDate;
      }
  
      const events = await prisma.$transaction((tx) => tx.memberEvent.findMany({
        where: eventWhere,
        orderBy: { createdAt: 'desc' },
        take: 200,
        // Metadata is never selected: a partner sees a fixed label only.
        select: {
          id: true,
          userId: true,
          eventName: true,
          createdAt: true,
          user: { select: { fullName: true } },
        },
      }));
  
      for (const ev of events) {
        const label = partnerEventLabel(ev.eventName);
        if (!label) continue;
        rows.push({
          id: ev.id,
          kind: 'event',
          label,
          memberId: ev.userId,
          memberName: ev.user.fullName,
          at: ev.createdAt.toISOString(),
        });
      }
    }
  
    rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  
    return NextResponse.json({ milestones: rows.slice(0, 150) });
    } catch (err) {
      captureApiError(err, { route: 'partner/milestones' });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  } catch (error) {
    console.error('/partner/milestones:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
