import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: vi.fn(),
}));

import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

describe('MemberMessagesKit fixture conversation selection', () => {
  const scrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    vi.unstubAllGlobals();
  });

  it('opens the selected synthetic thread and restores focus to it on back without live calls', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MemberMessagesKit
          conversations={[
            {
              id: 'counselor',
              name: 'Counselor',
              role: 'Career counselor',
              preview: 'Ask about your next session.',
              initials: 'CS',
              active: true,
              messages: [{ id: 'c1', from: 'other', text: 'Your counselor is here.', author: 'CS' }],
            },
            {
              id: 'team',
              name: 'WorkforceAP Team',
              role: 'Support',
              preview: 'Workspace email and Coursera access questions go here.',
              initials: 'WA',
              messages: [{ id: 't1', from: 'other', text: 'Use this thread for email and Coursera support.', author: 'WA' }],
            },
          ]}
          previewOnly
          activeName="Counselor"
          activeRole="Career counselor"
          activeInitials="CS"
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /WorkforceAP Team/ }));

    expect(screen.getAllByText('WorkforceAP Team').length).toBeGreaterThan(0);
    expect(screen.getByText('Use this thread for email and Coursera support.')).toBeTruthy();
    expect(screen.queryByText('Your counselor is here.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Counselor/ }));
    expect(screen.getByText('Your counselor is here.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to messages' }));
    const selectedConversation = screen.getByRole('button', { name: /Counselor/ });
    expect(document.activeElement).toBe(selectedConversation);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createSupabaseBrowserClient).not.toHaveBeenCalled();
  });

  it('keeps live messages and the active header when another conversation row is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { id: 'live-2', body: 'Latest live reply' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MemberMessagesKit
          conversations={[
            { id: 'live', name: 'Counselor', role: 'Career counselor', preview: 'Current thread', active: true },
            {
              id: 'team',
              name: 'WorkforceAP Team',
              role: 'Support',
              preview: 'Workspace email and Coursera access questions go here.',
              messages: [{ id: 'synthetic', from: 'other', text: 'Synthetic support content.' }],
            },
          ]}
          activeName="Dana Lee"
          activeRole="Your counselor"
          activeInitials="DL"
          messages={[{ id: 'live-1', from: 'other', text: 'Existing live message.' }]}
          memberUserId="member-1"
        />
      </NextIntlClientProvider>,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A live reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByText('Latest live reply')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /WorkforceAP Team/ }));

    expect(screen.getByText('Latest live reply')).toBeTruthy();
    expect(screen.getByText('Dana Lee')).toBeTruthy();
    expect(screen.getByText('Your counselor')).toBeTruthy();
    expect(screen.queryByText('Synthetic support content.')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps previewOnly read-only when live ids and a send handler are accidentally supplied', () => {
    const fetchMock = vi.fn();
    const onSend = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MemberMessagesKit
          previewOnly
          conversations={[
            {
              id: 'thread-1',
              name: 'Counselor',
              role: 'Career counselor',
              preview: 'Current thread',
              active: true,
              messages: [{ id: 'c1', from: 'other', text: 'Preview thread.' }],
            },
            {
              id: 'team',
              name: 'WorkforceAP Team',
              role: 'Support',
              preview: 'Workspace support',
              messages: [{ id: 's1', from: 'other', text: 'Preview support thread.' }],
            },
          ]}
          activeName="Counselor"
          activeRole="Career counselor"
          messages={[{ id: 'c1', from: 'other', text: 'Preview thread.' }]}
          memberUserId="fake-member"
          threadId="fake-thread"
          onSend={onSend}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /WorkforceAP Team/ }));
    expect(screen.getByText('Preview support thread.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(createSupabaseBrowserClient).not.toHaveBeenCalled();
  });
});
