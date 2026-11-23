// @vitest-environment node
/**
 * POST /api/admin/coursera/csv-import ingests a Coursera activity export
 * into the actor org. Unsigned and non-admin both answer 401 (not 403)
 * before org resolution. 5 MB Content-Length is 413. Ingest is called with
 * `{ source: 'csv_import', organizationId }` — pin that. Parse/ingest 500
 * text is already covered by api-error-echo-followups.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  detectCourseraCsvKind: vi.fn(),
  parseCourseActivityCsv: vi.fn(),
  parseLearningPathActivityCsv: vi.fn(),
  ingestCourseActivityRows: vi.fn(),
  ingestLearningPathActivityRows: vi.fn(),
  auditLog: vi.fn(),
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

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: h.isAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/coursera/csvImport', () => ({
  detectCourseraCsvKind: h.detectCourseraCsvKind,
  parseCourseActivityCsv: h.parseCourseActivityCsv,
  parseLearningPathActivityCsv: h.parseLearningPathActivityCsv,
}));

vi.mock('@/lib/coursera/csvImport.server', () => ({
  ingestCourseActivityRows: h.ingestCourseActivityRows,
  ingestLearningPathActivityRows: h.ingestLearningPathActivityRows,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

const { POST } = await import('@/app/api/admin/coursera/csv-import/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const CSV = 'Email,Course ID,Program Slug\nmember@example.test,course-1,help-desk\n';

function textCsv(body = CSV, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/admin/coursera/csv-import', {
    method: 'POST',
    headers: { 'content-type': 'text/csv', ...headers },
    body,
  });
}

describe('POST /api/admin/coursera/csv-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.detectCourseraCsvKind.mockReturnValue('course-activity');
    h.parseCourseActivityCsv.mockReturnValue([{ email: 'member@example.test' }]);
    h.parseLearningPathActivityCsv.mockReturnValue([{ email: 'member@example.test' }]);
    h.ingestCourseActivityRows.mockResolvedValue({ inserted: 1, updated: 0, unresolved: 0 });
    h.ingestLearningPathActivityRows.mockResolvedValue({ inserted: 1, updated: 0, unresolved: 0 });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before org resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(textCsv() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.detectCourseraCsvKind).not.toHaveBeenCalled();
  });

  it('returns 401 (not 403) before org resolution when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await POST(textCsv() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.ingestCourseActivityRows).not.toHaveBeenCalled();
  });

  it('returns 413 before parse when Content-Length exceeds 5 MB', async () => {
    const res = await POST(textCsv(CSV, { 'content-length': String(5 * 1024 * 1024 + 1) }) as never);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'CSV exceeds 5 MB limit' });
    expect(h.detectCourseraCsvKind).not.toHaveBeenCalled();
  });

  it('returns 415 for JSON bodies', async () => {
    const res = await POST(
      new Request('http://localhost/api/admin/coursera/csv-import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv: CSV }),
      }) as never,
    );
    expect(res.status).toBe(415);
    expect((await res.json()).error).toContain('Unsupported Content-Type');
    expect(h.detectCourseraCsvKind).not.toHaveBeenCalled();
  });

  it('returns 400 when the header row is not a Coursera export', async () => {
    h.detectCourseraCsvKind.mockReturnValue(null);
    const res = await POST(textCsv() as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Could not detect CSV type');
    expect(h.parseCourseActivityCsv).not.toHaveBeenCalled();
    expect(h.ingestCourseActivityRows).not.toHaveBeenCalled();
  });

  it('returns 400 when course-activity parse yields no rows', async () => {
    h.parseCourseActivityCsv.mockReturnValue([]);
    const res = await POST(textCsv() as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('No valid rows found');
    expect(h.ingestCourseActivityRows).not.toHaveBeenCalled();
  });

  it('ingests course-activity rows with the actor organizationId', async () => {
    const res = await POST(textCsv() as never);
    expect(res.status).toBe(200);
    expect(h.ingestCourseActivityRows).toHaveBeenCalledWith(
      [{ email: 'member@example.test' }],
      { source: 'csv_import', organizationId: ORG_ID },
    );
    expect(h.ingestLearningPathActivityRows).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      ok: true,
      kind: 'course-activity',
      filename: null,
      parsed: 1,
      inserted: 1,
      updated: 0,
      unresolved: 0,
    });
  });

  it('ingests a learning-path CSV with the same actor org', async () => {
    h.detectCourseraCsvKind.mockReturnValue('learning-path-activity');
    const res = await POST(textCsv() as never);
    expect(res.status).toBe(200);
    expect(h.ingestLearningPathActivityRows).toHaveBeenCalledWith(
      [{ email: 'member@example.test' }],
      { source: 'csv_import', organizationId: ORG_ID },
    );
    expect(h.ingestCourseActivityRows).not.toHaveBeenCalled();
    expect((await res.json()).kind).toBe('learning-path-activity');
  });

  it('accepts a multipart csv field and records the filename', async () => {
    const form = new FormData();
    form.append('csv', new File([CSV], 'progress.csv', { type: 'text/csv' }));
    const res = await POST(
      new Request('http://localhost/api/admin/coursera/csv-import', {
        method: 'POST',
        body: form,
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.ingestCourseActivityRows).toHaveBeenCalledWith(
      [{ email: 'member@example.test' }],
      { source: 'csv_import', organizationId: ORG_ID },
    );
    expect((await res.json()).filename).toBe('progress.csv');
  });
});
