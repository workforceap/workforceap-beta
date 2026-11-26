// @vitest-environment node
/**
 * POST /api/admin/organization/logo writes branding for the actor org, not
 * the platform default. Auth must run before the upload; the storage path
 * and organization.update where both use getActorOrganizationId so a
 * tenant admin cannot overwrite another org's logo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  matchesType: vi.fn(),
  upload: vi.fn(),
  updateOrg: vi.fn(),
  publicUrl: vi.fn(),
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

vi.mock('@/lib/uploads/imageSignature', () => ({
  fileMatchesContentType: (...args: unknown[]) => h.matchesType(...args),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    storage: { from: () => ({ upload: h.upload }) },
  }),
}));

vi.mock('@/lib/storage/publicAssetUrl', () => ({
  resolveSupabasePublicAssetUrl: (...args: unknown[]) => h.publicUrl(...args),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { organization: { update: typeof h.updateOrg } }) => unknown) =>
      fn({ organization: { update: h.updateOrg } })),
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));

const { POST } = await import('@/app/api/admin/organization/logo/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function postFile(file: File | null, extra?: { skipFile?: boolean }) {
  const body = new FormData();
  if (!extra?.skipFile && file) body.append('file', file);
  return new Request('http://localhost/api/admin/organization/logo', {
    method: 'POST',
    body,
  });
}

describe('POST /api/admin/organization/logo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.matchesType.mockResolvedValue(true);
    h.upload.mockResolvedValue({ error: null });
    h.updateOrg.mockResolvedValue({ id: ORG_ID, logo: `${ORG_ID}/logo.png` });
    h.publicUrl.mockReturnValue(`https://cdn.example.test/organization-branding/${ORG_ID}/logo.png`);
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before reading the upload when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(postFile(new File([PNG], 'logo.png', { type: 'image/png' })));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.updateOrg).not.toHaveBeenCalled();
  });

  it('returns 403 without a write when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await POST(postFile(new File([PNG], 'logo.png', { type: 'image/png' })));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('returns 400 without uploading when the file field is missing', async () => {
    const res = await POST(postFile(null, { skipFile: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No file provided' });
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('returns 400 without uploading when the extension is not an image', async () => {
    const res = await POST(postFile(new File([PNG], 'logo.html', { type: 'text/html' })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Use PNG, JPG, WebP, or GIF' });
    expect(h.matchesType).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('returns 400 without uploading when the bytes do not match the claimed type', async () => {
    h.matchesType.mockResolvedValue(false);
    const res = await POST(postFile(new File([PNG], 'logo.png', { type: 'image/png' })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Use PNG, JPG, WebP, or GIF' });
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.updateOrg).not.toHaveBeenCalled();
  });

  it('uploads and updates the actor org id, not a platform default', async () => {
    const file = new File([PNG], 'logo.png', { type: 'image/png' });
    const res = await POST(postFile(file));
    expect(res.status).toBe(200);
    expect(h.upload).toHaveBeenCalledWith(
      `${ORG_ID}/logo.png`,
      expect.any(Uint8Array),
      { upsert: true, contentType: 'image/png' },
    );
    expect(h.updateOrg).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { logo: `${ORG_ID}/logo.png` },
    });
    expect(h.publicUrl).toHaveBeenCalledWith('organization-branding', `${ORG_ID}/logo.png`);
    expect(await res.json()).toEqual({
      ok: true,
      logo: `https://cdn.example.test/organization-branding/${ORG_ID}/logo.png`,
    });
    expect(h.auditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: ADMIN_ID,
      action: 'admin_org_logo_upload',
      targetId: ORG_ID,
    }));
  });

  it('answers 500 without writing when storage upload fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.upload.mockResolvedValue({ error: { message: 'bucket missing' } });
    const res = await POST(postFile(new File([PNG], 'logo.png', { type: 'image/png' })));
    expect(res.status).toBe(500);
    expect(h.updateOrg).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('answers 500 when actor-org resolution throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org unavailable'));
    const res = await POST(postFile(new File([PNG], 'logo.png', { type: 'image/png' })));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.upload).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
