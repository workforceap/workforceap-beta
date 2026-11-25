// @vitest-environment node
/**
 * PATCH /api/member/job-applications/[id] updates the caller's tracker
 * row. Unsigned is 401. Lookup is userId+id; a foreign row is 404 with
 * no update. The non-legacy path accepts a kanban CLOSED stage as
 * REJECTED, ignores unknown statuses, and writes an arbitrary source
 * string — pin those. A status move logs both stage and db statuses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  ensureUserInDb: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  trackEvent: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/ensureUser', () => ({
  ensureUserInDb: h.ensureUserInDb,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(
      async (
        fn: (tx: {
          jobApplication: { findFirst: typeof h.findFirst; update: typeof h.update };
        }) => unknown,
      ) => fn({ jobApplication: { findFirst: h.findFirst, update: h.update } }),
    ),
  },
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: h.trackEvent,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
}));

const { PATCH } = await import('@/app/api/member/job-applications/[id]/route');

const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440001';
const APP_ID = '550e8400-e29b-41d4-a716-446655440011';

function request(body?: unknown) {
  return new Request(`http://localhost/api/member/job-applications/${APP_ID}`, {
    method: 'PATCH',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

function params() {
  return { params: Promise.resolve({ id: APP_ID }) };
}

const existing = { id: APP_ID, status: 'APPLIED' };
const updated = { id: APP_ID, status: 'INTERVIEWING', role: 'Help Desk', company: 'Acme' };

describe('PATCH /api/member/job-applications/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: MEMBER_ID });
    h.ensureUserInDb.mockResolvedValue(undefined);
    h.findFirst.mockResolvedValue(existing);
    h.update.mockResolvedValue(updated);
    h.trackEvent.mockResolvedValue(undefined);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(request({ status: 'INTERVIEWING' }) as never, params());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.ensureUserInDb).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('looks up by id+userId and returns 404 without an update when the row is missing', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await PATCH(request({ status: 'INTERVIEWING' }) as never, params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Application not found' });
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: APP_ID, userId: MEMBER_ID },
      select: { id: true, status: true },
    });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.trackEvent).not.toHaveBeenCalled();
  });

  it('maps kanban CLOSED to REJECTED and logs both stage and db statuses', async () => {
    h.update.mockResolvedValue({ ...updated, status: 'REJECTED' });
    const res = await PATCH(request({ status: 'CLOSED' }) as never, params());
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith({
      where: { id: APP_ID },
      data: { status: 'REJECTED' },
    });
    expect(h.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MEMBER_ID,
        eventName: 'application_status_changed',
        entityId: APP_ID,
        metadata: {
          previousStatus: 'APPLIED',
          nextStatus: 'CLOSED',
          previousDbStatus: 'APPLIED',
          nextDbStatus: 'REJECTED',
        },
      }),
    );
  });

  it('ignores an unknown status and still writes an arbitrary source string (pinned)', async () => {
    const res = await PATCH(
      request({ status: 'HIRED', source: 'not-a-source', role: '  Help Desk  ' }) as never,
      params(),
    );
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith({
      where: { id: APP_ID },
      data: { source: 'not-a-source', role: 'Help Desk' },
    });
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty('status');
    expect(h.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'application_updated' }),
    );
  });

  it('returns 400 from the legacy schema when jobTitle is present but blank', async () => {
    const res = await PATCH(request({ jobTitle: '  ' }) as never, params());
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('still looks up the row when the body is not JSON (pinned, not 400)', async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/member/job-applications/${APP_ID}`, {
        method: 'PATCH',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }) as never,
      params(),
    );
    expect(res.status).toBe(200);
    expect(h.findFirst).toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith({ where: { id: APP_ID }, data: {} });
  });

  it('returns 500 Database error when update throws', async () => {
    h.update.mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await PATCH(request({ status: 'INTERVIEWING' }) as never, params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Database error' });
    spy.mockRestore();
  });
});
