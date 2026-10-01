import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_ONLY_ROLE_NOT } from '@/lib/admin/memberOnlyWhere';
import { getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';
import { getSlaStatusForThreads, getThreadIdsBreachingSla } from '@/lib/messages/superAdminMessageQueries';
import type { MessageThreadKind, Prisma } from '@prisma/client';
import { captureApiError } from '@/lib/observability/captureApiError';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const HOURS_48_MS = 48 * 60 * 60 * 1000;

type InboxFilter = 'member' | 'employer' | 'partner' | 'all';

function parseInbox(raw: string | null): InboxFilter {
  if (raw === 'employer' || raw === 'partner' || raw === 'all') return raw;
  return 'member';
}async function _GET(request: NextRequest) {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const cursor = sp.get('cursor') ?? undefined;
  const limit = Math.min(Math.max(Number(sp.get('limit')) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const search = (sp.get('search') ?? '').trim();
  const alertsOnly = sp.get('alertsOnly') === '1' || sp.get('alertsOnly') === 'true';
  const inbox = alertsOnly ? 'member' : parseInbox(sp.get('inbox'));

  const memberSearchClause =
    search.length > 0
      ? ({
          OR: [
            { member: { fullName: { contains: search, mode: 'insensitive' } } },
            { member: { email: { contains: search, mode: 'insensitive' } } },
            { messages: { some: { body: { contains: search, mode: 'insensitive' } } } },
          ],
        } satisfies Prisma.MessageThreadWhereInput)
      : null;

  const employerSearchClause =
    search.length > 0
      ? ({
          OR: [
            { employer: { companyName: { contains: search, mode: 'insensitive' } } },
            { employer: { contactEmail: { contains: search, mode: 'insensitive' } } },
            { messages: { some: { body: { contains: search, mode: 'insensitive' } } } },
          ],
        } satisfies Prisma.MessageThreadWhereInput)
      : null;

  const partnerSearchClause =
    search.length > 0
      ? ({
          OR: [
            { partner: { name: { contains: search, mode: 'insensitive' } } },
            { messages: { some: { body: { contains: search, mode: 'insensitive' } } } },
          ],
        } satisfies Prisma.MessageThreadWhereInput)
      : null;

  const baseWhereForInbox = (): Prisma.MessageThreadWhereInput => {
    const hasMsg = { messages: { some: {} } };
    if (inbox === 'member') {
      return {
        kind: 'member',
        member: { deletedAt: null },
        ...hasMsg,
        ...(memberSearchClause ? { AND: [memberSearchClause] } : {}),
      };
    }
    if (inbox === 'employer') {
      return {
        kind: 'employer',
        ...hasMsg,
        ...(employerSearchClause ? { AND: [employerSearchClause] } : {}),
      };
    }
    if (inbox === 'partner') {
      return {
        kind: 'partner',
        ...hasMsg,
        ...(partnerSearchClause ? { AND: [partnerSearchClause] } : {}),
      };
    }
    if (search.length > 0) {
      return {
        ...hasMsg,
        OR: [
          {
            kind: 'member',
            member: { deletedAt: null },
            ...(memberSearchClause ? { AND: [memberSearchClause] } : {}),
          },
          {
            kind: 'employer',
            ...(employerSearchClause ? { AND: [employerSearchClause] } : {}),
          },
          {
            kind: 'partner',
            ...(partnerSearchClause ? { AND: [partnerSearchClause] } : {}),
          },
        ],
      };
    }
    return {
      ...hasMsg,
      OR: [{ kind: 'member', member: { deletedAt: null } }, { kind: 'employer' }, { kind: 'partner' }],
    };
  };

  const selectList = {
    id: true,
    kind: true,
    memberId: true,
    employerId: true,
    partnerId: true,
    counselorUserId: true,
    updatedAt: true,
    member: { select: { id: true, fullName: true, email: true } },
    employer: { select: { id: true, companyName: true, contactEmail: true, userId: true } },
    partner: { select: { id: true, name: true, partnerUsers: { select: { userId: true } } } },
    counselor: { select: { id: true, fullName: true } },
    messages: {
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      select: { id: true, body: true, createdAt: true, authorId: true },
    },
  } satisfies Prisma.MessageThreadSelect;

  if (alertsOnly) {
    const threshold = new Date(Date.now() - HOURS_48_MS);
    let breachIds = await getThreadIdsBreachingSla(threshold, 500);

    if (search.length > 0) {
      const matching = await prisma.$transaction((tx) => tx.messageThread.findMany({
        where: { id: { in: breachIds }, ...baseWhereForInbox() },
        select: { id: true },
        take: 100,
      }));
      const allow = new Set(matching.map((m) => m.id));
      breachIds = breachIds.filter((id) => allow.has(id));
    }

    const startIdx = cursor ? breachIds.indexOf(cursor) + 1 : 0;
    const safeStart = startIdx < 0 ? 0 : startIdx;
    const pageIds = breachIds.slice(safeStart, safeStart + limit);
    const hasMore = safeStart + limit < breachIds.length;
    const nextCursor = hasMore && pageIds.length > 0 ? pageIds[pageIds.length - 1]! : null;

    if (pageIds.length === 0) {
      return NextResponse.json({ threads: [], nextCursor: null, alertsOnly: true, inbox: 'member' });
    }

    const threads = await prisma.$transaction((tx) => tx.messageThread.findMany({
      where: { id: { in: pageIds } },
      select: selectList,
      take: 100,
    }));
    const order = new Map(pageIds.map((id, i) => [id, i]));
    threads.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const memberIds = threads.filter((t) => t.kind === 'member').map((t) => t.id);
    const slaMap = memberIds.length ? await getSlaStatusForThreads(memberIds) : new Map();

    const rows = threads.map((t) => mapThreadRow(t, slaMap));
    return NextResponse.json({ threads: rows, nextCursor, alertsOnly: true, inbox: 'member' });
  }

  const threads = await prisma.$transaction((tx) => tx.messageThread.findMany({
    where: baseWhereForInbox(),
    orderBy: { updatedAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: selectList,
  }));

  let page = threads;
  let nextCursor: string | null = null;
  if (threads.length > limit) {
    page = threads.slice(0, limit);
    nextCursor = page[page.length - 1]?.id ?? null;
  }

  const memberThreadIds = page.filter((t) => t.kind === 'member').map((t) => t.id);
  const slaMap = memberThreadIds.length ? await getSlaStatusForThreads(memberThreadIds) : new Map();

  const rows = page.map((t) => mapThreadRow(t, slaMap));

  return NextResponse.json({
    threads: rows,
    nextCursor,
    alertsOnly: false,
    inbox,
  });
  } catch (error) {
    captureApiError(error, { route: 'admin/messages/threads GET' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);

function mapThreadRow(
  t: {
    id: string;
    kind: MessageThreadKind;
    memberId: string | null;
    employerId: string | null;
    partnerId: string | null;
    counselorUserId: string | null;
    updatedAt: Date;
    member: { id: string; fullName: string; email: string } | null;
    employer: { id: string; companyName: string; contactEmail: string; userId: string } | null;
    partner: { id: string; name: string; partnerUsers: { userId: string }[] } | null;
    counselor: { id: string; fullName: string } | null;
    messages: Array<{ id: string; body: string; createdAt: Date; authorId: string | null }>;
  },
  slaMap: Map<string, import('@/lib/messages/superAdminMessageQueries').ThreadSlaRow>
) {
  const last = t.messages[0];
  const preview = last ? (last.body.length > 140 ? `${last.body.slice(0, 137)}…` : last.body) : '';

  const base = {
    id: t.id,
    kind: t.kind,
    updatedAt: t.updatedAt.toISOString(),
    lastMessagePreview: preview,
    lastMessageAt: last?.createdAt.toISOString() ?? null,
    lastMessageAuthorId: last?.authorId ?? null,
  };

  if (t.kind === 'member' && t.member) {
    const sla = slaMap.get(t.id);
    return {
      ...base,
      memberId: t.memberId,
      memberName: t.member.fullName,
      memberEmail: t.member.email,
      counselorUserId: t.counselorUserId,
      counselorName: t.counselor?.fullName ?? null,
      sla: sla
        ? {
            needsCounselorReply: sla.needsCounselorReply,
            memberLastMessageAt: sla.memberLastMessageAt?.toISOString() ?? null,
            breached48h: sla.breached48h,
            breached72h: sla.breached72h,
          }
        : {
            needsCounselorReply: false,
            memberLastMessageAt: null,
            breached48h: false,
            breached72h: false,
          },
    };
  }

  if (t.kind === 'employer' && t.employer) {
    const portalUid = t.employer.userId;
    const needsStaffReply = last ? last.authorId === portalUid : false;
    return {
      ...base,
      employerId: t.employerId,
      employerCompanyName: t.employer.companyName,
      employerContactEmail: t.employer.contactEmail,
      needsStaffReply,
    };
  }

  if (t.kind === 'partner' && t.partner) {
    const partnerUserIds = t.partner.partnerUsers.map((p) => p.userId);
    const needsStaffReply = last?.authorId ? partnerUserIds.includes(last.authorId) : false;
    return {
      ...base,
      partnerId: t.partnerId,
      partnerName: t.partner.name,
      needsStaffReply,
    };
  }

  return {
    ...base,
    memberId: null,
    memberName: 'Unknown',
    memberEmail: '',
    counselorUserId: null,
    counselorName: null,
    sla: {
      needsCounselorReply: false,
      memberLastMessageAt: null,
      breached48h: false,
      breached72h: false,
    },
  };
}async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isSuperAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const memberId = typeof (body as { memberId?: unknown }).memberId === 'string'
      ? (body as { memberId: string }).memberId
      : '';
    if (!memberId) return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
  
    const member = await prisma.$transaction((tx) => tx.user.findFirst({
      where: {
        id: memberId,
        deletedAt: null,
        // Who can be messaged as a member is the one definition of "a member"
        // (lib/admin/memberOnlyWhere.ts); role half only, so QA accounts still can.
        NOT: MEMBER_ONLY_ROLE_NOT,
      },
      select: { id: true, fullName: true },
    }));
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  
    const thread = await getOrCreateMemberCounselorThread(memberId);

    // Audit (WAP-18): staff opening a member thread is a mutation on that member's inbox.
    void auditLog({
      actorUserId: user.id,
      action: 'admin_message_thread_open',
      targetType: 'message_thread',
      targetId: thread.id,
      metadata: { memberId },
    }).catch(() => {});

    return NextResponse.json({ threadId: thread.id, memberName: member.fullName });
  } catch (error) {
    console.error('/admin/messages/threads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
