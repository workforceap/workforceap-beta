import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  getSubjectOrganizationId: vi.fn(),
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  catalogFindFirst: vi.fn(),
  packetCount: vi.fn(),
  packetCreate: vi.fn(),
  packetFindMany: vi.fn(),
  packetFindUnique: vi.fn(),
  packetUpdate: vi.fn(),
  assignmentFindFirst: vi.fn(),
  sendBillingPacketEmails: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
  auditRequestMeta: vi.fn(() => ({})),
}));
vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: mocks.requireAdmin,
  isSuperAdmin: mocks.isSuperAdmin,
  isAdmin: mocks.isAdmin,
}));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: mocks.getActorOrganizationId,
  getSubjectOrganizationId: mocks.getSubjectOrganizationId,
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    $transaction: vi.fn(async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]))),
    user: { findFirst: mocks.userFindFirst, findUnique: mocks.userFindUnique },
    organizationProgramCatalog: { findFirst: mocks.catalogFindFirst },
    trainingBillingPacket: {
      count: mocks.packetCount,
      create: mocks.packetCreate,
      findMany: mocks.packetFindMany,
      findUnique: mocks.packetFindUnique,
      update: mocks.packetUpdate,
    },
    counselorAssignment: { findFirst: mocks.assignmentFindFirst },
  };
  return { prisma };
});
vi.mock('@/lib/billing/sendPacket', () => ({ sendBillingPacketEmails: mocks.sendBillingPacketEmails }));

import { POST as createPacket, GET as listPackets } from '@/app/api/admin/members/[id]/billing-packets/route';
import { POST as sendPacket } from '@/app/api/billing-packets/[packetId]/send/route';
import { GET as packetPdf } from '@/app/api/billing-packets/[packetId]/pdf/route';

const ADMIN = 'a0000000-0000-4000-8000-000000000001';
const MEMBER = 'b0000000-0000-4000-8000-000000000002';
const COUNSELOR = 'c0000000-0000-4000-8000-000000000003';
const PACKET = 'd0000000-0000-4000-8000-000000000004';
const ORG = '00000000-0000-4000-8000-000000000001';

const validBody = {
  programSlug: 'it-support-and-entry-level-cyber-security-certificate',
  invoiceDate: '2026-09-04',
  dueDate: '2026-10-04',
  billToName: 'Workforce Solutions Capital Area',
  billToAttention: 'Accounts Payable',
  billToAddress: '',
  billToEmail: '',
  referenceNumber: 'ITA-1',
  lineItems: [
    { description: 'Intro to IT', hours: 10, amount: 1000.5 },
    { description: 'Exam voucher', hours: null, amount: 299.5 },
  ],
  coverLetterBody: 'Please find enclosed the training invoice for the participant named above.',
  signerName: 'Michael A. Brown, PMP, ChE',
  signerTitle: 'Executive Director',
  signatureTyped: true,
};

const packetRow = {
  id: PACKET,
  organizationId: ORG,
  memberId: MEMBER,
  programSlug: 'it-support-and-entry-level-cyber-security-certificate',
  packetNumber: 'WAP-2026-0001',
  status: 'signed',
  invoiceDate: new Date('2026-09-04T00:00:00Z'),
  dueDate: null,
  billToName: 'Board',
  billToAttention: null,
  billToAddress: null,
  billToEmail: null,
  referenceNumber: null,
  lineItems: [{ description: 'Intro to IT', hours: 10, amount: 1300 }],
  totalAmount: 1300,
  coverLetterBody: 'Body',
  signerName: 'Michael A. Brown',
  signerTitle: 'Executive Director',
  signatureImage: null,
  signedAt: new Date('2026-09-04T01:00:00Z'),
  signedById: ADMIN,
  sentAt: null,
  sentTo: [] as string[],
  sendCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  member: { id: MEMBER, fullName: 'Tarrance Hopkins', email: 'tarrance@example.com', organizationId: ORG, deletedAt: null },
};

function req(body: unknown, url = 'http://localhost/api/x') {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const packetParams = (packetId: string) => ({ params: Promise.resolve({ packetId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: ADMIN });
  mocks.requireAdmin.mockResolvedValue(undefined);
  mocks.isAdmin.mockResolvedValue(true);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.getSubjectOrganizationId.mockResolvedValue(ORG);
  mocks.userFindFirst.mockResolvedValue({ id: MEMBER, fullName: 'Tarrance Hopkins', email: 'tarrance@example.com', organizationId: ORG });
  mocks.packetCount.mockResolvedValue(6);
  mocks.packetCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...packetRow, ...data, id: PACKET }));
});

describe('POST /api/admin/members/[id]/billing-packets', () => {
  it('creates a signed packet with a per-year invoice number and the summed total', async () => {
    const res = await createPacket(req(validBody), params(MEMBER));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.packet.packetNumber).toBe('WAP-2026-0007');
    expect(body.packet.totalAmount).toBe(1300);
    expect(body.packet.status).toBe('signed');
    expect(body.packet.programTitle).toMatch(/IT Support/);
    const data = mocks.packetCreate.mock.calls[0][0].data;
    expect(data.signedById).toBe(ADMIN);
    expect(data.signatureImage).toBeNull();
    expect(data.invoiceDate).toEqual(new Date('2026-09-04T00:00:00.000Z'));
    expect(data.billToAttention).toBe('Accounts Payable');
    expect(data.billToAddress).toBeNull();
  });

  it('rejects an unsigned packet', async () => {
    const res = await createPacket(req({ ...validBody, signatureTyped: false }), params(MEMBER));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Sign the documents/);
    expect(mocks.packetCreate).not.toHaveBeenCalled();
  });

  it('refuses an org admin acting on another tenant', async () => {
    mocks.getSubjectOrganizationId.mockResolvedValue('other-org');
    const res = await createPacket(req(validBody), params(MEMBER));
    expect(res.status).toBe(404);
  });

  it('requires a sign-in', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await createPacket(req(validBody), params(MEMBER));
    expect(res.status).toBe(401);
  });

  it('lists packets newest first', async () => {
    mocks.packetFindMany.mockResolvedValue([packetRow]);
    const res = await listPackets(new Request('http://localhost/api/x'), params(MEMBER));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packets).toHaveLength(1);
    expect(body.packets[0].lineItems).toEqual([{ description: 'Intro to IT', hours: 10, amount: 1300 }]);
    expect(body.packets[0].invoiceDate).toBe('2026-09-04');
  });
});

describe('POST /api/billing-packets/[packetId]/send', () => {
  it('emails the student and the assigned counselor, then marks the packet sent', async () => {
    mocks.packetFindUnique.mockResolvedValue(packetRow);
    mocks.assignmentFindFirst.mockResolvedValue({
      counselor: { user: { id: COUNSELOR, fullName: 'Casey Counselor', email: 'casey@example.org' } },
    });
    mocks.userFindUnique.mockResolvedValue({ email: 'admin@workforceap.org' });
    mocks.sendBillingPacketEmails.mockResolvedValue({
      sentTo: ['tarrance@example.com', 'casey@example.org', 'admin@workforceap.org'],
      counselor: { fullName: 'Casey Counselor', email: 'casey@example.org' },
      studentSent: true,
      counselorSent: true,
      errors: [],
    });
    mocks.packetUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...packetRow,
      status: data.status,
      sentAt: new Date(),
      sentTo: data.sentTo,
      sendCount: 1,
    }));

    const res = await sendPacket(req({}), packetParams(PACKET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counselorMissing).toBe(false);
    expect(body.sentTo).toEqual(['tarrance@example.com', 'casey@example.org', 'admin@workforceap.org']);
    expect(body.packet.status).toBe('sent');
    const sendArgs = mocks.sendBillingPacketEmails.mock.calls[0][0];
    expect(sendArgs.counselor.email).toBe('casey@example.org');
    expect(sendArgs.ccEmail).toBe('admin@workforceap.org');
    expect(mocks.packetUpdate.mock.calls[0][0].data.sendCount).toEqual({ increment: 1 });
  });

  it('reports a missing counselor and still sends to the student', async () => {
    mocks.packetFindUnique.mockResolvedValue(packetRow);
    mocks.assignmentFindFirst.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({ email: 'admin@workforceap.org' });
    mocks.sendBillingPacketEmails.mockResolvedValue({ sentTo: ['tarrance@example.com'], counselor: null, studentSent: true, counselorSent: false, errors: [] });
    mocks.packetUpdate.mockResolvedValue({ ...packetRow, status: 'sent', sentAt: new Date(), sentTo: ['tarrance@example.com'], sendCount: 1 });

    const res = await sendPacket(req({}), packetParams(PACKET));
    expect(res.status).toBe(200);
    expect((await res.json()).counselorMissing).toBe(true);
  });

  it('is admin-only: a counselor cannot trigger the send', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    mocks.packetFindUnique.mockResolvedValue(packetRow);
    const res = await sendPacket(req({}), packetParams(PACKET));
    expect(res.status).toBe(403);
    expect(mocks.sendBillingPacketEmails).not.toHaveBeenCalled();
  });

  it('returns 502 when nothing could be delivered', async () => {
    mocks.packetFindUnique.mockResolvedValue(packetRow);
    mocks.assignmentFindFirst.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({ email: 'admin@workforceap.org' });
    mocks.sendBillingPacketEmails.mockResolvedValue({ sentTo: [], counselor: null, studentSent: false, counselorSent: false, errors: ['Email is not configured (RESEND_API_KEY missing).'] });
    const res = await sendPacket(req({}), packetParams(PACKET));
    expect(res.status).toBe(502);
    expect(mocks.packetUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /api/billing-packets/[packetId]/pdf', () => {
  it('lets the member download their own J6 as a PDF', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    mocks.getUser.mockResolvedValue({ id: MEMBER });
    mocks.packetFindUnique.mockResolvedValue(packetRow);
    const res = await packetPdf(new Request(`http://localhost/api/billing-packets/${PACKET}/pdf?doc=j6&download=1`), packetParams(PACKET));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="J6-cover-letter-WAP-2026-0001-tarrance-hopkins.pdf"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('serves both documents as one attachment for doc=both', async () => {
    mocks.packetFindUnique.mockResolvedValue(packetRow);
    const res = await packetPdf(new Request(`http://localhost/api/billing-packets/${PACKET}/pdf?doc=both`), packetParams(PACKET));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="J5-J6-invoice-packet-WAP-2026-0001-tarrance-hopkins.pdf"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('lets the assigned counselor view it and hides it from anyone else', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    mocks.getUser.mockResolvedValue({ id: COUNSELOR });
    mocks.packetFindUnique.mockResolvedValue(packetRow);
    mocks.assignmentFindFirst.mockResolvedValue({ id: 'assignment' });
    const ok = await packetPdf(new Request(`http://localhost/api/billing-packets/${PACKET}/pdf?doc=j5`), packetParams(PACKET));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Disposition')).toContain('inline');

    mocks.assignmentFindFirst.mockResolvedValue(null);
    const denied = await packetPdf(new Request(`http://localhost/api/billing-packets/${PACKET}/pdf?doc=j5`), packetParams(PACKET));
    expect(denied.status).toBe(404);
  });
});
