import { createRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';
import en from '@/messages/en.json';

// Local-only browser fixture. The runner replaces the Supabase module, bundles
// the production components/CSS, and fulfils static files in memory with all
// network denied. No authenticated route or real message endpoint is contacted.
declare global {
  interface Window {
    messageFixture: {
      insert?: (payload: { new: Record<string, unknown> }) => void;
      requests: { method: string; url: string; body?: string }[];
      browserClientCreations: number;
      subscriptions: number;
      settle?: (ok: boolean, echoFirst?: boolean) => void;
    };
  }
}

window.messageFixture = { requests: [], browserClientCreations: 0, subscriptions: 0 };
window.fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  if (url !== '/api/member/messages' || !['POST', 'PATCH'].includes(method)) {
    throw new Error(`Unexpected fixture fetch: ${method} ${url}`);
  }
  window.messageFixture.requests.push({ method, url, body: init?.body as string | undefined });
  if (method === 'PATCH') return Response.json({ ok: true });
  const { body } = JSON.parse(String(init?.body)) as { body: string };
  return new Promise<Response>((resolve) => {
    window.messageFixture.settle = (ok, echoFirst = false) => {
      const message = { id: 'saved-fixture', body, createdAt: '2026-10-20T17:30:00.000Z' };
      if (ok && echoFirst) {
        window.messageFixture.insert?.({ new: {
          id: message.id, body, created_at: message.createdAt, author_id: 'fixture-member',
        } });
      }
      resolve(Response.json(ok ? { message } : { error: 'Fixture send failed. Please retry.' }, { status: ok ? 200 : 503 }));
      window.messageFixture.settle = undefined;
    };
  });
};

const messages = Array.from({ length: 40 }, (_, index) => ({
  id: `history-${index}`,
  from: index % 2 === 0 ? 'other' as const : 'self' as const,
  author: 'FC',
  text: index % 2 === 0
    ? `Fixture message ${index + 1}: Your training progress is saved. We can review the next step together.`
    : `Fixture message ${index + 1}: Thank you. I have a question about the next course assignment.`,
  createdAt: new Date(Date.UTC(2026, 9, 19, 22, index * 30)).toISOString(),
}));
const readOnlyAudit = new URLSearchParams(window.location.search).has('audit');

createRoot(document.getElementById('root')!).render(
  <NextIntlClientProvider locale="en" messages={en} timeZone="America/Chicago">
    <header className="fixture-banner"><strong>WorkforceAP</strong><span>Member messages · synthetic review fixture</span></header>
    <main>
      <MemberMessagesKit
        readOnlyAudit={readOnlyAudit}
        conversations={[{ id: 'fixture-thread', name: 'Fixture Counselor', role: 'Assigned counselor', preview: 'Your training progress is saved.', active: true, unread: readOnlyAudit }]}
        activeName="Fixture Counselor"
        activeRole="Assigned counselor"
        activeInitials="FC"
        memberUserId="fixture-member"
        threadId="fixture-thread"
        messages={messages}
        feedbackDraft={new URLSearchParams(window.location.search).has('feedback') ? { key: 'fixture-feedback', text: 'Course feedback fixture draft. Please help me review the next assignment.' } : undefined}
      />
    </main>
    <footer className="fixture-footer">Synthetic messages only. No live API, identity, database or email access.</footer>
  </NextIntlClientProvider>,
);
