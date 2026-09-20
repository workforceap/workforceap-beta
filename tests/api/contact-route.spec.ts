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

import { POST } from '@/app/api/contact/route';
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

describe('POST /api/contact', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test';
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
});
