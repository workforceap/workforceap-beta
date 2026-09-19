// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/tenant/organizationBranding', () => ({ getOrganizationBranding: vi.fn() }));
import { getCounselorContactLink } from '@/lib/counselor/bookingLink';
import { memberStuckHtml } from '@/emails/member-stuck';
import { sendMemberStuckEmail } from '@/lib/email';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('COUNSELOR_BOOKING_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.workforceap.org');
  vi.stubEnv('RESEND_API_KEY', 'synthetic-provider-only');
  vi.stubEnv('CRON_SECRET', 'synthetic-unsubscribe-only');
  mocks.send.mockResolvedValue({ data: { id: 'synthetic-receipt' }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
const message = { to: 'member@workforceap.org', firstName: 'Fixture', counselorName: 'Counselor' };

describe('counselor contact links in stalled-training emails', () => {
  it.each(['', ' ', 'javascript:alert(1)', 'data:text/html,unsafe', 'https://user:secret@example.test/calendar', 'not a url'])('uses the real inbox with honest copy for invalid booking config %s', (config) => {
    vi.stubEnv('COUNSELOR_BOOKING_URL', config);
    expect(getCounselorContactLink()).toEqual({ kind: 'message', url: 'https://www.workforceap.org/dashboard/messages', label: 'Message your counselor' });
    const html = memberStuckHtml(message);
    expect(html).toContain('Message your counselor');
    expect(html).toContain('a message to arrange a time');
    expect(html).not.toContain('Book 15 minutes');
    expect(html).not.toContain('/counselor/book-15');
  });
  it('reads configured HTTPS calendar URLs at render time and escapes the link', () => {
    vi.stubEnv('COUNSELOR_BOOKING_URL', ' https://calendar.example.test/meet?a=1&b=2 ');
    expect(memberStuckHtml(message)).toContain('https://calendar.example.test/meet?a=1&amp;b=2');
    expect(memberStuckHtml(message)).toContain('Book 15 minutes');
    vi.stubEnv('COUNSELOR_BOOKING_URL', 'https://calendar.example.test/new');
    expect(memberStuckHtml(message)).toContain('https://calendar.example.test/new');
  });
  it('prefers a valid per-message calendar and rejects unsafe overrides', () => {
    vi.stubEnv('COUNSELOR_BOOKING_URL', 'https://calendar.example.test/default');
    expect(getCounselorContactLink('https://calendar.example.test/member').url).toContain('/member');
    expect(getCounselorContactLink('javascript:alert(1)').url).toContain('/default');
  });
  it('uses a valid configured site for the inbox and rejects unsafe site origins', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://portal.example.test/base');
    expect(getCounselorContactLink().url).toBe('https://portal.example.test/dashboard/messages');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'javascript:alert(1)');
    expect(getCounselorContactLink().url).toBe('https://www.workforceap.org/dashboard/messages');
  });
  it.each([false, true])('composed provider email keeps the exact contact destination (calendar=%s)', async (configured) => {
    if (configured) vi.stubEnv('COUNSELOR_BOOKING_URL', 'https://calendar.example.test/meet');
    expect(await sendMemberStuckEmail(message)).toEqual({ ok: true });
    const html = mocks.send.mock.calls[0][0].html as string;
    const destination = configured ? 'https://calendar.example.test/meet' : 'https://www.workforceap.org/dashboard/messages';
    expect(html).toContain(`href="${destination}"`);
    expect(html.match(new RegExp(configured ? '>Book 15 minutes</a>' : '>Message your counselor</a>', 'g'))).toHaveLength(1);
    expect(html).not.toContain('/counselor/book-15');
  });
});
