import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ submit: vi.fn(), limit: vi.fn(), captcha: vi.fn() }));
vi.mock('@/lib/publicInquiries/submit', () => ({ submitPublicInquiry: mocks.submit }));
vi.mock('@/lib/rate-limit', () => ({ checkContactRateLimit: mocks.limit }));
vi.mock('@/lib/turnstile/verifyTurnstile', () => ({ verifyTurnstileResponse: mocks.captcha }));
import { POST as contact } from '@/app/api/contact/route';
import { POST as careers } from '@/app/api/leads/careers/route';

const payload = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.net', topic: 'Programs', message: 'I build production systems and want to help.', submission_id: '9396e6d4-bc67-4b5b-9f49-d86798eeb9da' };
const request = (path: string, body = payload, native = false) => new Request(`http://localhost${path}`, {
  method: 'POST', headers: { 'Content-Type': native ? 'application/x-www-form-urlencoded' : 'application/json' },
  body: native ? new URLSearchParams(body).toString() : JSON.stringify(body),
}) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_CAPTCHA_ENABLED', 'false');
  mocks.limit.mockResolvedValue({ success: true });
  mocks.captcha.mockResolvedValue(true);
  mocks.submit.mockResolvedValue({ ok: true });
});

describe.each([['contact', contact, '/api/contact'], ['careers', careers, '/api/leads/careers']] as const)('%s public capture guards', (_name, post, path) => {
  it('retains the JSON success contract and forwards normalized fields/key to durability', async () => {
    const response = await post(request(path));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.submit).toHaveBeenCalledWith(expect.any(Headers), expect.objectContaining({ firstName: 'Ada', email: 'ada@example.net', submissionId: payload.submission_id }));
  });
  it('rejects rate-limited and invalid CAPTCHA submissions before capture', async () => {
    mocks.limit.mockResolvedValueOnce({ success: false });
    expect((await post(request(path))).status).toBe(429);
    vi.stubEnv('NEXT_PUBLIC_CAPTCHA_ENABLED', 'true');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'test-site');
    expect((await post(request(path))).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('reports a saved receipt truthfully when notification fails', async () => {
    mocks.submit.mockResolvedValue({ ok: false, status: 503, error: 'Your inquiry was saved. Notification unavailable.', saved: true, receiptId: 'receipt-a' });
    const response = await post(request(path));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ saved: true, receiptId: 'receipt-a', error: expect.stringContaining('was saved') });
  });
});

it('captures genuine sponsorship fields with optional notes through the native fallback', async () => {
  const sponsor = { ...payload, source: 'sponsorship', organization: 'Analytical Engines', interest: 'Bronze', seats: '5', message: '' };
  const response = await contact(request('/api/contact?source=sponsorship', sponsor, true));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/contact/thanks');
  expect(mocks.submit).toHaveBeenCalledWith(expect.any(Headers), expect.objectContaining({ kind: 'sponsorship', organizationName: 'Analytical Engines', seats: 5 }));
  const rejected = await contact(request('/api/contact?source=sponsorship', { ...sponsor, last_name: '' }, true));
  expect(rejected.headers.get('location')).toBe('/donate#sponsorship-form-error');
});

it('provides a native careers success/error page instead of posting to the static page', async () => {
  expect((await careers(request('/api/leads/careers', payload, true))).headers.get('location')).toBe('/careers/thank-you');
  expect((await careers(request('/api/leads/careers', { ...payload, message: '' }, true))).headers.get('location')).toBe('/careers#careers-form-error');
});
