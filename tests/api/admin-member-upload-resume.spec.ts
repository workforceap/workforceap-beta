// @vitest-environment node
/**
 * POST /api/admin/members/[id]/upload-resume writes resume blobs for a
 * tenant member. Auth and the actor-org findFirst must fail before storage
 * is constructed. Empty bodies 400 and oversized enhanced text 413 without
 * an upload.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findFirst: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  prepareResumeUpload: vi.fn(),
  replaceResumeObjectsAtomically: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { user: { findFirst: typeof h.findFirst } }) => unknown) =>
      fn({ user: { findFirst: h.findFirst } }),
    ),
  },
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: h.getSupabaseAdmin,
}));

vi.mock('@/lib/resume/prepareResumeUpload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/resume/prepareResumeUpload')>();
  return { ...actual, prepareResumeUpload: h.prepareResumeUpload };
});

vi.mock('@/lib/resume/atomicResumeObjectSwap', () => ({
  AtomicResumeObjectSwapError: class AtomicResumeObjectSwapError extends Error {
    phase = 'upload';
    field = 'resumeOriginalPath';
    causeValue: unknown;
    constructor(message: string) {
      super(message);
      this.name = 'AtomicResumeObjectSwapError';
    }
  },
  replaceResumeObjectsAtomically: h.replaceResumeObjectsAtomically,
}));

vi.mock('@/lib/resume/resumeProfileStorage', () => ({
  isResumeProfileConflict: () => false,
  swapResumeProfilePathsWithCas: vi.fn(),
}));

vi.mock('@/lib/workflows/completeCareerOsActions', () => ({
  completeCareerOsResumeActions: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: () => ({}),
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const { POST } = await import('@/app/api/admin/members/[id]/upload-resume/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440003';

function params(id = MEMBER_ID) {
  return { params: Promise.resolve({ id }) };
}

function formRequest(form: FormData) {
  return new Request(`http://localhost/api/admin/members/${MEMBER_ID}/upload-resume`, {
    method: 'POST',
    body: form,
  });
}

describe('POST /api/admin/members/[id]/upload-resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findFirst.mockResolvedValue({ id: MEMBER_ID, deletedAt: null, profile: {} });
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(formRequest(new FormData()) as never, params());
    expect(res.status).toBe(401);
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await POST(formRequest(new FormData()) as never, params());
    expect(res.status).toBe(403);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns 404 for a foreign or deleted member without constructing storage', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await POST(formRequest(new FormData()) as never, params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: MEMBER_ID, organizationId: ORG_ID },
      include: { profile: true },
    });
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();

    h.findFirst.mockResolvedValue({ id: MEMBER_ID, deletedAt: new Date('2026-01-01'), profile: {} });
    const deleted = await POST(formRequest(new FormData()) as never, params());
    expect(deleted.status).toBe(404);
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('returns 400 when neither a file nor enhanced text is provided', async () => {
    const res = await POST(formRequest(new FormData()) as never, params());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Provide resumeOriginal file and/or resumeEnhanced text',
    });
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(h.prepareResumeUpload).not.toHaveBeenCalled();
  });

  it('returns 413 for oversized enhanced text without an upload', async () => {
    const form = new FormData();
    form.set('resumeEnhanced', 'x'.repeat(120_001));
    const res = await POST(formRequest(form) as never, params());
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: 'Enhanced resume text is too large (max 120,000 characters).',
    });
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(h.replaceResumeObjectsAtomically).not.toHaveBeenCalled();
  });

  it('returns 500 when the member lookup throws', async () => {
    h.findFirst.mockRejectedValue(new Error('db down'));
    const res = await POST(formRequest(new FormData()) as never, params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});
