import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { prisma } from '@/lib/db/prisma';
import PortalTeamChatClient from '@/components/portal/PortalTeamChatClient';
import { getOrCreatePartnerMessageThread } from '@/lib/messages/portalThreads';
import { serializeMessage } from '@/lib/messages/counselorThread';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import { ChevronRight } from 'lucide-react';
import { DesignSurface, Avatar, KitEmptyState } from '@/components/portal/kit';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { resolveAuthorizedPartnerMessageMember } from '@/lib/messages/contextSelection';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('partner');
  return buildPageMetadataAsync({
    title: t('messages'),
    description: t('messagesMetaDescription'),
    path: '/partner/messages',
  });
}

type Props = {
  searchParams?: Promise<{ memberId?: string | string[] }>;
};

export default async function PartnerMessagesPage({ searchParams }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/messages');

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  const t = await getTranslations('partner');
  const te = await getTranslations('empty');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  const query = await searchParams;
  const [thread, permittedReferrals] = await Promise.all([
    readOnlyAudit
      ? prisma.messageThread.findUnique({ where: { partnerId: ctx.partnerId } })
      : getOrCreatePartnerMessageThread(ctx.partnerId),
    query?.memberId
      ? prisma.partnerReferral.findMany({
          take: 500,
          where: {
            partnerId: ctx.partnerId,
            partner: { organizationId: ctx.partner.organizationId },
            member: { organizationId: ctx.partner.organizationId, deletedAt: null, ...MEMBER_ONLY_WHERE },
          },
          select: { member: { select: { id: true, fullName: true } } },
          orderBy: { referredAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);
  const selectedMember = resolveAuthorizedPartnerMessageMember(
    permittedReferrals.map((referral) => referral.member),
    query?.memberId,
  );

  const header = <PageHeader title={t('messages')} subtitle={t('messagesSubtitle')} />;

  if (!thread) {
    return (
      <PortalPageFrame maxWidth="80rem">
        {readOnlyAudit && <span hidden data-portal-audit-suppressed="partner-message-thread-provisioning" />}
        <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
          {header}
          {/* Only reachable in a read-only audit (the live path creates the
              thread): the inbox is not ready in this view, not "no messages yet". */}
          <div className="wa-kit-card">
            <KitEmptyState
              kind="unavailable"
              headingAs="h2"
              title={te('inboxUnavailable.title')}
              description={te('inboxUnavailable.body')}
              primaryAction={{ label: te('inboxUnavailable.overviewAction'), href: '/partner' }}
            />
          </div>
        </DesignSurface>
      </PortalPageFrame>
    );
  }

  if (readOnlyAudit) {
    return (
      <PortalPageFrame maxWidth="80rem">
        <span hidden data-portal-audit-suppressed="partner-message-read-receipt-realtime-and-content" />
        <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
          {header}
          <div className="wa-kit-card">
            <KitEmptyState kind="unavailable" headingAs="h2" title={t('messages')} description={t('messagesAuditPaused')} />
          </div>
        </DesignSurface>
      </PortalPageFrame>
    );
  }

  const messages = await prisma.message.findMany({
    take: 200,
    where: { threadId: thread.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  // The capped window must include the latest replies after a reload.
  const serializedMessages = messages.reverse().map(serializeMessage);
  const last = serializedMessages[serializedMessages.length - 1] as { body?: string } | undefined;
  const previewText =
    serializedMessages.length > 0 ? last?.body ?? t('noMessagesYetTitle') : t('noMessagesYetTitle');

  return (
    <PortalPageFrame maxWidth="80rem">
      <DesignSurface surface="dense" className="wa-flex wa-flex-col wa-gap-6">
        {header}

        <div className="wa-max-w-full wa-overflow-x-hidden wa-pb-24 md:wa-overflow-x-visible md:wa-pb-0">
          <div className="wa-mb-4 md:wa-hidden">
            <div
              className="wa-kit-card wa-kit-card--sm"
              style={{ display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <Avatar initials="WA" size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--wa-text)' }}>WorkforceAP Team</div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--wa-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {previewText}
                </div>
              </div>
              <ChevronRight size={18} aria-hidden style={{ color: 'var(--wa-muted)', flexShrink: 0 }} />
            </div>
          </div>

          <PortalTeamChatClient
            readCursorMode
            key={`partner-chat-${selectedMember?.id ?? 'general'}`}
            surfaceVariant="partner"
            apiPath="/api/partner/messages"
            initial={{
              thread: {
                id: thread.id,
                portalUserLastReadAt: thread.portalUserLastReadAt?.toISOString() ?? null,
              },
              messages: serializedMessages,
              portalUserId: user.id,
            }}
            subtitle="Our team reads every message and replies here."
            empty={{ title: te('teamThreadPartner.title'), description: te('teamThreadPartner.body'), action: te('teamThreadPartner.action') }}
            contextLabel={selectedMember ? `Regarding ${selectedMember.fullName}` : undefined}
            initialDraft={selectedMember ? `Regarding ${selectedMember.fullName}: ` : undefined}
          />
        </div>
      </DesignSurface>
    </PortalPageFrame>
  );
}
