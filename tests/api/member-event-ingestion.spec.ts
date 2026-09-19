import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_EVENT_NAMES, EVENT_NAMES } from '@/lib/events/names';
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn() }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
import { POST } from '@/app/api/events/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { trackEvent } from '@/lib/events/track';

const request = (payload: unknown) => new Request('https://example.test/api/events', {
  method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' },
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'actor' } as never);
  vi.mocked(isAdmin).mockResolvedValue(false);
});

describe('browser engagement event boundary', () => {
  it.each(CLIENT_EVENT_NAMES)('accepts the maintained client emitter %s using the authenticated actor', async (eventName) => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const response = await POST(request({ eventName, userId: 'forged-subject', sourcePage: '/dashboard', metadata: { action: 'open' } }));
    expect(response.status).toBe(200);
    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'actor', eventName, sourcePage: '/dashboard' }));
  });
  it.each(EVENT_NAMES.filter((name) => !(CLIENT_EVENT_NAMES as readonly string[]).includes(name)))('rejects server evidence %s', async (eventName) => {
    const response = await POST(request({ eventName }));
    expect(response.status).toBe(400);
    expect(trackEvent).not.toHaveBeenCalled();
  });
  it.each(['made_up', '', 'PROGRAM_ENROLLED', 'course_completed ', 'account_deleted'])('rejects an unknown or altered name: %s', async (eventName) => {
    expect((await POST(request({ eventName }))).status).toBe(400);
    expect(trackEvent).not.toHaveBeenCalled();
  });
  it('requires staff authorization for staff review observations', async () => {
    expect((await POST(request({ eventName: 'admin_job_review_viewed' }))).status).toBe(403);
    expect(trackEvent).not.toHaveBeenCalled();
  });
  it('requires authentication before accepting events', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await POST(request({ eventName: 'member_dashboard_viewed' }))).status).toBe(401);
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
