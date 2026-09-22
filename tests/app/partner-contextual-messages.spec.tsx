import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedPartnerHref: vi.fn(async () => '/partner/setup') }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    messageThread: { findUnique: vi.fn() },
    partnerReferral: { findMany: vi.fn() },
    message: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/messages/portalThreads', () => ({ getOrCreatePartnerMessageThread: vi.fn() }));
vi.mock('@/lib/messages/counselorThread', () => ({ serializeMessage: vi.fn((message) => message) }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/portal/PageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  KitEmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="kit-empty-state">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  ),
  Avatar: () => <span>WA</span>,
}));
vi.mock('@/components/portal/PortalTeamChatClient', () => ({
  default: ({
    contextLabel,
    initialDraft,
    initial,
  }: {
    contextLabel?: string;
    initialDraft?: string;
    initial: { messages: { id: string }[] };
  }) => (
    <div
      data-testid="partner-team-chat"
      data-context-label={contextLabel ?? ''}
      data-initial-draft={initialDraft ?? ''}
      data-message-ids={initial.messages.map(message => message.id).join(',')}
    />
  ),
}));

import PartnerMessagesPage from '@/app/(portal)/partner/messages/page';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getOrCreatePartnerMessageThread } from '@/lib/messages/portalThreads';

describe('partner contextual messages page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'partner-user' } as never);
    vi.mocked(getPartnerForUser).mockResolvedValue({
      partnerId: 'partner-1',
      partner: { organizationId: 'org-1' },
    } as never);
    vi.mocked(getOrCreatePartnerMessageThread).mockResolvedValue({
      id: 'partner-thread',
      portalUserLastReadAt: null,
    } as never);
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);
    vi.mocked(prisma.partnerReferral.findMany).mockResolvedValue([
      { member: { id: 'member-1', fullName: 'Ada Member' } },
    ] as never);
  });

  it('prefills member context only after matching the query to this partner referral set', async () => {
    render(
      await PartnerMessagesPage({
        searchParams: Promise.resolve({ memberId: 'member-1' }),
      }),
    );

    expect(screen.getByTestId('partner-team-chat')).toHaveAttribute(
      'data-context-label',
      'Regarding Ada Member',
    );
    expect(screen.getByTestId('partner-team-chat')).toHaveAttribute(
      'data-initial-draft',
      'Regarding Ada Member: ',
    );
    expect(prisma.partnerReferral.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          partnerId: 'partner-1',
          partner: { organizationId: 'org-1' },
          // One definition of "a member" (WAP-182 item 3).
          member: expect.objectContaining({ organizationId: 'org-1', deletedAt: null, ...MEMBER_ONLY_WHERE }),
        },
      }),
    );
  });

  it('keeps the shared partner conversation generic for an unauthorized member id', async () => {
    render(
      await PartnerMessagesPage({
        searchParams: Promise.resolve({ memberId: 'other-partner-member' }),
      }),
    );

    expect(screen.getByTestId('partner-team-chat')).toHaveAttribute('data-context-label', '');
    expect(screen.getByTestId('partner-team-chat')).toHaveAttribute('data-initial-draft', '');
  });

  it('shows the latest 200 of a longer conversation in chronological order after reload', async () => {
    const history = Array.from({ length: 205 }, (_, index) => ({
      id: `message-${String(index + 1).padStart(3, '0')}`,
      createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)),
      body: `Synthetic reply ${index + 1}`,
    }));
    vi.mocked(prisma.message.findMany).mockImplementation(((args: any) => {
      expect(args.where).toEqual({ threadId: 'partner-thread' });
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      return Promise.resolve([...history].reverse().slice(0, args.take));
    }) as typeof prisma.message.findMany);

    render(await PartnerMessagesPage({ searchParams: Promise.resolve({}) }));
    const ids = screen.getByTestId('partner-team-chat').getAttribute('data-message-ids')!.split(',');
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe('message-006');
    expect(ids.at(-1)).toBe('message-205');
  });
});
