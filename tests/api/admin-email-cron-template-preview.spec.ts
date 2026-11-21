// @vitest-environment node
/**
 * GET /api/admin/email-crons/[id]/template-preview is an admin-only HTML
 * sample. It does not read members — dummy names only — but it must stay
 * 401/403 before buildPreview and 404 for unknown cron ids so the surface
 * is not a staff-directory oracle.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  };
});

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: h.requireAdmin,
}));

const { GET } = await import('@/app/api/admin/email-crons/[id]/template-preview/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function request(id: string) {
  return new NextRequest(`http://localhost/api/admin/email-crons/${id}/template-preview`);
}

describe('GET /api/admin/email-crons/[id]/template-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
  });

  it('returns 401 before requireAdmin when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request('weekly-recap'), params('weekly-recap'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin', async () => {
    h.requireAdmin.mockRejectedValue(new Error('Forbidden: admin access required'));
    const res = await GET(request('weekly-recap'), params('weekly-recap'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 404 for an unknown cron id', async () => {
    const res = await GET(request('not-a-cron'), params('not-a-cron'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Unknown cron id' });
  });

  it('returns dummy HTML for weekly-recap and inactivity-nudge without member reads', async () => {
    const recap = await GET(request('weekly-recap'), params('weekly-recap'));
    expect(recap.status).toBe(200);
    const recapBody = await recap.json();
    expect(recapBody.cronId).toBe('weekly-recap');
    expect(recapBody.subject).toBe('Your WorkforceAP Weekly Recap');
    expect(recapBody.html).toContain('Alex');
    expect(recapBody.html).toContain('Networking Fundamentals');

    const nudge = await GET(request('inactivity-nudge'), params('inactivity-nudge'));
    expect(nudge.status).toBe(200);
    const nudgeBody = await nudge.json();
    expect(nudgeBody.cronId).toBe('inactivity-nudge');
    expect(nudgeBody.cronName).toBe('Inactivity Nudge (14-Day)');
    expect(nudgeBody.html).toContain('Jordan');
  });

  it('returns dummy HTML for applicant-followup and milestone-celebration', async () => {
    const followup = await GET(request('applicant-followup'), params('applicant-followup'));
    expect(followup.status).toBe(200);
    expect(await followup.json()).toMatchObject({
      cronId: 'applicant-followup',
      subject: 'Your WorkforceAP Application is Being Reviewed',
    });

    const milestone = await GET(request('milestone-celebration'), params('milestone-celebration'));
    expect(milestone.status).toBe(200);
    const body = await milestone.json();
    expect(body.cronId).toBe('milestone-celebration');
    expect(body.html).toContain('Casey');
    expect(body.html).toContain('IT Support Professional (Google)');
  });
});
