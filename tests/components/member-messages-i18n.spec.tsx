import { NextIntlClientProvider } from 'next-intl';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import es from '@/messages/es.json';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';

/**
 * WAP-262 item 4: the member Messages inbox is a translated surface, but its
 * chrome, composer and send errors were hard-coded English. Rendered with the
 * real portal client slice (what app/(portal)/layout.tsx ships), an es member
 * sees Spanish, and no English string or raw `messages.*` key remains.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/messages',
  useRouter: () => ({ push() {}, replace() {}, prefetch() {}, back() {} }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return { channel: () => channel, removeChannel: vi.fn() };
  },
}));

import { MemberMessagesFrame, MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';

const ENGLISH = [
  'Inbox',
  'Counselor and support in one inbox.',
  'Conversations',
  'Unread message',
  'Back to messages',
  'Review your course details',
  'Message Dana…',
];

function renderEs() {
  Element.prototype.scrollIntoView = () => {};
  return render(
    <NextIntlClientProvider locale="es" messages={pickPortalClientMessages(es)}>
      <MemberMessagesFrame>
        <MemberMessagesKit
          memberUserId="member-1"
          threadId="thread-1"
          conversations={[
            { id: 'thread-1', name: 'Dana Lee', role: 'Tu consejera', preview: 'Hola', unread: true, active: false },
          ]}
          activeName="Dana Lee"
          activeRole="Tu consejera"
          activeInitials="DL"
          messages={[{ id: 'm-1', from: 'other', text: 'Hola', author: 'DL' }]}
          feedbackDraft={{ key: 'k', text: 'Borrador' }}
        />
      </MemberMessagesFrame>
    </NextIntlClientProvider>,
  );
}

describe('member Messages inbox in Spanish (WAP-262)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the inbox chrome and composer in Spanish', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }) as unknown as Response));
    renderEs();

    expect(screen.getAllByRole('heading', { name: 'Mensajes' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Conversaciones')).toBeTruthy();
    expect(screen.getByLabelText('Mensaje sin leer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver a mensajes' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Escribe a Dana…' })).toBeTruthy();
  });

  it('leaves no English string or raw message key behind', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }) as unknown as Response));
    const { container } = renderEs();
    const text = `${container.textContent ?? ''} ${[...container.querySelectorAll('[aria-label],[placeholder]')]
      .map((el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('placeholder') ?? ''}`)
      .join(' ')}`;

    for (const phrase of ENGLISH) expect(text).not.toContain(phrase);
    expect(text).not.toMatch(/\bmessages\.[a-zA-Z]+/);
  });
});
