import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_ORG_ID } from '@/lib/tenant/organization';

// Everything here is synthetic: no real ITA, contract, approval, member or counselor.
type Row = Record<string, unknown> & { id: string };

const db = vi.hoisted(() => ({
  packets: [] as Row[],
  sends: [] as Row[],
  enrollments: [] as Array<Record<string, unknown>>,
  users: [] as Row[],
  counselor: null as null | { id: string; fullName: string; email: string },
  catalog: null as null | Record<string, unknown>,
  seq: 0,
}));

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  getSubjectOrganizationId: vi.fn(),
  send: vi.fn(),
  branding: { value: null as null | Record<string, unknown> },
}));

function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && 'in' in (cond as object)) return (cond as { in: unknown[] }).in.includes(value);
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    return (value ?? null) === (cond ?? null);
  });
}

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined), auditRequestMeta: vi.fn(() => ({})) }));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: mocks.isSuperAdmin, isAdmin: mocks.isAdmin, requireAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant/organization')>()),
  getActorOrganizationId: mocks.getActorOrganizationId,
  getSubjectOrganizationId: mocks.getSubjectOrganizationId,
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler }));
vi.mock('@/lib/email', () => ({ getResend: () => ({}) }));
vi.mock('@/lib/email/send', () => ({ sendBrandedEmailOrThrowOnSkip: mocks.send }));
vi.mock('@/lib/email/template', () => ({
  brandedEmailLayout: (a: { title: string; branding: { name: string; primaryColor: string } }) => `${a.branding.name}|${a.branding.primaryColor}|${a.title}`,
}));
vi.mock('@/lib/tenant/organizationBranding', () => ({ getOrganizationBranding: async () => mocks.branding.value }));
vi.mock('@/lib/db/prisma', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  // pg_advisory_xact_lock stand-in: waiters queue per key until the holder's transaction ends.
  const locks = new Map<string, Promise<void>>();
  const prisma: Record<string, any> = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const releases: Array<() => void> = [];
      const tx = {
        ...prisma,
        $executeRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
          const key = String(values[0]);
          const prev = locks.get(key) ?? Promise.resolve();
          let release!: () => void;
          const mine = new Promise<void>((r) => (release = r));
          locks.set(key, prev.then(() => mine));
          await prev;
          releases.push(release);
          return 1;
        },
      };
      try {
        return await fn(tx);
      } finally {
        releases.forEach((r) => r());
      }
    }),
    user: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.users.find((u) => matches(u, where)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.users.find((u) => u.id === where.id) ?? null),
    },
    courseEnrollment: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.enrollments.filter((e) => matches(e, where))),
    },
    organizationProgramCatalog: { findFirst: vi.fn(async () => db.catalog) },
    counselorAssignment: {
      findFirst: vi.fn(async () => (db.counselor ? { counselor: { user: db.counselor } } : null)),
    },
    trainingBillingPacket: {
      count: vi.fn(async ({ where }: { where: { organizationId: string } }) => db.packets.filter((p) => p.organizationId === where.organizationId).length),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.packets.find((p) => matches(p, where)) ?? null),
      findMany: vi.fn(async () => db.packets),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = db.packets.find((x) => x.id === where.id);
        if (!p) return null;
        const member = db.users.find((u) => u.id === p.memberId);
        return { ...p, member: { ...member, deletedAt: null } };
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        await tick();
        if (db.packets.some((p) => p.organizationId === data.organizationId && p.packetNumber === data.packetNumber)) throw p2002();
        const row = { sentAt: null, sentTo: [], sendCount: 0, sendAttemptNo: null, sendAttempt: null, createdAt: new Date(), updatedAt: new Date(), ...data, id: `d0000000-0000-4000-8000-${String(++db.seq).padStart(12, '0')}` };
        db.packets.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const p = db.packets.find((x) => x.id === where.id)!;
        Object.assign(p, data);
        return p;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const rows = db.packets.filter((p) => matches(p, where));
        rows.forEach((p) => Object.assign(p, data));
        return { count: rows.length };
      }),
    },
    trainingBillingPacketSend: {
      findUnique: vi.fn(async ({ where }: { where: { packetId_attemptNo_recipient: Record<string, unknown> } }) =>
        db.sends.find((s) => matches(s, where.packetId_attemptNo_recipient)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.sends.filter((s) => matches(s, where))),
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (db.sends.some((s) => s.packetId === data.packetId && s.attemptNo === data.attemptNo && s.recipient === data.recipient)) throw p2002();
        const row = { ...data, id: `send-${++db.seq}`, sentAt: null, lastError: null };
        db.sends.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const s = db.sends.find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return s;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const rows = db.sends.filter((s) => matches(s, where));
        rows.forEach((s) => Object.assign(s, data));
        return { count: rows.length };
      }),
    },
  };
  return { prisma };
});

import { POST as createPacket } from '@/app/api/admin/members/[id]/billing-packets/route';
import { POST as sendPacket } from '@/app/api/billing-packets/[packetId]/send/route';
import { GET as packetPdf } from '@/app/api/billing-packets/[packetId]/pdf/route';
import { attestationFingerprint } from '@/lib/billing/packetText';
import { IDEMPOTENCY_SAFE_RETRY_MS, sendIdempotencyKey } from '@/lib/billing/sendAttempts';

const ORG = DEFAULT_ORG_ID;
const OTHER_ORG = 'aaaaaaaa-0000-4000-8000-000000000009';
const ADMIN = 'a0000000-0000-4000-8000-000000000001';
const MEMBER = 'b0000000-0000-4000-8000-000000000002';
const COUNSELOR = { id: 'c0000000-0000-4000-8000-000000000003', fullName: 'Casey Counselor', email: 'casey@example.test' };
const SYLLABUS_PROGRAM = 'it-support-professional-certificate-ibm';
const FALLBACK_PROGRAM = 'certified-production-technician-cpt';

type Body = Record<string, unknown> & { lineItems: Array<{ description: string; hours: number | null; amount: number | null }>; fundingAttestation: Record<string, unknown> };

/** A complete sign request whose confirmations were ticked for exactly these values. */
function body(overrides: Partial<Body> = {}, opts: { staleFingerprint?: boolean } = {}): Body {
  const b: Body = {
    programSlug: SYLLABUS_PROGRAM,
    invoiceDate: '2026-09-25',
    dueDate: '2026-10-25',
    billToName: 'Test Board',
    billToAttention: 'Accounts Payable',
    billToAddress: '',
    billToEmail: '',
    referenceNumber: 'REF-1',
    lineItems: [
      { description: 'Intro to IT', hours: 10, amount: 1000.5 },
      { description: 'Exam voucher', hours: null, amount: 299.5 },
    ],
    coverLetterBody: 'Please find enclosed the training invoice for the participant named above.',
    signerName: 'Test Signer',
    signerTitle: 'Test Title',
    signatureTyped: true,
    j6FactsReviewed: true,
    ...overrides,
    fundingAttestation: {
      fundingBasis: 'wioa_ita',
      approvedAmount: 1300,
      reference: 'TEST-ITA-0001',
      exceptionNote: '',
      reviewed: true,
      tuitionMatches: true,
      ...(overrides.fundingAttestation ?? {}),
    },
  };
  const f = b.fundingAttestation;
  const fp = attestationFingerprint({
    programSlug: b.programSlug as string,
    invoiceDate: b.invoiceDate as string,
    dueDate: (b.dueDate as string) ?? null,
    billToName: b.billToName as string,
    referenceNumber: b.referenceNumber as string,
    lineItems: b.lineItems,
    fundingBasis: f.fundingBasis as string,
    approvedAmount: f.approvedAmount as number,
    fundingReference: f.reference as string,
    exceptionNote: (f.exceptionNote as string) ?? '',
  });
  b.reviewedFingerprint = opts.staleFingerprint ? attestationFingerprint({ programSlug: 'stale', invoiceDate: '', dueDate: null, billToName: '', referenceNumber: '', lineItems: [], fundingBasis: '', approvedAmount: null, fundingReference: '', exceptionNote: '' }) : fp;
  return b;
}

function req(payload: unknown) {
  return new Request('http://localhost/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const packetParams = (packetId: string) => ({ params: Promise.resolve({ packetId }) });
const studentSends = () => mocks.send.mock.calls.filter((c) => c[1].to === 'member@example.test');

async function signOne(overrides: Partial<Body> = {}) {
  const res = await createPacket(req(body(overrides)), params(MEMBER));
  expect(res.status).toBe(201);
  return (await res.json()).packet.id as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.packets = [];
  db.sends = [];
  db.seq = 0;
  db.catalog = null;
  db.counselor = null;
  db.users = [
    { id: MEMBER, fullName: 'Test Member', email: 'member@example.test', organizationId: ORG, deletedAt: null, enrolledProgram: null },
    { id: ADMIN, fullName: 'Test Admin', email: 'admin@example.test', organizationId: ORG, deletedAt: null, enrolledProgram: null },
  ];
  db.enrollments = [
    { userId: MEMBER, organizationId: ORG, programSlug: SYLLABUS_PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: true },
    { userId: MEMBER, organizationId: ORG, programSlug: FALLBACK_PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: false },
  ];
  mocks.getUser.mockResolvedValue({ id: ADMIN });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.getSubjectOrganizationId.mockResolvedValue(ORG);
  mocks.send.mockResolvedValue({ data: { id: 'msg' }, error: null });
  mocks.branding.value = { orgId: ORG, name: 'Brand At Attempt', logoUrl: 'https://x.test/l.png', primaryColor: '#111111', supportEmail: 's@x.test', domain: 'https://x.test', domainLabel: 'x.test' };
  delete process.env.BILLING_PACKET_PROVIDER_ORG_ID;
  delete process.env.EMAIL_FROM;
});

describe('POST /api/admin/members/[id]/billing-packets (sign)', () => {
  it('signs with a frozen snapshot of identity, recipients, facts and the staff attestation', async () => {
    db.counselor = COUNSELOR;
    const res = await createPacket(req(body()), params(MEMBER));
    expect(res.status).toBe(201);
    const row = db.packets[0];
    expect(row.packetNumber).toBe('WAP-2026-0001');
    expect(row.totalAmount).toBe(1300);
    expect(row.fundingAttestationKey).toBe('wioa_ita:test-ita-0001');
    const snap = row.signedSnapshot as Record<string, any>;
    expect(snap.member).toEqual({ fullName: 'Test Member', email: 'member@example.test' });
    expect(snap.counselor).toEqual({ userId: COUNSELOR.id, fullName: COUNSELOR.fullName, email: COUNSELOR.email });
    expect(snap.logo.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(snap.fundingAttestation).toMatchObject({ fundingBasis: 'wioa_ita', approvedAmount: 1300, reference: 'TEST-ITA-0001', reviewed: true, tuitionMatches: true, staffNotedExceptionUnverified: null });
    expect(snap.j6.facts).toContain('1. Intro to IT (10 contact hours): $1,000.50');
    expect(snap.j6.facts).toContain('Total due: $1,300.00');
    expect(snap.j6.narrative).toBe('Please find enclosed the training invoice for the participant named above.');
  });

  it('edited-then-sign: the J6 facts are generated from the rows being signed, whatever the narrative says', async () => {
    const edited = [
      { description: 'Intro to IT', hours: 10, amount: 1000 },
      { description: 'Exam voucher', hours: null, amount: 300 },
    ];
    const res = await createPacket(req(body({ lineItems: edited, coverLetterBody: 'Old narrative that says the total is $1,000.00.' })), params(MEMBER));
    expect(res.status).toBe(201);
    const snap = db.packets[0].signedSnapshot as Record<string, any>;
    expect(snap.j6.facts).toContain('Total due: $1,300.00');
    expect(snap.j6.facts).toContain('2. Exam voucher: $300.00');
    expect(db.packets[0].totalAmount).toBe(1300);
  });

  it('refuses a stale attestation: values edited after the boxes were ticked', async () => {
    const res = await createPacket(req(body({}, { staleFingerprint: true })), params(MEMBER));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('stale_attestation');
    expect(db.packets).toHaveLength(0);
  });

  it('refuses missing or unticked attestation and J6 facts review', async () => {
    const { fundingAttestation: _omit, ...noAttestation } = body();
    expect((await createPacket(req(noAttestation), params(MEMBER))).status).toBe(400);
    expect((await createPacket(req(body({ fundingAttestation: { reviewed: false } })), params(MEMBER))).status).toBe(400);
    expect((await createPacket(req(body({ fundingAttestation: { tuitionMatches: false } })), params(MEMBER))).status).toBe(400);
    expect((await createPacket(req(body({ j6FactsReviewed: false })), params(MEMBER))).status).toBe(400);
    expect(db.packets).toHaveLength(0);
  });

  it('no catalog or syllabus price: an empty or zero tuition row is refused, an entered and attested amount signs', async () => {
    const rows = [{ description: 'Tuition', hours: null, amount: null as number | null }];
    expect((await createPacket(req(body({ programSlug: FALLBACK_PROGRAM, lineItems: rows })), params(MEMBER))).status).toBe(400);
    const zero = await createPacket(req(body({ programSlug: FALLBACK_PROGRAM, lineItems: [{ description: 'Tuition', hours: null, amount: 0 }, { description: 'Fee', hours: null, amount: 50 }], fundingAttestation: { approvedAmount: 50 } })), params(MEMBER));
    expect(zero.status).toBe(400);
    expect((await zero.json()).error).toMatch(/Enter the approved tuition/);
    const ok = await createPacket(req(body({ programSlug: FALLBACK_PROGRAM, lineItems: [{ description: 'Tuition', hours: null, amount: 4000 }], fundingAttestation: { approvedAmount: 4000 } })), params(MEMBER));
    expect(ok.status).toBe(201);
    expect((db.packets[0].signedSnapshot as Record<string, any>).pricing).toEqual({ source: 'price_list_default', priceListMaximum: 7500 });
  });

  it('refuses a total above the approved amount the signer recorded', async () => {
    const res = await createPacket(req(body({ fundingAttestation: { approvedAmount: 1000 } })), params(MEMBER));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/more than the approved amount/);
  });

  it('WIOA ITA above $7,500 is a non-blocking warning, not a global cap; the exception note is recorded as unverified', async () => {
    const big = [{ description: 'Intro to IT', hours: 10, amount: 9000 }];
    const res = await createPacket(req(body({ lineItems: big, fundingAttestation: { approvedAmount: 9000, exceptionNote: 'Staff note TEST-1' } })), params(MEMBER));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.warnings[0]).toMatch(/Capital Area Board's standard ITA amount/);
    const snap = db.packets[0].signedSnapshot as Record<string, any>;
    expect(snap.fundingAttestation.staffNotedExceptionUnverified).toBe('Staff note TEST-1');
    expect(snap.warnings).toHaveLength(1);
    const contract = await createPacket(req(body({ lineItems: big, fundingAttestation: { fundingBasis: 'separate_contract', approvedAmount: 9000, reference: 'TEST-CONTRACT-1' } })), params(MEMBER));
    expect(contract.status).toBe(201);
    expect((await contract.json()).warnings).toEqual([]);
  });

  it('one signed packet per member + approval: case/whitespace variants are refused', async () => {
    await signOne();
    for (const reference of ['TEST-ITA-0001', ' test-ita-0001 ', 'Test-ITA-0001', 'TEST-ITA-0001  ']) {
      const res = await createPacket(req(body({ fundingAttestation: { reference } })), params(MEMBER));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/Repeat or installment billing for the same member and approval is not supported/);
    }
    expect(db.packets).toHaveLength(1);
  });

  it('the same member with a different reference or basis is allowed', async () => {
    await signOne();
    await signOne({ fundingAttestation: { reference: 'TEST-ITA-0002' } });
    await signOne({ fundingAttestation: { fundingBasis: 'separate_contract' } });
    expect(db.packets).toHaveLength(3);
  });

  it('different members may share a cohort contract reference', async () => {
    const OTHER_MEMBER = 'b0000000-0000-4000-8000-000000000077';
    db.users.push({ id: OTHER_MEMBER, fullName: 'Other Member', email: 'other@example.test', organizationId: ORG, deletedAt: null, enrolledProgram: null });
    db.enrollments.push({ userId: OTHER_MEMBER, organizationId: ORG, programSlug: SYLLABUS_PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: true });
    const contract = { fundingAttestation: { fundingBasis: 'separate_contract', reference: 'TEST-COHORT-PO-1' } };
    await signOne(contract);
    const res = await createPacket(req(body(contract)), params(OTHER_MEMBER));
    expect(res.status).toBe(201);
  });

  it('concurrent signs for the same member + approval: exactly one succeeds', async () => {
    const [a, b] = await Promise.all([createPacket(req(body()), params(MEMBER)), createPacket(req(body()), params(MEMBER))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(db.packets).toHaveLength(1);
  });

  describe('enrollment', () => {
    it('refuses a program the member is not enrolled in', async () => {
      const res = await createPacket(req(body({ programSlug: 'data-analytics-professional-certificate-google' })), params(MEMBER));
      expect(res.status).toBe(422);
    });

    it('accepts an alias of an enrolled program and a completed enrollment (no status on CourseEnrollment)', async () => {
      db.enrollments = [{ userId: MEMBER, organizationId: ORG, programSlug: 'production-technology-certificate-cpt', curriculumVersion: 'legacy-v1', isPrimary: true, completedAt: new Date() }];
      const res = await createPacket(req(body({ programSlug: FALLBACK_PROGRAM, lineItems: [{ description: 'Tuition', hours: null, amount: 1300 }] })), params(MEMBER));
      expect(res.status).toBe(201);
      expect(db.packets[0].programSlug).toBe(FALLBACK_PROGRAM);
    });

    it('refuses a non-enrolled alias', async () => {
      const res = await createPacket(req(body({ programSlug: 'logistics-and-supply-chain-certificate-clt' })), params(MEMBER));
      expect(res.status).toBe(422);
    });

    it('uses the legacy enrolledProgram only when there are no enrollment rows', async () => {
      db.users[0].enrolledProgram = 'data-analytics-professional-certificate-google';
      const stale = await createPacket(req(body({ programSlug: 'data-analytics-professional-certificate-google' })), params(MEMBER));
      expect(stale.status).toBe(422);
      db.enrollments = [];
      const legacy = await createPacket(req(body({ programSlug: 'data-analytics-professional-certificate-google' })), params(MEMBER));
      expect(legacy.status).toBe(201);
    });

    it('ignores an enrollment row from another org', async () => {
      db.enrollments = [{ userId: MEMBER, organizationId: OTHER_ORG, programSlug: SYLLABUS_PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: true }];
      const res = await createPacket(req(body()), params(MEMBER));
      expect(res.status).toBe(422);
    });
  });

  describe('provider org guard', () => {
    it('refuses an admin whose session org is another org (403) and creates nothing', async () => {
      mocks.getActorOrganizationId.mockResolvedValue(OTHER_ORG);
      mocks.getSubjectOrganizationId.mockResolvedValue(OTHER_ORG);
      db.users[0].organizationId = OTHER_ORG;
      const res = await createPacket(req(body()), params(MEMBER));
      expect(res.status).toBe(403);
      expect(db.packets).toHaveLength(0);
    });

    it('refuses a super-admin issuing for another org’s member', async () => {
      mocks.isSuperAdmin.mockResolvedValue(true);
      mocks.getSubjectOrganizationId.mockResolvedValue(OTHER_ORG);
      db.users[0].organizationId = OTHER_ORG;
      const res = await createPacket(req(body()), params(MEMBER));
      expect(res.status).toBe(403);
    });

    it('honors a valid override and fails closed (503) on an invalid one', async () => {
      process.env.BILLING_PACKET_PROVIDER_ORG_ID = OTHER_ORG;
      expect((await createPacket(req(body()), params(MEMBER))).status).toBe(403);
      process.env.BILLING_PACKET_PROVIDER_ORG_ID = 'nope';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect((await createPacket(req(body()), params(MEMBER))).status).toBe(503);
      spy.mockRestore();
      expect(db.packets).toHaveLength(0);
    });
  });
});

describe('POST /api/billing-packets/[packetId]/send', () => {
  it('sends student then counselor from the snapshot with attempt-scoped idempotency keys, then marks sent', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    const res = await sendPacket(req({}), packetParams(id));
    expect(res.status).toBe(200);
    expect(mocks.send.mock.calls.map((c) => [c[1].to, c[1].idempotencyKey])).toEqual([
      ['member@example.test', sendIdempotencyKey(id, 1, 'student')],
      [COUNSELOR.email, sendIdempotencyKey(id, 1, 'counselor')],
    ]);
    expect(mocks.send.mock.calls[1][1].cc).toBe('admin@example.test');
    expect(db.packets[0]).toMatchObject({ status: 'sent', sendCount: 1, sendAttemptNo: 1 });
  });

  it('uses the frozen recipients even after the member record changes', async () => {
    const id = await signOne();
    db.users[0].email = 'changed@example.test';
    db.users[0].fullName = 'Changed Name';
    await sendPacket(req({}), packetParams(id));
    expect(mocks.send.mock.calls[0][1].to).toBe('member@example.test');
  });

  it('concurrent sends: exactly one student email', async () => {
    const id = await signOne();
    const results = await Promise.all([sendPacket(req({}), packetParams(id)), sendPacket(req({}), packetParams(id))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(studentSends()).toHaveLength(1);
  });

  it('counselor failure: stays signed, student recorded; the retry reuses the same keys and payload and sends only the counselor copy', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    mocks.send.mockImplementation(async (_r: unknown, a: { to: string }) => {
      if (a.to === COUNSELOR.email) throw new Error('provider down');
      return { data: { id: 'x' }, error: null };
    });
    const first = await sendPacket(req({}), packetParams(id));
    expect(first.status).toBe(502);
    expect((await first.json()).error).toMatch(/student copy was sent, but the counselor copy failed/);
    expect(db.packets[0].status).toBe('signed');
    const failedCounselorPayload = mocks.send.mock.calls[1][1];

    mocks.send.mockResolvedValue({ data: { id: 'y' }, error: null });
    // A different admin retries after branding and EMAIL_FROM changed: frozen values still apply.
    mocks.branding.value = { ...mocks.branding.value, name: 'Brand Changed Later', primaryColor: '#999999' };
    process.env.EMAIL_FROM = 'changed@example.test';
    mocks.getUser.mockResolvedValue({ id: ADMIN });
    const retry = await sendPacket(req({}), packetParams(id));
    expect(retry.status).toBe(200);
    expect(studentSends()).toHaveLength(1);
    const retried = mocks.send.mock.calls[2][1];
    expect(retried.idempotencyKey).toBe(sendIdempotencyKey(id, 1, 'counselor'));
    expect(retried).toEqual(failedCounselorPayload);
    expect(retried.html).toContain('Brand At Attempt');
    expect(db.packets[0].status).toBe('sent');
  });

  it('student failure: nothing goes to the counselor', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(new Error('bounced'));
    const res = await sendPacket(req({}), packetParams(id));
    expect(res.status).toBe(502);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('a Resend 409 (key reused with a changed payload) becomes needs_reconciliation, with no new key and no further send', async () => {
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(Object.assign(new Error('Same idempotency key used with a different payload'), { providerErrorName: 'invalid_idempotent_request' }));
    const res = await sendPacket(req({}), packetParams(id));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('needs_reconciliation');
    expect(db.sends[0].status).toBe('needs_reconciliation');
    const again = await sendPacket(req({}), packetParams(id));
    expect(again.status).toBe(409);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    // Operator checked the provider and marks it delivered.
    const reconciled = await sendPacket(req({ action: 'mark_delivered', recipient: 'student' }), packetParams(id));
    expect(reconciled.status).toBe(200);
    expect(db.packets[0].status).toBe('sent');
  });

  it('an unconfirmed claim older than the idempotency window blocks automatic retry', async () => {
    const id = await signOne();
    mocks.send.mockImplementationOnce(() => new Promise(() => {})); // simulate a crash mid-send
    void sendPacket(req({}), packetParams(id));
    await new Promise((r) => setTimeout(r, 10));
    const claim = db.sends[0];
    claim.claimedAt = new Date(Date.now() - IDEMPOTENCY_SAFE_RETRY_MS - 1000);
    claim.lastClaimedAt = claim.claimedAt;
    const res = await sendPacket(req({}), packetParams(id));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('needs_reconciliation');
    expect(studentSends()).toHaveLength(1);
  });

  it('a crash after a claim within the window: the retry reuses the same key', async () => {
    const id = await signOne();
    mocks.send.mockImplementationOnce(() => new Promise(() => {}));
    void sendPacket(req({}), packetParams(id));
    await new Promise((r) => setTimeout(r, 10));
    db.sends[0].lastClaimedAt = new Date(Date.now() - 10 * 60 * 1000);
    const res = await sendPacket(req({}), packetParams(id));
    expect(res.status).toBe(200);
    expect(mocks.send.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([sendIdempotencyKey(id, 1, 'student'), sendIdempotencyKey(id, 1, 'student')]);
  });

  it('"Email again" after completion starts a new attempt with new keys; a plain press does not resend', async () => {
    const id = await signOne();
    await sendPacket(req({}), packetParams(id));
    // A plain press on a completed attempt is a no-op: nothing is re-sent.
    expect((await sendPacket(req({}), packetParams(id))).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const again = await sendPacket(req({ action: 'email_again' }), packetParams(id));
    expect(again.status).toBe(200);
    expect(mocks.send.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([sendIdempotencyKey(id, 1, 'student'), sendIdempotencyKey(id, 2, 'student')]);
    expect(db.packets[0].sendCount).toBe(2);
  });

  describe('cc drift', () => {
    it('refuses when a counselor was assigned after signing', async () => {
      const id = await signOne();
      db.counselor = COUNSELOR;
      const res = await sendPacket(req({}), packetParams(id));
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('counselor_changed');
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('refuses when the counselor changed after signing', async () => {
      db.counselor = COUNSELOR;
      const id = await signOne();
      db.counselor = { ...COUNSELOR, id: 'c0000000-0000-4000-8000-000000000099', email: 'other@example.test' };
      expect((await sendPacket(req({}), packetParams(id))).status).toBe(409);
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('refuses when the counselor was removed after signing', async () => {
      db.counselor = COUNSELOR;
      const id = await signOne();
      db.counselor = null;
      expect((await sendPacket(req({}), packetParams(id))).status).toBe(409);
      expect(mocks.send).not.toHaveBeenCalled();
    });
  });

  it('a corrupt snapshot is refused (409) and nothing is sent; a legacy packet cannot be emailed', async () => {
    const id = await signOne();
    db.packets[0].signedSnapshot = { version: 1, provider: {} };
    const res = await sendPacket(req({}), packetParams(id));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('snapshot_corrupt');
    db.packets[0].signedSnapshot = null;
    expect((await sendPacket(req({}), packetParams(id))).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('refuses an admin from another org (403) without sending', async () => {
    const id = await signOne();
    mocks.getActorOrganizationId.mockResolvedValue(OTHER_ORG);
    mocks.isSuperAdmin.mockResolvedValue(true);
    expect((await sendPacket(req({}), packetParams(id))).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('is admin-only: a counselor cannot trigger the send', async () => {
    const id = await signOne();
    mocks.isAdmin.mockResolvedValue(false);
    expect((await sendPacket(req({}), packetParams(id))).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('GET /api/billing-packets/[packetId]/pdf', () => {
  it('lets the member download their own J6; a corrupt snapshot is a 409, never a live re-render', async () => {
    const id = await signOne();
    mocks.isAdmin.mockResolvedValue(false);
    mocks.getUser.mockResolvedValue({ id: MEMBER });
    const ok = await packetPdf(new Request(`http://localhost/api/billing-packets/${id}/pdf?doc=j6&download=1`), packetParams(id));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('application/pdf');
    expect(Buffer.from(new Uint8Array(await ok.arrayBuffer()).slice(0, 5)).toString()).toBe('%PDF-');
    db.packets[0].signedSnapshot = { version: 1 };
    const bad = await packetPdf(new Request(`http://localhost/api/billing-packets/${id}/pdf?doc=j6`), packetParams(id));
    expect(bad.status).toBe(409);
  });

  it('serves both documents as one attachment for doc=both', async () => {
    const id = await signOne();
    const res = await packetPdf(new Request(`http://localhost/api/billing-packets/${id}/pdf?doc=both`), packetParams(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="J5-J6-invoice-packet-WAP-2026-0001-test-member.pdf"');
  });
});
