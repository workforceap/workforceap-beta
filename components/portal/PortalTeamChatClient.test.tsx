import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const channel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
const removeChannel = vi.fn();

vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => channel,
    removeChannel,
  }),
}));
vi.mock('@/components/portal/VoiceAgentSurface', () => ({
  default: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
vi.mock('@/lib/portal/messagingSurfaces', () => ({
  employerMessagingSurface: {},
  partnerMessagingSurface: {},
}));
vi.mock('@/lib/a11y/scrollBehavior', () => ({ scrollBehavior: () => 'auto' }));

import PortalTeamChatClient from './PortalTeamChatClient';

describe('PortalTeamChatClient contextual draft', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows a server-validated context and prefills it without sending a message', () => {
    render(
      <PortalTeamChatClient
        apiPath="/api/partner/messages"
        initial={{
          thread: { id: 'thread-1', portalUserLastReadAt: null },
          messages: [],
          portalUserId: 'partner-user',
        }}
        subtitle="Team chat"
        empty={{ title: 'No messages yet', description: 'Ask the team anything.', action: 'Write a message' }}
        surfaceVariant="partner"
        contextLabel="Regarding Ada Member"
        initialDraft="Regarding Ada Member: "
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Message context: Regarding Ada Member');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Regarding Ada Member: ');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalledWith(
      '/api/partner/messages',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
