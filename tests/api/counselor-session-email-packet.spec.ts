import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The in-office session packet email links the member to where the session's
 * results are saved: their AI tool history ("My AI results"), the page the
 * dashboard's in-office session card opened. It used to link the member home,
 * which does not list the session's results.
 */

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'counselor-1' })) }));
vi.mock('@/lib/auth/actAsSubject', () => ({
  resolveActOnBehalf: vi.fn(async () => ({
    ok: true,
    isOnBehalf: true,
    actorName: 'Jordan Counselor',
  })),
}));
vi.mock('@/lib/tenant/organization', () => ({ getSubjectOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => unknown) =>
    fn({
      user: {
        findFirst: vi.fn(async () => ({ id: MEMBER_ID, fullName: 'Sam Member', email: 'sam@example.com' })),
      },
    }),
  ),
}));

const tx = {
  memberEvent: {
    findMany: vi.fn(async () => [{ entityId: 'result-1', createdAt: new Date('2026-09-20T15:00:00.000Z') }]),
  },
  aIToolResult: {
    findMany: vi.fn(async () => [
      {
        id: 'result-1',
        toolType: 'linkedin_about',
        inputSummary: 'IT support',
        output: 'I help teams keep their computers running.',
        createdAt: new Date('2026-09-20T15:00:00.000Z'),
      },
    ]),
  },
};
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : arg,
    ),
    readinessChecklist: { upsert: vi.fn() },
  },
}));
vi.mock('@/lib/email', () => ({ getResend: vi.fn(() => ({})) }));
vi.mock('@/lib/email/send', () => ({ sendBrandedEmailOrThrowOnSkip: vi.fn(async () => undefined) }));

import { POST } from '@/app/api/counselor/sessions/email-packet/route';
import { SESSION_PACKET_PORTAL_PATH, sessionPacketHtml } from '@/emails/session-packet';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';

function request(): Request {
  return new Request('http://localhost/api/counselor/sessions/email-packet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ memberId: MEMBER_ID, sessionId: SESSION_ID }),
  });
}

describe('session packet portal link', () => {
  beforeEach(() => {
    vi.mocked(sendBrandedEmailOrThrowOnSkip).mockClear();
  });

  it('points at the AI tool history page', () => {
    expect(SESSION_PACKET_PORTAL_PATH).toBe('/dashboard/ai-tools/history');
  });

  it('names the page the link opens', () => {
    const html = sessionPacketHtml({
      firstName: 'Sam',
      counselorName: 'Jordan Counselor',
      sessionDate: 'Sunday, September 20, 2026',
      sections: [],
      portalUrl: `https://www.workforceap.org${SESSION_PACKET_PORTAL_PATH}`,
    });
    expect(html).toContain('open My AI results');
    expect(html).toContain('href="https://www.workforceap.org/dashboard/ai-tools/history"');
  });

  it('sends the member to their AI tool history, not the member home', async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(sendBrandedEmailOrThrowOnSkip).toHaveBeenCalledTimes(1);

    const [, message] = vi.mocked(sendBrandedEmailOrThrowOnSkip).mock.calls[0]!;
    const html = (message as { html: string }).html;
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    const portalLinks = hrefs.filter((href) => href.includes('/dashboard'));

    // Body link and the branded CTA button both open the history page.
    expect(portalLinks.length).toBeGreaterThanOrEqual(2);
    for (const href of portalLinks) {
      expect(new URL(href).pathname).toBe('/dashboard/ai-tools/history');
    }
    expect(html).toContain('See what we built');
  });
});
