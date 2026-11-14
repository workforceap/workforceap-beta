import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ providerSend: vi.fn(), log: vi.fn(), diagnostic: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.providerSend }; } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { emailSendLog: { upsert: mocks.log } } }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: mocks.diagnostic }));
vi.mock('@/lib/email/unsubscribeToken', () => ({ buildUnsubscribeUrl: () => undefined }));

import { resetProviderSuppressionCache } from '@/lib/email/suppressions';
import { sendMemberWelcomeLetterEmail } from '@/lib/email';

const suppressed = 'dead@bounced.example.org';
const deliverable = 'member@workforceap.org';

beforeEach(() => {
  vi.clearAllMocks();
  resetProviderSuppressionCache();
  vi.stubEnv('RESEND_API_KEY', 'synthetic-test-key');
  mocks.providerSend.mockResolvedValue({ data: { id: 'synthetic-provider-id' }, error: null });
  mocks.log.mockResolvedValue({});
  mocks.diagnostic.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    object: 'list', has_more: false, data: [{ id: 'suppression-1', email: suppressed, origin: 'bounce' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('welcome resend provider suppression', () => {
  it('skips a suppressed recipient without calling the provider', async () => {
    const result = await sendMemberWelcomeLetterEmail({ to: suppressed, fullName: 'Member Name', memberId: 'member-1' });
    expect(result).toEqual({ ok: false });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(mocks.providerSend).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'skipped', skipReason: 'suppressed_recipient' }),
    }));
  });

  it('sends to a non-suppressed recipient and requires a provider receipt', async () => {
    const result = await sendMemberWelcomeLetterEmail({ to: deliverable, fullName: 'Member Name', memberId: 'member-1' });
    expect(result).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(mocks.providerSend).toHaveBeenCalledOnce();
    expect(mocks.providerSend.mock.calls[0][0]).toMatchObject({ to: deliverable, html: expect.stringContaining('Complete the WorkforceAP Pre assessment') });
  });

  it('fails closed when the email provider is unconfigured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await sendMemberWelcomeLetterEmail({ to: deliverable, fullName: 'Member Name', memberId: 'member-1' })).toEqual({ ok: false });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.providerSend).not.toHaveBeenCalled();
  });

  it('greets a blank name as there and escapes a hostile first token', async () => {
    expect(await sendMemberWelcomeLetterEmail({ to: deliverable, fullName: '   ', memberId: 'member-1' })).toEqual({ ok: true });
    expect(String(mocks.providerSend.mock.calls[0][0].html)).toContain('Hi there,');
    mocks.providerSend.mockClear();
    expect(await sendMemberWelcomeLetterEmail({
      to: deliverable, fullName: '<script>alert(1)</script> José', memberId: 'member-1',
    })).toEqual({ ok: true });
    const html = String(mocks.providerSend.mock.calls[0][0].html);
    expect(html).toContain('Hi &lt;script&gt;alert(1)&lt;/script&gt;,');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('José');
  });
});
