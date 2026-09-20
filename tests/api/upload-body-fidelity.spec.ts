/**
 * WAP-77: byte fidelity for the three non-resume upload routes.
 *
 * Mirrors `lib/resume/resumeUploadBodyFidelity.test.ts`. Each route validates a
 * multipart `file` part and hands a body to Supabase Storage. These tests pin,
 * for every route, that the staged body is a byte view (never a bare
 * `ArrayBuffer`), that it is non-empty, byte-identical to the uploaded bytes
 * and spans exactly its own backing store, so a `.buffer` read at the storage
 * boundary cannot over-read adjacent memory. A binary fixture with every byte
 * value plus CR/LF/boundary-like sequences guards multipart parsing itself.
 */
import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const uploads: Array<{ bucket: string; path: string; body: unknown; options: unknown }> = [];
  const upload = vi.fn(async (path: string, body: unknown, options: unknown) => {
    uploads.push({ bucket: currentBucket, path, body, options });
    return { data: { path }, error: null };
  });
  let currentBucket = '';
  const storage = {
    from: (bucket: string) => {
      currentBucket = bucket;
      return { upload };
    },
  };
  const prisma = {
    $transaction: async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
    userCertification: {
      findUnique: vi.fn(async () => ({ id: 'cert-1' })),
      update: vi.fn(async () => ({ id: 'cert-1' })),
    },
    organization: { update: vi.fn(async () => ({ id: 'org-1' })) },
    employer: { update: vi.fn(async () => ({ id: 'employer-1' })) },
  };
  return { uploads, upload, storage, prisma };
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
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ storage: h.storage }) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'user-1' })) }));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(async () => true),
  getEmployerForUser: vi.fn(async () => ({ employerId: 'employer-1' })),
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/storage/publicAssetUrl', () => ({
  resolveSupabasePublicAssetUrl: (bucket: string, path: string) => `https://storage.test/${bucket}/${path}`,
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { POST as uploadCertification } from '@/app/api/member/certifications/upload/route';
import { POST as uploadOrgLogo } from '@/app/api/admin/organization/logo/route';
import { POST as uploadEmployerLogo } from '@/app/api/employer/logo/route';

/**
 * Deterministic binary fixture: every byte value, then sequences that stress a
 * multipart parser (CRLF, dashes, a fake boundary prefix, NULs). Produced as a
 * view into a larger pooled allocation, as `Buffer.from` does for small
 * payloads, so the route must copy rather than forward the pool.
 */
function binaryFixture(label: string): { bytes: Uint8Array; expected: Buffer } {
  const parts: Buffer[] = [Buffer.from(label, 'utf8')];
  parts.push(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
  parts.push(Buffer.from('\r\n--\r\n----WebKitFormBoundary\r\nContent-Type: text/plain\r\n\r\n\u0000\u0000', 'latin1'));
  parts.push(Buffer.from(Array.from({ length: 1024 }, (_, i) => (i * 37 + 11) & 0xff)));
  const expected = Buffer.concat(parts);
  const pool = new Uint8Array(expected.length + 4096).fill(0xab);
  pool.set(expected, 1024);
  const bytes = pool.subarray(1024, 1024 + expected.length);
  return { bytes, expected };
}

/** Hand-rolled multipart/form-data so the body is exactly the bytes we assert on. */
function multipartRequest(
  url: string,
  fields: Array<{ name: string; value: string } | { name: string; filename: string; type: string; bytes: Uint8Array }>,
): Request {
  const boundary = `----WapFidelity${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const field of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`, 'latin1'));
    if ('filename' in field) {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\nContent-Type: ${field.type}\r\n\r\n`,
        'latin1',
      ));
      chunks.push(Buffer.from(field.bytes));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}`, 'latin1'));
    }
    chunks.push(Buffer.from('\r\n', 'latin1'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'latin1'));
  const body = Buffer.concat(chunks);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
  });
}

type RouteCase = {
  label: string;
  bucket: string;
  filename: string;
  type: string;
  expectedPath: string;
  post: (request: Request) => Promise<Response>;
  extraFields: Array<{ name: string; value: string }>;
};

const ROUTES: RouteCase[] = [
  {
    label: 'POST /api/member/certifications/upload',
    bucket: 'member-files',
    filename: 'certificate.pdf',
    type: 'application/pdf',
    expectedPath: 'cert-files/user-1/cert-1.pdf',
    post: (request) => uploadCertification(request as never),
    extraFields: [{ name: 'certName', value: 'CompTIA A+' }],
  },
  {
    label: 'POST /api/admin/organization/logo',
    bucket: 'organization-branding',
    filename: 'logo.png',
    type: 'image/png',
    expectedPath: 'org-1/logo.png',
    post: (request) => uploadOrgLogo(request as never),
    extraFields: [],
  },
  {
    label: 'POST /api/employer/logo',
    bucket: 'employer-logos',
    filename: 'logo.jpg',
    type: 'image/jpeg',
    expectedPath: 'employer-1/logo.jpg',
    post: (request) => uploadEmployerLogo(request as never),
    extraFields: [],
  },
];

beforeEach(() => {
  h.uploads.length = 0;
  h.upload.mockClear();
});

describe.each(ROUTES)('$label body fidelity', (route) => {
  it('stages a non-empty byte view that is byte-identical to the uploaded file', async () => {
    const { bytes, expected } = binaryFixture(route.label);
    expect(bytes.byteOffset).toBeGreaterThan(0);
    expect(bytes.buffer.byteLength).toBeGreaterThan(bytes.byteLength);

    const response = await route.post(multipartRequest(`https://example.test${route.label.split(' ')[1]}`, [
      ...route.extraFields,
      { name: 'file', filename: route.filename, type: route.type, bytes },
    ]));

    expect(response.status).toBe(200);
    expect(h.uploads).toHaveLength(1);
    const staged = h.uploads[0];
    expect(staged.bucket).toBe(route.bucket);
    expect(staged.path).toBe(route.expectedPath);
    expect(staged.options).toMatchObject({ upsert: true, contentType: route.type });

    const body = staged.body;
    expect(body).toBeInstanceOf(Uint8Array);
    expect(body).not.toBeInstanceOf(ArrayBuffer);
    const view = body as Uint8Array;
    expect(view.byteLength).toBeGreaterThan(0);
    expect(view.byteLength).toBe(expected.length);
    expect(Buffer.from(view).equals(expected)).toBe(true);
  });

  it('spans exactly its own backing store, so a .buffer read cannot over-read', async () => {
    const { bytes, expected } = binaryFixture(route.label);
    await route.post(multipartRequest(`https://example.test${route.label.split(' ')[1]}`, [
      ...route.extraFields,
      { name: 'file', filename: route.filename, type: route.type, bytes },
    ]));
    const view = h.uploads[0]?.body as Uint8Array;
    expect(view.byteOffset).toBe(0);
    expect(view.buffer.byteLength).toBe(view.byteLength);
    expect(view.buffer.byteLength).toBe(expected.length);
    // The route copied the bytes: mutating the caller's pool afterwards does
    // not change what storage received.
    bytes.fill(0);
    expect(Buffer.from(view).equals(expected)).toBe(true);
  });

  it('never stages an empty body', async () => {
    const response = await route.post(multipartRequest(`https://example.test${route.label.split(' ')[1]}`, [
      ...route.extraFields,
      { name: 'file', filename: route.filename, type: route.type, bytes: new Uint8Array(0) },
    ]));
    // Logo routes reject size 0 up front; the certification route would
    // otherwise stage nothing, so either a 4xx or a non-empty stage is the
    // only acceptable outcome.
    if (response.status === 200) {
      expect(h.uploads).toHaveLength(1);
      expect((h.uploads[0].body as Uint8Array).byteLength).toBeGreaterThan(0);
    } else {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(h.uploads).toHaveLength(0);
    }
  });
});
