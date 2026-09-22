import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import EmployerMessagesInboxClient from '@/components/portal/EmployerMessagesInboxClient';
import { getOrCreateEmployerMessageThread } from '@/lib/messages/portalThreads';
import { serializeMessage } from '@/lib/messages/counselorThread';
import { buildEmployerInbox } from '@/lib/messages/employerInbox';
import { getTranslations } from 'next-intl/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { KitEmptyState } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('employerMessagesMetaTitle'),
    description: t('employerMessagesMetaDesc'),
    path: '/employer/messages',
  });
}

function EmployerMessagesHeader({
  title,
  subtitleMobile,
  subtitleDesktop,
  employerPortalLabel,
}: {
  title: string;
  subtitleMobile: string;
  subtitleDesktop: string;
  employerPortalLabel: string;
}) {
  return (
    <EmployerPageOpener
      kicker={employerPortalLabel}
      title={title}
      subtitle={
        <>
          <span className="wa-block md:wa-hidden">{subtitleMobile}</span>
          <span className="wa-hidden md:wa-block">{subtitleDesktop}</span>
        </>
      }
    />
  );
}

export default async function EmployerMessagesPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/messages');

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');
  const tm = await getTranslations('messages');
  const te = await getTranslations('empty');
  const headerTitle = tm('inbox');
  const headerProps = {
    title: headerTitle,
    subtitleMobile: t('employerMessagesSubtitleMobile'),
    subtitleDesktop: t('employerMessagesSubtitleDesktop'),
    employerPortalLabel: t('employerPortal'),
  } as const;

  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  const thread = readOnlyAudit
    ? await prisma.messageThread.findUnique({ where: { employerId: ctx.employerId } })
    : await getOrCreateEmployerMessageThread(ctx.employerId);
  if (!thread) {
    return (
      <PortalPageFrame>
        {readOnlyAudit && <span hidden data-portal-audit-suppressed="employer-message-thread-provisioning" />}
        <EmployerMessagesHeader {...headerProps} />
        <KitEmptyState
          kind="unavailable"
          framed
          headingAs="h2"
          title={te('inboxUnavailable.title')}
          description={te('inboxUnavailable.body')}
          primaryAction={{ label: te('inboxUnavailable.overviewAction'), href: '/employer' }}
        />
      </PortalPageFrame>
    );
  }
  if (readOnlyAudit) {
    return (
      <PortalPageFrame>
        <span hidden data-portal-audit-suppressed="employer-message-read-receipt-realtime-and-content" />
        <EmployerMessagesHeader {...headerProps} />
        <div className="portal-card portal-card--flat" style={{ padding: '1.5rem', color: 'var(--wa-muted)' }}>
          Messaging access is available. Message content, read receipts, and realtime sync are paused for this audit.
        </div>
      </PortalPageFrame>
    );
  }
  const messages = await prisma.message.findMany({
    take: 200,
    where: { threadId: thread.id },
    orderBy: { createdAt: 'asc' },
  });

  const serializedMessages = messages.map(serializeMessage);
  const { team: teamRow, candidates: candidateRows } = await buildEmployerInbox(ctx.employerId, user.id);

  return (
    <PortalPageFrame>
      <EmployerMessagesHeader {...headerProps} />
      <div style={{ paddingBottom: '4rem', maxWidth: '100%', overflowX: 'hidden' }}>
        <EmployerMessagesInboxClient
          portalUserId={user.id}
          teamRow={teamRow}
          candidateRows={candidateRows}
          teamInitial={{
            thread: {
              id: thread.id,
              portalUserLastReadAt: thread.portalUserLastReadAt?.toISOString() ?? null,
            },
            messages: serializedMessages,
          }}
        />
      </div>
    </PortalPageFrame>
  );
}
