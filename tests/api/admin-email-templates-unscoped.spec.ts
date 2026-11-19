// @vitest-environment node
/**
 * GET /api/admin/email-templates and GET/PATCH /[id] are admin-gated but
 * globally unscoped: list/findUnique/update run by id (or with no where)
 * and there is no organizationId on the model. Pin that current lookup
 * rather than adding a tenant filter in a coverage run.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
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

vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: h.requireAdmin,
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
  auditRequestMeta: vi.fn(() => ({ ip: null, ua: null })),
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    emailTemplate: {
      findMany: h.findMany,
      findUnique: h.findUnique,
      update: h.update,
    },
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => unknown) => fn(prisma)),
  };
  return { prisma };
});

const { GET: listTemplates } = await import('@/app/api/admin/email-templates/route');
const { GET: getTemplate, PATCH: patchTemplate } = await import(
  '@/app/api/admin/email-templates/[id]/route'
);

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440040';

const templateRow = {
  id: TEMPLATE_ID,
  name: 'Welcome',
  subject: 'Hello',
  body: 'Hi {{name}}',
  variables: ['name'],
  active: true,
};

function listRequest() {
  return new Request('http://localhost/api/admin/email-templates');
}

function itemRequest(method: string, body?: unknown) {
  return new Request(`http://localhost/api/admin/email-templates/${TEMPLATE_ID}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function itemCtx() {
  return { params: Promise.resolve({ id: TEMPLATE_ID }) };
}

describe('GET /api/admin/email-templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.findMany.mockResolvedValue([templateRow]);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await listTemplates(listRequest() as never);
    expect(res.status).toBe(401);
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 before listing when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('not admin'));
    const res = await listTemplates(listRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('lists every template with no where clause', async () => {
    const res = await listTemplates(listRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ templates: [templateRow] });
    expect(h.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    expect(h.findMany.mock.calls[0][0]).not.toHaveProperty('where');
  });

  it('returns 500 Internal server error when the list throws', async () => {
    h.findMany.mockRejectedValue(new Error('db down'));
    const res = await listTemplates(listRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /api/admin/email-templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.findUnique.mockResolvedValue(templateRow);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await getTemplate(itemRequest('GET') as never, itemCtx());
    expect(res.status).toBe(401);
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('loads by id only and 404s a missing row', async () => {
    const found = await getTemplate(itemRequest('GET') as never, itemCtx());
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(templateRow);
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: TEMPLATE_ID } });

    h.findUnique.mockResolvedValueOnce(null);
    const missing = await getTemplate(itemRequest('GET') as never, itemCtx());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Not found' });
  });
});

describe('PATCH /api/admin/email-templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.findUnique.mockResolvedValue(templateRow);
    h.update.mockResolvedValue({ ...templateRow, subject: 'Updated' });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 403 before lookup when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('not admin'));
    const res = await patchTemplate(itemRequest('PATCH', { subject: 'Updated' }) as never, itemCtx());
    expect(res.status).toBe(403);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('404s a missing id before parsing the body', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await patchTemplate(itemRequest('PATCH', { subject: 'Updated' }) as never, itemCtx());
    expect(res.status).toBe(404);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON, an empty patch, and a non-array variables field', async () => {
    const invalid = await patchTemplate(itemRequest('PATCH', 'not-json') as never, itemCtx());
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.update).not.toHaveBeenCalled();

    const empty = await patchTemplate(itemRequest('PATCH', {}) as never, itemCtx());
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'No fields to update' });

    const variables = await patchTemplate(
      itemRequest('PATCH', { variables: 'name' }) as never,
      itemCtx(),
    );
    expect(variables.status).toBe(400);
    expect(await variables.json()).toEqual({ error: 'variables must be an array' });
  });

  it('updates by id only after the unscoped lookup', async () => {
    const res = await patchTemplate(itemRequest('PATCH', { subject: 'Updated' }) as never, itemCtx());
    expect(res.status).toBe(200);
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: TEMPLATE_ID } });
    expect(h.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { subject: 'Updated' },
    });
    expect(h.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: ADMIN_ID,
        action: 'admin_email_template_update',
        targetId: TEMPLATE_ID,
      }),
    );
  });

  it('returns 500 Internal server error when the update throws', async () => {
    h.update.mockRejectedValue(new Error('db down'));
    const res = await patchTemplate(itemRequest('PATCH', { subject: 'Updated' }) as never, itemCtx());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
