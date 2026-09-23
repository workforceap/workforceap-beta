// @vitest-environment node
/**
 * WAP-197 item 3 (Mike, 2026-09-23: "if verified we are good. Just note it"):
 * attaching a file to an already verified (`approved`) certificate saves the
 * file but keeps the certificate verified, and records the change in the
 * audit log. Unverified certificates keep the existing behaviour: the file
 * sends them (back) to `pending` staff review.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const upload = vi.fn(async (path: string) => ({ data: { path }, error: null }));
  const prisma = {
    $transaction: async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
    userCertification: {
      findUnique: vi.fn(),
      update: vi.fn(async () => ({ id: 'cert-1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
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
vi.mock('@/lib/audit', () => ({ auditLog: h.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: h.logAuditEvent }));

import { POST } from '@/app/api/member/certifications/upload/route';

function uploadRequest(certName = 'CompTIA A+'): Request {
  const fd = new FormData();
  fd.append('certName', certName);
  fd.append('file', new File(['%PDF-1.4 proof'], 'proof.pdf', { type: 'application/pdf' }));
  return new Request('https://example.test/api/member/certifications/upload', { method: 'POST', body: fd });
}

function cert(status: 'pending' | 'approved' | 'rejected', proofUrl: string | null = null) {
  return {
    id: 'cert-1',
    userId: 'user-1',
    certName: 'CompTIA A+',
    status,
    proofUrl,
    submittedAt: new Date('2026-09-01T00:00:00Z'),
    reviewedAt: status === 'pending' ? null : new Date('2026-09-02T00:00:00Z'),
    reviewedById: status === 'pending' ? null : 'admin-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/member/certifications/upload review status (WAP-197)', () => {
  it('a verified certificate stays verified: only the proof path changes', async () => {
    h.prisma.userCertification.findUnique.mockResolvedValue(cert('approved', 'cert-files/user-1/cert-1.pdf'));
    const res = await POST(uploadRequest() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('approved');

    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.prisma.userCertification.update).not.toHaveBeenCalled();
    expect(h.prisma.userCertification.updateMany).toHaveBeenCalledWith({
      where: { id: 'cert-1', status: 'approved' },
      data: { proofUrl: body.storagePath },
    });
  });

  it('never overwrites the file staff verified (WAP-220)', async () => {
    h.prisma.userCertification.findUnique.mockResolvedValue(cert('approved', 'cert-files/user-1/cert-1.pdf'));
    const res = await POST(uploadRequest() as never);
    const { storagePath } = await res.json();

    // Same extension as the verified file, yet a different object, written without upsert.
    expect(storagePath).toMatch(/^cert-files\/user-1\/cert-1-\d+\.pdf$/);
    expect(storagePath).not.toBe('cert-files/user-1/cert-1.pdf');
    const [[path, , opts]] = h.upload.mock.calls as unknown as [[string, unknown, { upsert: boolean }]];
    expect(path).toBe(storagePath);
    expect(opts.upsert).toBe(false);
  });

  it('a review change between read and write sends the file to pending review instead (WAP-220)', async () => {
    h.prisma.userCertification.findUnique.mockResolvedValue(cert('approved', 'cert-files/user-1/cert-1.pdf'));
    h.prisma.userCertification.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await POST(uploadRequest() as never);
    const body = await res.json();
    expect(body.status).toBe('pending');
    const [[args]] = h.prisma.userCertification.update.mock.calls as unknown as [[{ data: Record<string, unknown> }]];
    expect(args.data.status).toBe('pending');
    expect(args.data.proofUrl).toBe(body.storagePath);
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it('notes the new file on a verified certificate in the audit log', async () => {
    h.prisma.userCertification.findUnique.mockResolvedValue(cert('approved', 'cert-files/user-1/cert-1.png'));
    await POST(uploadRequest() as never);
    expect(h.auditLog).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      action: 'member.certification.proof_attached_verified',
      targetType: 'user_certification',
      targetId: 'cert-1',
      // The note points back at the file staff verified (WAP-220).
      metadata: { certName: 'CompTIA A+', status: 'approved', replacedProof: true, previousProofUrl: 'cert-files/user-1/cert-1.png' },
    });
    expect(h.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: 'user-1', role: 'member' },
        verb: 'update',
        object: { type: 'UserCertification', id: 'cert-1' },
        result: expect.objectContaining({
          success: true,
          extensions: expect.objectContaining({ statusKept: true, status: 'approved', previousProofUrl: 'cert-files/user-1/cert-1.png' }),
        }),
      }),
    );
  });

  it.each(['pending', 'rejected'] as const)('a %s certificate goes (back) to pending review, as before', async (status) => {
    h.prisma.userCertification.findUnique.mockResolvedValue(cert(status));
    const res = await POST(uploadRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, storagePath: 'cert-files/user-1/cert-1.pdf', status: 'pending' });

    const [[args]] = h.prisma.userCertification.update.mock.calls as unknown as [[{ where: unknown; data: Record<string, unknown> }]];
    expect(args.where).toEqual({ id: 'cert-1' });
    expect(args.data.status).toBe('pending');
    expect(args.data.proofUrl).toBe('cert-files/user-1/cert-1.pdf');
    expect(args.data.submittedAt).toBeInstanceOf(Date);
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it("a certificate name the caller doesn't own is a 404 and touches nothing", async () => {
    // The lookup is keyed on the session user, so another member's
    // certificate of the same name is never found.
    h.prisma.userCertification.findUnique.mockResolvedValue(null);
    const res = await POST(uploadRequest('Someone Elses Cert') as never);
    expect(res.status).toBe(404);
    expect(h.prisma.userCertification.findUnique).toHaveBeenCalledWith({
      where: { userId_certName: { userId: 'user-1', certName: 'Someone Elses Cert' } },
    });
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.prisma.userCertification.update).not.toHaveBeenCalled();
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it('a failed storage upload changes nothing on a verified certificate', async () => {
    h.prisma.userCertification.findUnique.mockResolvedValue(cert('approved'));
    h.upload.mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as never);
    const res = await POST(uploadRequest() as never);
    expect(res.status).toBe(500);
    expect(h.prisma.userCertification.update).not.toHaveBeenCalled();
    expect(h.prisma.userCertification.updateMany).not.toHaveBeenCalled();
    expect(h.auditLog).not.toHaveBeenCalled();
  });
});
