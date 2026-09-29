// @vitest-environment node
/**
 * S03 part 2: a certificate proof or a logo is accepted only when its bytes
 * are really the type its name claims. The routes used to pick the stored
 * content type from the file name alone, so any bytes named `proof.pdf` or
 * `logo.png` were stored (and, for logos, served publicly) under a trusted
 * type. A mismatch is now refused with the route's existing error text, and
 * nothing is uploaded, written or audited.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const upload = vi.fn(async (path: string, _body?: unknown, _options?: unknown) => ({ data: { path }, error: null }));
  const prisma = {
    $transaction: async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
    userCertification: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({ id: 'cert-1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    organization: { update: vi.fn(async () => ({ id: 'org-1' })) },
    employer: { update: vi.fn(async () => ({ id: 'employer-1' })) },
  };
  return { upload, prisma, auditLog: vi.fn(async () => undefined), logAuditEvent: vi.fn(async () => undefined) };
});

vi.mock('next/server', () => {
  class MockNextRequest extends Request {}
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse };
});
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: h.prisma }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ storage: { from: () => ({ upload: h.upload }) } }) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'user-1' })) }));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(async () => true),
  getEmployerForUser: vi.fn(async () => ({ employerId: 'employer-1' })),
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/storage/publicAssetUrl', () => ({
  resolveSupabasePublicAssetUrl: (bucket: string, path: string) => `https://storage.test/${bucket}/${path}`,
}));
vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: h.logAuditEvent }));

import { POST as uploadCertification } from '@/app/api/member/certifications/upload/route';
import { POST as uploadOrgLogo } from '@/app/api/admin/organization/logo/route';
import { POST as uploadEmployerLogo } from '@/app/api/employer/logo/route';

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? ascii(p) : p)));

const PDF = bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');
const HTML = bytes('<html><body><script>alert(1)</script></body></html>');
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d], 'IHDR');
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF', [0, 1, 1]);
const WEBP = bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ');
const GIF = bytes('GIF89a', [1, 0, 1, 0, 0x80, 0, 0]);

function multipart(url: string, filename: string, type: string, content: Uint8Array<ArrayBuffer>, extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  fd.append('file', new File([content], filename, { type }));
  return new Request(url, { method: 'POST', body: fd });
}

const certRequest = (filename: string, type: string, content: Uint8Array<ArrayBuffer>) =>
  multipart('https://example.test/api/member/certifications/upload', filename, type, content, { certName: 'CompTIA A+' });
const orgLogoRequest = (filename: string, type: string, content: Uint8Array<ArrayBuffer>) =>
  multipart('https://example.test/api/admin/organization/logo', filename, type, content);
const employerLogoRequest = (filename: string, type: string, content: Uint8Array<ArrayBuffer>) =>
  multipart('https://example.test/api/employer/logo', filename, type, content);

function expectNothingStored() {
  expect(h.upload).not.toHaveBeenCalled();
  expect(h.prisma.userCertification.update).not.toHaveBeenCalled();
  expect(h.prisma.userCertification.updateMany).not.toHaveBeenCalled();
  expect(h.prisma.organization.update).not.toHaveBeenCalled();
  expect(h.prisma.employer.update).not.toHaveBeenCalled();
  expect(h.auditLog).not.toHaveBeenCalled();
  expect(h.logAuditEvent).not.toHaveBeenCalled();
}

async function expectRefused(res: Response, error: string) {
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error });
  expectNothingStored();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.prisma.userCertification.findUnique.mockResolvedValue({
    id: 'cert-1',
    userId: 'user-1',
    certName: 'CompTIA A+',
    status: 'pending',
    proofUrl: null,
  });
});

describe('POST /api/member/certifications/upload checks the proof bytes', () => {
  const REFUSED = 'Only PDF and image files are accepted';

  it('refuses proof.pdf whose bytes are HTML, without uploading or writing', async () => {
    await expectRefused(await uploadCertification(certRequest('proof.pdf', 'application/pdf', HTML) as never), REFUSED);
  });

  it('refuses a PDF renamed to .png and a JPEG named .webp', async () => {
    await expectRefused(await uploadCertification(certRequest('proof.png', 'image/png', PDF) as never), REFUSED);
    await expectRefused(await uploadCertification(certRequest('proof.webp', 'image/webp', JPEG) as never), REFUSED);
  });

  it('refuses a GIF even when it is named .gif (extension rule unchanged)', async () => {
    await expectRefused(await uploadCertification(certRequest('proof.gif', 'image/gif', GIF) as never), REFUSED);
  });

  it('accepts a real %PDF-1.7 file and stores it as application/pdf', async () => {
    const res = await uploadCertification(certRequest('proof.pdf', 'application/pdf', PDF) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, status: 'pending' });
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.upload.mock.calls[0][2]).toMatchObject({ contentType: 'application/pdf' });
  });

  it.each([
    ['proof.jpg', JPEG, 'image/jpeg'],
    ['proof.JPEG', JPEG, 'image/jpeg'],
    ['proof.png', PNG, 'image/png'],
    ['proof.webp', WEBP, 'image/webp'],
  ])('accepts a real image %s', async (name, content, contentType) => {
    const res = await uploadCertification(certRequest(name, contentType, content) as never);
    expect(res.status).toBe(200);
    expect(h.upload.mock.calls[0][2]).toMatchObject({ contentType });
  });
});

describe('POST /api/employer/logo checks the logo bytes', () => {
  const REFUSED = 'Use PNG or JPG only';

  it('refuses logo.png whose bytes are JPEG', async () => {
    await expectRefused(await uploadEmployerLogo(employerLogoRequest('logo.png', 'image/png', JPEG)), REFUSED);
  });

  it('refuses logo.jpg whose bytes are HTML', async () => {
    await expectRefused(await uploadEmployerLogo(employerLogoRequest('logo.jpg', 'image/jpeg', HTML)), REFUSED);
  });

  it('refuses a real GIF (employer logos stay PNG/JPG only)', async () => {
    await expectRefused(await uploadEmployerLogo(employerLogoRequest('logo.gif', 'image/gif', GIF)), REFUSED);
  });

  it.each([
    ['logo.png', PNG, 'image/png'],
    ['logo.jpg', JPEG, 'image/jpeg'],
    ['logo.jpeg', JPEG, 'image/jpeg'],
  ])('accepts a real %s and audits it', async (name, content, contentType) => {
    const res = await uploadEmployerLogo(employerLogoRequest(name, contentType, content));
    expect(res.status).toBe(200);
    expect(h.upload.mock.calls[0][2]).toMatchObject({ contentType });
    expect(h.prisma.employer.update).toHaveBeenCalledTimes(1);
    expect(h.auditLog).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/admin/organization/logo checks the logo bytes', () => {
  const REFUSED = 'Use PNG, JPG, WebP, or GIF';

  it('refuses logo.png whose bytes are JPEG', async () => {
    await expectRefused(await uploadOrgLogo(orgLogoRequest('logo.png', 'image/png', JPEG)), REFUSED);
  });

  it('refuses logo.gif whose bytes are HTML and logo.webp whose bytes are PNG', async () => {
    await expectRefused(await uploadOrgLogo(orgLogoRequest('logo.gif', 'image/gif', HTML)), REFUSED);
    await expectRefused(await uploadOrgLogo(orgLogoRequest('logo.webp', 'image/webp', PNG)), REFUSED);
  });

  it.each([
    ['logo.gif', GIF, 'image/gif'],
    ['logo.png', PNG, 'image/png'],
    ['logo.jpg', JPEG, 'image/jpeg'],
    ['logo.webp', WEBP, 'image/webp'],
  ])('accepts a real %s and audits it', async (name, content, contentType) => {
    const res = await uploadOrgLogo(orgLogoRequest(name, contentType, content));
    expect(res.status).toBe(200);
    expect(h.upload.mock.calls[0][2]).toMatchObject({ contentType });
    expect(h.prisma.organization.update).toHaveBeenCalledTimes(1);
    expect(h.auditLog).toHaveBeenCalledTimes(1);
  });
});
