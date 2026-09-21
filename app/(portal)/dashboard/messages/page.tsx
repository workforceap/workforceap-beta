import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { formatPortalTime } from '@/lib/formatDate';
import { getOrCreateMemberCounselorThread, serializeMessage } from '@/lib/messages/counselorThread';
import { ARCHIVED_FIXTURE_MARKER, memberUnreadStaffMessagesWhere } from '@/lib/messages/memberUnread';
import PageHeader from '@/components/portal/PageHeader';
import MemberCounselorChatClient from '@/components/portal/MemberCounselorChatClient';
import MemberMessagesMobileClient from '@/components/portal/MemberMessagesMobileClient';
import { getTranslations } from 'next-intl/server';
import { MemberMessagesEmpty } from '@/components/portal/kit/pages/member/MemberMessagesEmpty';
import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';
import type { ChatMessage } from '@/components/portal/kit';
import { loadTrainingWorkspace } from '@/lib/member/loadTrainingWorkspace';
import { buildTrainingFeedbackDraft } from '@/lib/member/trainingFeedbackDraft';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('messages');
  return buildPageMetadataAsync({
  title: t('messagesTitle'),
  description: t('messagesDescription'),
  path: '/dashboard/messages',
});
}

export default async function MemberMessagesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string; program?: string; course?: string; curriculum?: string }>;
}) {
  const params = await searchParams;
  const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : null;
  const requestedProgram = identifier(params?.program);
  const requestedCourse = identifier(params?.course);
  const requestedCurriculum = identifier(params?.curriculum);
  const hasRequestedFeedback = Boolean(params?.program || params?.course || params?.curriculum);
  const feedbackQuery = requestedProgram && requestedCourse && requestedCurriculum
    ? new URLSearchParams({ program: requestedProgram, course: requestedCourse, curriculum: requestedCurriculum }).toString()
    : '';
  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/dashboard/messages${feedbackQuery ? `?${feedbackQuery}` : ''}`)}`);

  const requestedUi = typeof params?.ui === 'string' ? params.ui : null;
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const t = await getTranslations('messages');

  // Guard: an authenticated session whose user has no member row yet — a
  // new-signup provisioning race, or a removed/rebuilt account — would FK-violate
  // on `messageThread.create()` (message_threads_member_id_fkey) and crash the
  // ENTIRE member dashboard into the error boundary (Sentry JAVASCRIPT-NEXTJS-1B).
  // Render a safe, empty inbox instead of taking the dashboard down.
  const memberRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true },
  });
  if (!memberRow) {
    return (
      <MemberMessagesEmpty
        title={t('noMessagesYet')}
        actionLabel="Email support"
        actionHref="mailto:info@workforceap.org"
      />
    );
  }

  const thread = readOnlyAudit
    ? await prisma.messageThread.findUnique({ where: { memberId: user.id } })
    : await getOrCreateMemberCounselorThread(user.id, { assignIfUnassigned: true });
  if (!thread) {
    return (
      <MemberMessagesEmpty
        title="No messages yet"
        description="Your counselor conversation will appear here after the first message."
        actionLabel="Back to dashboard"
        actionHref="/dashboard"
      />
    );
  }

  const [latestMessages, counselor, unreadCount] = await Promise.all([
    prisma.message.findMany({
      take: 200,
      where: { threadId: thread.id, NOT: { body: { contains: ARCHIVED_FIXTURE_MARKER } } },
      orderBy: { createdAt: 'desc' },
    }),
    thread.counselorUserId
      ? prisma.user.findUnique({
          where: { id: thread.counselorUserId },
          select: { fullName: true },
        })
      : Promise.resolve(null),
    // Same rule as the nav badge (lib/messages/memberUnread.ts): a never-opened
    // thread has every staff message unread.
    prisma.message.count({
      where: memberUnreadStaffMessagesWhere({
        threadId: thread.id,
        memberUserId: user.id,
        memberLastReadAt: thread.memberLastReadAt,
      }),
    }),
  ]);

  const messages = [...latestMessages].reverse();
  const lastMsg = messages[messages.length - 1];
  const lastMsgText = lastMsg ? (lastMsg.body ?? '').slice(0, 60) : t('noMessagesYet');
  const lastMsgTime = lastMsg ? formatPortalTime(lastMsg.createdAt) : '';

  const counselorName = counselor?.fullName ?? null;
  const counselorInitials = counselorName
    ? counselorName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'WA';

  // ── New design-kit inbox (default). Opt out with ?ui=legacy. ──
  // Reuses the same real counselor thread + the existing legacy send endpoint
  // (`POST /api/member/messages`) that MemberCounselorChatClient posts to.
  if (requestedUi !== 'legacy' || hasRequestedFeedback) {
    let feedbackDraft: ReturnType<typeof buildTrainingFeedbackDraft>;
    if (requestedProgram && requestedCourse && requestedCurriculum) {
      try {
        const workspace = await loadTrainingWorkspace({ userId: user.id, programSlug: requestedProgram });
        feedbackDraft = buildTrainingFeedbackDraft(workspace, requestedCourse, requestedCurriculum);
      } catch {
        // Inbox remains available if the optional course context cannot load.
      }
    }
    const kitMessages: ChatMessage[] = messages.map((m) => {
      const mine = m.authorId === user.id;
      return {
        id: m.id,
        from: mine ? 'self' : 'other',
        text: m.body ?? '',
        ...(mine ? {} : { author: counselorInitials }),
      };
    });

    // The thread is addressed to a person or a team, never to "Inbox":
    // an assigned counselor by name, otherwise WorkforceAP support.
    const activeName = counselorName ?? t('workforceapSupport');
    const activeRole = counselorName ? t('yourCounselor') : t('supportTeam');
    const conversations = [
      {
        id: thread.id,
        name: activeName,
        role: activeRole,
        preview: lastMsgText,
        unread: unreadCount > 0,
        active: true,
      },
    ];

    return (
      <MemberMessagesKit
        memberUserId={user.id}
        threadId={thread.id}
        conversations={conversations}
        activeName={activeName}
        activeRole={activeRole}
        activeInitials={counselorInitials}
        activeOnline={Boolean(thread.counselorUserId)}
        otherInitials={counselorInitials}
        messages={kitMessages}
        feedbackDraft={feedbackDraft}
        feedbackNotice={hasRequestedFeedback && !feedbackDraft ? 'We could not load that assigned course. You can still write your message below.' : undefined}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t('inbox')}
        breadcrumbs={[{ label: t('memberPortal'), href: '/dashboard' }, { label: t('inbox') }]}
      />

      {/* ── Mobile-only messages view (≤md) ── */}
      <div className="md:wa-hidden" style={{ paddingBottom: '6rem', maxWidth: '100%', overflowX: 'hidden' }}>
        <MemberMessagesMobileClient
          initial={{
            memberUserId: user.id,
            counselorName,
            counselorInitials,
            thread: {
              id: thread.id,
              memberId: thread.memberId,
              counselorUserId: thread.counselorUserId,
              memberLastReadAt: thread.memberLastReadAt?.toISOString() ?? null,
              counselorLastReadAt: thread.counselorLastReadAt?.toISOString() ?? null,
            },
            messages: messages.map(serializeMessage),
            lastMsgText,
            lastMsgTime,
            unreadCount,
          }}
        />
      </div>

      {/* ── Desktop view ── */}
      <div className="wa-hidden md:wa-block">
        <MemberCounselorChatClient
          initial={{
            memberUserId: user.id,
            counselorName,
            thread: {
              id: thread.id,
              memberId: thread.memberId,
              counselorUserId: thread.counselorUserId,
              memberLastReadAt: thread.memberLastReadAt?.toISOString() ?? null,
              counselorLastReadAt: thread.counselorLastReadAt?.toISOString() ?? null,
            },
            messages: messages.map(serializeMessage),
          }}
        />
      </div>
    </>
  );
}
