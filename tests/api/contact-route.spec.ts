import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// The contact form must await the Resend send before responding: on Vercel a
// response returned first would freeze the function and drop the email.

const resend = vi.hoisted(() => ({ send: vi.fn<(input: unknown) => Promise<unknown>>() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resend.send };
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkContactRateLimit: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileResponse: vi.fn(async () => true),
}));

// The route now sends through lib/email/send.ts, which records failures and
// signs List-Unsubscribe tokens; keep both inert here.
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));

import { CONTACT_FORM_ERROR_PATH, CONTACT_FORM_THANKS_PATH, POST } from '@/app/api/contact/route';
import { checkContactRateLimit } from '@/lib/rate-limit';

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost:3000/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      topic: 'Programs',
      message: 'How do I enroll?',
      ...body,
    }),
  }) as any;
}

/** A browser submitting the marketing form itself (no JavaScript bound). */
function makeNativeFormRequest(overrides: Record<string, string> = {}) {
  const fields = new URLSearchParams({
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: '',
    topic: 'Programs',
    message: 'How do I enroll?',
    sms_preferred: 'true',
    ...overrides,
  });
  return new Request('http://localhost:3000/api/contact', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html,application/xhtml+xml',
      'x-forwarded-for': '203.0.113.9',
    },
    body: fields.toString(),
  }) as any;
}

describe('POST /api/contact', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test';
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-unsubscribe-secret';
    delete process.env.NEXT_PUBLIC_CAPTCHA_ENABLED;
    vi.mocked(checkContactRateLimit).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('awaits the Resend send before responding', async () => {
    let release!: () => void;
    resend.send.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ data: { id: 'email-1' } }); }));

    let settled = false;
    const pending = POST(makeRequest()).then((res) => { settled = true; return res; });

    await vi.waitFor(() => expect(resend.send).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    release();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(resend.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'info@workforceap.org', replyTo: 'ada@example.com', subject: expect.stringContaining('Programs') }),
      // Shared wrapper: every send carries an idempotency key so a retry cannot double-deliver.
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^email\/[0-9a-f]{64}$/) }),
    );
  });

  it('reports a failed send instead of pretending success', async () => {
    resend.send.mockRejectedValueOnce(new Error('resend down'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to send/);
  });

  it('rejects incomplete submissions before touching Resend', async () => {
    const res = await POST(makeRequest({ message: '' }));
    expect(res.status).toBe(400);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it('rate-limits before touching Resend', async () => {
    vi.mocked(checkContactRateLimit).mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
    expect(resend.send).not.toHaveBeenCalled();
  });

  // WAP-13: marketing/src/pages/contact.astro posts natively when its script has
  // not bound. Those submissions must land on a page, not a JSON body.
  describe('native (no-JavaScript) form posts', () => {
    it('sends the same email and answers with a 303 to the confirmation page', async () => {
      resend.send.mockResolvedValueOnce({ data: { id: 'email-2' } });
      const res = await POST(makeNativeFormRequest());
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(CONTACT_FORM_THANKS_PATH);
      expect(CONTACT_FORM_THANKS_PATH).toBe('/contact/thanks');
      expect(resend.send).toHaveBeenCalledTimes(1);
      expect(resend.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'info@workforceap.org',
          replyTo: 'ada@example.com',
          subject: expect.stringContaining('Programs'),
          text: expect.stringContaining('Prefer SMS: Yes'),
        }),
        expect.anything(),
      );
    });

    it('redirects an incomplete native post back to the visible error notice without touching Resend', async () => {
      const res = await POST(makeNativeFormRequest({ message: '' }));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(CONTACT_FORM_ERROR_PATH);
      expect(CONTACT_FORM_ERROR_PATH).toBe('/contact#contact-form-error');
      expect(resend.send).not.toHaveBeenCalled();
    });

    it('still rate-limits native posts, redirecting instead of returning JSON', async () => {
      vi.mocked(checkContactRateLimit).mockResolvedValueOnce({ success: false });
      const res = await POST(makeNativeFormRequest());
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(CONTACT_FORM_ERROR_PATH);
      expect(resend.send).not.toHaveBeenCalled();
    });

    it('maps the Turnstile field name from the native form to the captcha check', async () => {
      process.env.NEXT_PUBLIC_CAPTCHA_ENABLED = 'true';
      process.env.TURNSTILE_SECRET_KEY = 'secret';
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site';
      const { verifyTurnstileResponse } = await import('@/lib/turnstile/verifyTurnstile');
      resend.send.mockResolvedValueOnce({ data: { id: 'email-3' } });
      const res = await POST(makeNativeFormRequest({ 'cf-turnstile-response': 'tok-123' }));
      expect(vi.mocked(verifyTurnstileResponse)).toHaveBeenCalledWith('secret', 'tok-123', '203.0.113.9');
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(CONTACT_FORM_THANKS_PATH);
    });

    it('keeps JSON responses for fetch clients', async () => {
      resend.send.mockResolvedValueOnce({ data: { id: 'email-4' } });
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      expect(await res.json()).toEqual({ ok: true });
    });
  });
});
