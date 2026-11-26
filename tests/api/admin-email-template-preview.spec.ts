// @vitest-environment node
/**
 * POST /api/admin/email-templates/[id]/preview renders a stored template.
 * Unsigned is 401. requireAdmin throw is 403 before lookup. EmailTemplate
 * has no organizationId — findUnique is keyed by id only. Pin that, and
 * pin that preview interpolates variables into body HTML without escaping.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  findUnique: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { emailTemplate: { findUnique: typeof h.findUnique } }) => unknown) =>
      fn({ emailTemplate: { findUnique: h.findUnique } }),
    ),
  },
}));

const { POST } = await import('@/app/api/admin/email-templates/[id]/preview/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440010';

function request(body?: unknown) {
  return new Request(`http://localhost/api/admin/email-templates/${TEMPLATE_ID}/preview`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

function params(id = TEMPLATE_ID) {
  return { params: Promise.resolve({ id }) };
}

const template = {
  id: TEMPLATE_ID,
  key: 'welcome-member',
  name: 'Welcome',
  subject: 'Hello {firstName}',
  body: '<p>Hi {firstName}</p>',
  variables: ['firstName'],
};

describe('POST /api/admin/email-templates/[id]/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.requireAdmin.mockResolvedValue(undefined);
    h.findUnique.mockResolvedValue(template);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request() as never, params());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.requireAdmin).not.toHaveBeenCalled();
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when requireAdmin throws', async () => {
    h.requireAdmin.mockRejectedValue(new Error('not admin'));
    const res = await POST(request() as never, params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('looks up the template by id only — no organizationId', async () => {
    const res = await POST(request() as never, params());
    expect(res.status).toBe(200);
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: TEMPLATE_ID } });
    expect(h.findUnique.mock.calls[0][0].where).not.toHaveProperty('organizationId');
    const body = await res.json();
    expect(body.subject).toBe('Hello Maria');
    expect(body.html).toContain('<p>Hi Maria</p>');
    expect(body.sampleData).toEqual({ firstName: 'Maria' });
  });

  it('returns 404 when the template id is missing', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await POST(request() as never, params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('uses body.variables when provided and interpolates them unescaped into body HTML', async () => {
    const res = await POST(
      request({ variables: { firstName: '<script>alert(1)</script>' } }) as never,
      params(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subject).toBe('Hello <script>alert(1)</script>');
    expect(body.html).toContain('<p>Hi <script>alert(1)</script></p>');
    expect(body.sampleData).toEqual({ firstName: '<script>alert(1)</script>' });
  });

  it('falls back to default sample data when the body is not JSON', async () => {
    const res = await POST(
      new Request(`http://localhost/api/admin/email-templates/${TEMPLATE_ID}/preview`, {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }) as never,
      params(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      subject: 'Hello Maria',
      sampleData: { firstName: 'Maria' },
    });
  });

  it('returns 500 when lookup throws', async () => {
    h.findUnique.mockRejectedValue(new Error('db down'));
    const res = await POST(request() as never, params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
