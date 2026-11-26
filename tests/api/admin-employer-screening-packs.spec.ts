// @vitest-environment node
/**
 * GET/POST /api/admin/employer-screening-packs and PATCH/DELETE /[id] are
 * globally isAdmin-gated and have no organizationId on the model or in the
 * queries — pin that unscoped shape rather than inventing tenant filters.
 * Auth must fail before list/create/update/delete.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  auditLog: vi.fn(),
  captureApiError: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => {
  const employerScreeningPack = {
    findMany: h.findMany,
    findUnique: h.findUnique,
    create: h.create,
    update: h.update,
    delete: h.delete,
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (tx: { employerScreeningPack: typeof employerScreeningPack }) => unknown) =>
        fn({ employerScreeningPack }),
      ),
      employerScreeningPack,
    },
  };
});

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

const { GET, POST } = await import('@/app/api/admin/employer-screening-packs/route');
const { PATCH, DELETE } = await import('@/app/api/admin/employer-screening-packs/[id]/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const PACK_ID = '550e8400-e29b-41d4-a716-446655440010';

const pack = {
  id: PACK_ID,
  programSlug: 'cybersecurity',
  employerLabel: 'Acme',
  packTitle: 'Screening',
  questionsJson: [{ id: 'q1', prompt: 'Are you authorized to work?', type: 'yes_no' }],
  isActive: true,
};

const createBody = {
  programSlug: 'cybersecurity',
  employerLabel: 'Acme',
  packTitle: 'Screening',
  questionsJson: [{ id: 'q1', prompt: 'Are you authorized to work?', type: 'yes_no' }],
};

function listRequest() {
  return new Request('http://localhost/api/admin/employer-screening-packs');
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/employer-screening-packs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/admin/employer-screening-packs/${PACK_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request(`http://localhost/api/admin/employer-screening-packs/${PACK_ID}`, {
    method: 'DELETE',
  });
}

function params(id = PACK_ID) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/admin/employer-screening-packs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.findMany.mockResolvedValue([pack]);
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 before listing when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('lists packs globally with take 100 and no organization filter', async () => {
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ packs: [pack] });
    expect(h.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const args = h.findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args).not.toHaveProperty('where');
  });

  it('returns 500 when the list throws', async () => {
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await GET(listRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /api/admin/employer-screening-packs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.create.mockResolvedValue(pack);
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before create when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 403 before create when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('returns 400 without a write when JSON is invalid or the schema fails', async () => {
    const invalidJson = await POST(
      new Request('http://localhost/api/admin/employer-screening-packs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toEqual({ error: 'Invalid JSON' });

    const invalidSchema = await POST(postRequest({ programSlug: 'cyber' }) as never);
    expect(invalidSchema.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('creates a pack without stamping an organizationId and audits the write', async () => {
    const res = await POST(postRequest({ ...createBody, isActive: false }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pack });
    expect(h.create).toHaveBeenCalledWith({
      data: {
        programSlug: 'cybersecurity',
        employerLabel: 'Acme',
        packTitle: 'Screening',
        questionsJson: createBody.questionsJson,
        isActive: false,
      },
    });
    const data = h.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('organizationId');
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        action: 'admin_screening_pack_create',
        targetType: 'employer_screening_pack',
        targetId: PACK_ID,
      }),
    );
  });

  it('returns 500 without an audit when create throws', async () => {
    h.create.mockRejectedValue(new Error('db down'));
    const res = await POST(postRequest(createBody) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Unable to create pack' });
    expect(h.captureApiError).toHaveBeenCalled();
    expect(h.auditLog).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/employer-screening-packs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.findUnique.mockResolvedValue({ id: PACK_ID });
    h.update.mockResolvedValue({ ...pack, isActive: false });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ isActive: false }) as never, params());
    expect(res.status).toBe(401);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await PATCH(patchRequest({ isActive: false }) as never, params());
    expect(res.status).toBe(403);
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 without a write when the pack is missing', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ isActive: false }) as never, params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Screening pack not found' });
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: PACK_ID }, select: { id: true } });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('updates by id only, with no organization filter', async () => {
    const res = await PATCH(patchRequest({ isActive: false, packTitle: 'Updated' }) as never, params());
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith({
      where: { id: PACK_ID },
      data: { isActive: false, packTitle: 'Updated' },
    });
  });
});

describe('DELETE /api/admin/employer-screening-packs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.findUnique.mockResolvedValue({ id: PACK_ID });
    h.delete.mockResolvedValue(pack);
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await DELETE(deleteRequest() as never, params());
    expect(res.status).toBe(401);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.delete).not.toHaveBeenCalled();
  });

  it('returns 404 without a delete when the pack is missing', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await DELETE(deleteRequest() as never, params());
    expect(res.status).toBe(404);
    expect(h.delete).not.toHaveBeenCalled();
  });

  it('deletes by id only after a global lookup', async () => {
    const res = await DELETE(deleteRequest() as never, params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: PACK_ID }, select: { id: true } });
    expect(h.delete).toHaveBeenCalledWith({ where: { id: PACK_ID } });
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        action: 'admin_screening_pack_delete',
        targetId: PACK_ID,
      }),
    );
  });
});
