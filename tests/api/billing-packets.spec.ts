import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_ORG_ID } from '@/lib/tenant/organization';

// Everything here is synthetic: no real ITA, contract, approval, member or counselor.
type Row = Record<string, unknown> & { id: string };

const db = vi.hoisted(() => ({
  packets: [] as Row[],
  sends: [] as Row[],
  enrollments: [] as Array<Record<string, unknown>>,
  users: [] as Row[],
  counselor: null as null | { id: string; fullName: string; email: string; organizationId?: string; deletedAt?: Date | null },
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
  /** Test gates: when set, the route waits here (before starting an attempt / before claiming). */
  brandingGate: { value: null as null | Promise<unknown> },
  buildGate: { value: null as null | Promise<unknown> },
  /** Test hook: runs once right after the next send-row findUnique (simulates a concurrent write in the gap). */
  afterSendRead: { value: null as null | (() => void) },
  /** Test hook: runs once right after the next send-row findMany. */
  afterSendFindMany: { value: null as null | (() => void) },
  /** Ordered log of send-row creates and provider-result writes. */
  trace: [] as string[],
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
vi.mock('@/lib/email/send', () => ({ sendBrandedEmailOrThrowOnSkip: mocks.send, FixtureRecipientSkippedError: class extends Error {} }));
vi.mock('@/lib/email/template', () => ({
  brandedEmailLayout: (a: { title: string; branding: { name: string; primaryColor: string } }) => `${a.branding.name}|${a.branding.primaryColor}|${a.title}`,
}));
vi.mock('@/lib/tenant/organizationBranding', () => ({
  getOrganizationBranding: async () => {
    if (mocks.brandingGate.value) await mocks.brandingGate.value;
    return mocks.branding.value;
  },
}));
vi.mock('@/lib/billing/sendPacket', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/billing/sendPacket')>();
  return {
    ...real,
    buildPacketEmail: async (...args: Parameters<typeof real.buildPacketEmail>) => {
      if (mocks.buildGate.value) await mocks.buildGate.value;
      return real.buildPacketEmail(...args);
    },
  };
});
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
      // Honors the read-time counselor guards: same org as asked, not deleted.
      findFirst: vi.fn(async ({ where }: { where?: { counselor?: { user?: { organizationId?: string; deletedAt?: null } } } } = {}) => {
        const c = db.counselor;
        if (!c) return null;
        const u = where?.counselor?.user;
        if (u?.organizationId !== undefined && c.organizationId !== undefined && c.organizationId !== u.organizationId) return null;
        if (u && 'deletedAt' in u && c.deletedAt) return null;
        return { counselor: { user: c } };
      }),
    },
    trainingBillingPacket: {
      count: vi.fn(async ({ where }: { where: { organizationId: string } }) => db.packets.filter((p) => p.organizationId === where.organizationId).length),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.packets.find((p) => matches(p, where)) ?? null),
      findMany: vi.fn(async (args: { include?: { sends?: { where?: { recipient?: string } } | boolean } } = {}) =>
        db.packets.map((p) => {
          const only = typeof args.include?.sends === 'object' ? args.include.sends.where?.recipient : undefined;
          return { ...p, sends: db.sends.filter((x) => x.packetId === p.id && (!only || x.recipient === only)).map((x) => ({ ...x })) };
        })),
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: Record<string, unknown> }) => {
        const p = db.packets.find((x) => x.id === where.id);
        if (!p) return null;
        const member = db.users.find((u) => u.id === p.memberId);
        return { ...p, member: { ...member, deletedAt: null }, ...(include?.sends ? { sends: db.sends.filter((x) => x.packetId === p.id) } : {}) };
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
      // Copies, like a real client: callers must not see later writes through a returned object.
      findUnique: vi.fn(async ({ where }: { where: { id?: string; packetId_attemptNo_recipient?: Record<string, unknown> } }) => {
        const row = db.sends.find((s) => (where.id ? s.id === where.id : matches(s, where.packetId_attemptNo_recipient ?? {})));
        const copy = row ? { ...row } : null;
        const hook = mocks.afterSendRead.value;
        if (hook) {
          mocks.afterSendRead.value = null;
          hook();
        }
        return copy;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = db.sends.filter((s) => matches(s, where)).map((s) => ({ ...s }));
        const hook = mocks.afterSendFindMany.value;
        if (hook) {
          mocks.afterSendFindMany.value = null;
          hook();
        }
        return rows;
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        mocks.trace.push(`create:${data.attemptNo}:${data.recipient}`);
        if (db.sends.some((s) => s.packetId === data.packetId && s.attemptNo === data.attemptNo && s.recipient === data.recipient)) throw p2002();
        const row = { ...data, id: `send-${++db.seq}`, sentAt: null, lastError: null };
        db.sends.push(row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
        const s = db.sends.find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return s;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Row }) => {
        const rows = db.sends.filter((s) => matches(s, where));
        if (data.providerResultAt && rows.length) mocks.trace.push('provider_result');
        rows.forEach((s) => Object.assign(s, data));
        return { count: rows.length };
      }),
    },
  };
  return { prisma };
});

import { GET as listAdminPackets, POST as createPacket } from '@/app/api/admin/members/[id]/billing-packets/route';
import { POST as sendPacket } from '@/app/api/billing-packets/[packetId]/send/route';
import { GET as packetPdf } from '@/app/api/billing-packets/[packetId]/pdf/route';
import { attestationFingerprint } from '@/lib/billing/packetText';
import {
  IDEMPOTENCY_SAFE_RETRY_MS,
  IN_FLIGHT_GRACE_MS,
  RECONCILE_CLAIMED_MIN_AGE_MS,
  claimRecipient,
  recordAmbiguousOutcome,
  recordLateProviderResult,
  recordProviderAcceptance,
  sendIdempotencyKey,
  startSendAttempt,
  transition,
} from '@/lib/billing/sendAttempts';
import { listPacketsForMember, serializeBillingPacket } from '@/lib/billing/packetAccess';
import { prisma as prismaMock } from '@/lib/db/prisma';

const ORG = DEFAULT_ORG_ID;
const OTHER_ORG = 'aaaaaaaa-0000-4000-8000-000000000009';
const ADMIN = 'a0000000-0000-4000-8000-000000000001';
const MEMBER = 'b0000000-0000-4000-8000-000000000002';
const COUNSELOR = { id: 'c0000000-0000-4000-8000-000000000003', fullName: 'Casey Counselor', email: 'casey@example.test' };
const SYLLABUS_PROGRAM = 'it-support-professional-certificate-ibm';
/** Verified static program with no catalog or syllabus price (price_list_default). */
const FALLBACK_PROGRAM = 'it-automation-with-python-google';
/** Draft curriculum pending owner verification. */
const DRAFT_PROGRAM = 'certified-production-technician-cpt';

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
    narrative: b.coverLetterBody as string,
  });
  b.reviewedFingerprint = opts.staleFingerprint ? attestationFingerprint({ programSlug: 'stale', invoiceDate: '', dueDate: null, billToName: '', referenceNumber: '', lineItems: [], fundingBasis: '', approvedAmount: null, fundingReference: '', exceptionNote: '', narrative: '' }) : fp;
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
  mocks.brandingGate.value = null;
  mocks.buildGate.value = null;
  mocks.afterSendRead.value = null;
  mocks.afterSendFindMany.value = null;
  mocks.trace.length = 0;
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
    expect(row.fundingAttestationKey).toBe('wioa_ita:TESTITA0001');
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
    const res = await createPacket(req(body({ lineItems: edited, coverLetterBody: 'Narrative drafted before the fee row was added.' })), params(MEMBER));
    expect(res.status).toBe(201);
    const snap = db.packets[0].signedSnapshot as Record<string, any>;
    expect(snap.j6.facts).toContain('Total due: $1,300.00');
    expect(snap.j6.facts).toContain('2. Exam voucher: $300.00');
    expect(db.packets[0].totalAmount).toBe(1300);
  });

  it('hard-blocks money in the J6 narrative; a payer name is accepted (covered by review only)', async () => {
    const money = await createPacket(req(body({ coverLetterBody: 'Please note Intro costs $2,000 this term.' })), params(MEMBER));
    expect(money.status).toBe(400);
    expect((await money.json()).code).toBe('narrative_money');
    const payer = await createPacket(req(body({ coverLetterBody: 'This invoice is billed to Another Workforce Board for this participant.' })), params(MEMBER));
    expect(payer.status).toBe(201);
    expect(db.packets).toHaveLength(1);
  });

  it('a narrative edit after the confirmations voids them', async () => {
    const b = body();
    b.coverLetterBody = 'A different narrative typed after ticking the boxes.';
    const res = await createPacket(req(b), params(MEMBER));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('stale_attestation');
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

  it('rejects fractional cents at the API and compares the approved amount in cents', async () => {
    const frac = await createPacket(req(body({ lineItems: [{ description: 'A', hours: null, amount: 0.005 }, { description: 'B', hours: null, amount: 0.005 }, { description: 'C', hours: null, amount: 0.005 }] })), params(MEMBER));
    expect(frac.status).toBe(400);
    expect((await frac.json()).error).toMatch(/whole cents/);
    const approved = await createPacket(req(body({ fundingAttestation: { approvedAmount: 7500.005 } })), params(MEMBER));
    expect(approved.status).toBe(400);
    expect((await approved.json()).error).toMatch(/whole cents/);
    expect(db.packets).toHaveLength(0);
    // 0.10 + 0.20 = 0.30 exactly equal to the approved amount: allowed (float sum would be 0.30000000000000004).
    const exact = await createPacket(
      req(body({ lineItems: [{ description: 'A', hours: null, amount: 0.1 }, { description: 'B', hours: null, amount: 0.2 }], fundingAttestation: { approvedAmount: 0.3 } })),
      params(MEMBER),
    );
    expect(exact.status).toBe(201);
    expect(db.packets[0].totalAmount).toBe(0.3);
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
    for (const reference of ['TEST-ITA-0001', ' test-ita-0001 ', 'Test-ITA-0001', 'TEST_ITA_0001.', 'test ita 0001']) {
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
      db.enrollments = [{ userId: MEMBER, organizationId: ORG, programSlug: 'it-automation-with-python-professional-certificate-google', curriculumVersion: 'legacy-v1', isPrimary: true, completedAt: new Date() }];
      const res = await createPacket(req(body({ programSlug: FALLBACK_PROGRAM, lineItems: [{ description: 'Tuition', hours: null, amount: 1300 }] })), params(MEMBER));
      expect(res.status).toBe(201);
      expect(db.packets[0].programSlug).toBe(FALLBACK_PROGRAM);
    });

    it('refuses a draft (owner-pending) curriculum even when enrolled and priced by hand', async () => {
      db.enrollments.push({ userId: MEMBER, organizationId: ORG, programSlug: DRAFT_PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: false });
      const res = await createPacket(req(body({ programSlug: DRAFT_PROGRAM, lineItems: [{ description: 'Tuition', hours: null, amount: 1300 }] })), params(MEMBER));
      expect(res.status).toBe(422);
      expect((await res.json()).code).toBe('draft_curriculum');
      expect(db.packets).toHaveLength(0);
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
  const ambiguous = () => new Error('socket hang up');
  const definite = () => Object.assign(new Error('Invalid `to` field'), { providerErrorName: 'validation_error' });
  const conflict409 = () => Object.assign(new Error('Same idempotency key used with a different payload'), { providerErrorName: 'invalid_idempotent_request' });
  const deferred = () => {
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
    return { promise, resolve, reject };
  };
  const ageClaims = (ms: number) =>
    db.sends.forEach((r) => {
      r.lastClaimedAt = new Date(Date.now() - ms);
      r.claimedAt = new Date(Date.now() - ms);
    });
  const DAY = 24 * 60 * 60 * 1000;
  const send = (id: string, payload: Record<string, unknown> = {}) => sendPacket(req(payload), packetParams(id));

  it('sends student then counselor from the snapshot with attempt-scoped keys, then marks sent', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    const res = await send(id);
    expect(res.status).toBe(200);
    expect(mocks.send.mock.calls.map((c) => [c[1].to, c[1].idempotencyKey])).toEqual([
      ['member@example.test', sendIdempotencyKey(id, 1, 'student')],
      [COUNSELOR.email, sendIdempotencyKey(id, 1, 'counselor')],
    ]);
    expect(mocks.send.mock.calls[1][1].cc).toBeUndefined();
    expect(db.packets[0]).toMatchObject({ status: 'sent', sendCount: 1, sendAttemptNo: 1 });
  });

  it('a member name change still sends the frozen name; an email change blocks with recipient_changed', async () => {
    const id = await signOne();
    db.users[0].fullName = 'Changed Name';
    expect((await send(id)).status).toBe(200);
    expect(mocks.send.mock.calls[0][1].subject).toContain('IT Support');
    const id2 = await signOne({ fundingAttestation: { reference: 'TEST-ITA-0002' } });
    db.users[0].email = 'changed@example.test';
    mocks.send.mockClear();
    const res = await send(id2);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('recipient_changed');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(db.sends.filter((r) => r.packetId === id2)).toHaveLength(0);
  });

  it('a counselor email change after signing blocks with recipient_changed', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    db.counselor = { ...COUNSELOR, email: 'new-casey@example.test' };
    const res = await send(id);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('recipient_changed');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('concurrent sends: exactly one student email', async () => {
    const id = await signOne();
    const results = await Promise.all([send(id), send(id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(studentSends()).toHaveLength(1);
  });

  it('counselor ambiguous failure: stays signed; Retry reuses the same key and identical payload after branding/EMAIL_FROM change', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    mocks.send.mockImplementation(async (_r: unknown, a: { to: string }) => {
      if (a.to === COUNSELOR.email) throw ambiguous();
      return { data: { id: 'x' }, error: null };
    });
    const first = await send(id);
    expect(first.status).toBe(502);
    const firstJson = await first.json();
    expect(firstJson.error).toMatch(/student copy was sent, but the counselor copy did not confirm/);
    expect(firstJson.packet.sendState.nextAction).toBe('retry');
    expect(db.packets[0].status).toBe('signed');
    const failedPayload = mocks.send.mock.calls[1][1];

    mocks.send.mockResolvedValue({ data: { id: 'y' }, error: null });
    mocks.branding.value = { ...mocks.branding.value, name: 'Brand Changed Later', primaryColor: '#999999' };
    process.env.EMAIL_FROM = 'changed@example.test';
    const retry = await send(id);
    expect(retry.status).toBe(200);
    expect(studentSends()).toHaveLength(1);
    const retried = mocks.send.mock.calls[2][1];
    expect(retried.idempotencyKey).toBe(sendIdempotencyKey(id, 1, 'counselor'));
    expect(retried).toEqual(failedPayload);
    expect(retried.html).toContain('Brand At Attempt');
    expect(db.packets[0].status).toBe('sent');
  });

  it('an ambiguous timeout past the idempotency window goes to needs_reconciliation, not a resend', async () => {
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(ambiguous());
    expect((await send(id)).status).toBe(502);
    db.sends[0].claimedAt = new Date(Date.now() - IDEMPOTENCY_SAFE_RETRY_MS - 1000);
    const res = await send(id);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('needs_reconciliation');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('student failure: nothing goes to the counselor', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(ambiguous());
    expect((await send(id)).status).toBe(502);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('a Resend 409 becomes needs_reconciliation: no new key, no send, and "Email again" is blocked until an outcome is recorded', async () => {
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(conflict409());
    const res = await send(id);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('needs_reconciliation');
    expect(db.sends[0].status).toBe('needs_reconciliation');
    expect((await send(id)).status).toBe(409);
    const again = await send(id, { action: 'email_again' });
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe('previous_attempt_open');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((await send(id, { action: 'reconcile', recipient: 'student', delivered: false })).status).toBe(400); // note required
    const early = await send(id, { action: 'reconcile', recipient: 'student', delivered: false, note: 'too early' });
    expect(early.status).toBe(409);
    expect((await early.json()).code).toBe('retry_first');
    ageClaims(DAY);
    const reconciled = await send(id, { action: 'reconcile', recipient: 'student', delivered: false, note: 'Resend log shows no delivery' });
    expect(reconciled.status).toBe(200); // recorded (not delivered): its own success shape
    expect(await reconciled.json()).toMatchObject({ kind: 'reconciliation_recorded', outcome: 'not_delivered', recipient: 'student' });
    expect(db.sends[0]).toMatchObject({ status: 'reconciled_not_delivered', reconciledById: ADMIN, reconcileNote: 'Resend log shows no delivery' });
    const newAttempt = await send(id, { action: 'email_again' });
    expect(newAttempt.status).toBe(200);
    expect(mocks.send.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([sendIdempotencyKey(id, 1, 'student'), sendIdempotencyKey(id, 2, 'student')]);
  });

  it('operator marks a needs_reconciliation copy delivered: the packet completes', async () => {
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(conflict409());
    await send(id);
    const res = await send(id, { action: 'reconcile', recipient: 'student', delivered: true, note: 'Delivered per Resend log' });
    expect(res.status).toBe(200);
    expect(db.packets[0].status).toBe('sent');
  });

  it('a definite rejection is terminal and allows a new attempt', async () => {
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(definite());
    const res = await send(id);
    expect(res.status).toBe(502);
    expect((await res.json()).packet.sendState.nextAction).toBe('email_again');
    expect(db.sends[0].status).toBe('rejected_definite');
    expect((await send(id, { action: 'email_again' })).status).toBe(200);
    expect(mocks.send.mock.calls[1][1].idempotencyKey).toBe(sendIdempotencyKey(id, 2, 'student'));
  });

  it('"Email again" while an attempt is in flight is refused; concurrent "Email again" clicks start one attempt', async () => {
    const id = await signOne();
    const pending = deferred();
    mocks.send.mockImplementationOnce(() => pending.promise);
    const inFlight = send(id);
    await new Promise((r) => setTimeout(r, 20));
    const blocked = await send(id, { action: 'email_again' });
    expect(blocked.status).toBe(409);
    pending.resolve({ data: { id: 'x' }, error: null });
    expect((await inFlight).status).toBe(200);
    const again = { action: 'email_again', confirmDuplicateTo: ['student'] };
    const clicks = await Promise.all([send(id, again), send(id, again)]);
    expect(clicks.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(db.packets[0].sendAttemptNo).toBe(2);
    expect(studentSends()).toHaveLength(2);
  });

  it('operator reconcile on a fresh claim is refused; a late failure after reconcile does not overwrite it', async () => {
    const id = await signOne();
    const pending = deferred();
    mocks.send.mockImplementationOnce(() => pending.promise);
    const inFlight = send(id);
    await new Promise((r) => setTimeout(r, 20));
    const fresh = await send(id, { action: 'reconcile', recipient: 'student', delivered: true, note: 'checked' });
    expect(fresh.status).toBe(409);
    expect((await fresh.json()).code).toBe('in_progress');
    ageClaims(IN_FLIGHT_GRACE_MS + 1000);
    const stillEarly = await send(id, { action: 'reconcile', recipient: 'student', delivered: true, note: 'checked' });
    expect(stillEarly.status).toBe(409); // claimed rows need RECONCILE_CLAIMED_MIN_AGE_MS
    ageClaims(RECONCILE_CLAIMED_MIN_AGE_MS + 1000);
    expect((await send(id, { action: 'reconcile', recipient: 'student', delivered: true, note: 'Delivered per Resend log' })).status).toBe(200);
    pending.reject(ambiguous());
    await inFlight;
    expect(db.sends[0].status).toBe('reconciled_delivered');
    expect(db.packets[0].status).toBe('sent');
  });

  it('a late needs_reconciliation cannot overwrite a newer state (claim-token compare-and-set)', async () => {
    const id = await signOne();
    await send(id);
    const row = db.sends[0];
    const stale = { id: row.id as string, status: 'claimed', claimToken: 'old-token' };
    expect(await transition(stale as never, 'needs_reconciliation', { lastError: 'late' })).toBe(false);
    expect(row.status).toBe('sent');
  });

  it('an older attempt finishing after a newer one started does not change the packet', async () => {
    const id = await signOne();
    const pending = deferred();
    mocks.send.mockImplementationOnce(() => pending.promise);
    const slow = send(id);
    await new Promise((r) => setTimeout(r, 20));
    ageClaims(DAY);
    expect((await send(id, { action: 'reconcile', recipient: 'student', delivered: false, note: 'No delivery in Resend log' })).status).toBe(200);
    expect((await send(id, { action: 'email_again' })).status).toBe(200);
    expect(db.packets[0]).toMatchObject({ status: 'sent', sendAttemptNo: 2, sendCount: 2 });
    pending.resolve({ data: { id: 'late' }, error: null });
    await slow;
    expect(db.packets[0]).toMatchObject({ status: 'sent', sendAttemptNo: 2, sendCount: 2 });
    // The late success is recorded, and it contradicts the "not delivered" record.
    const old = db.sends.find((r) => r.attemptNo === 1)!;
    expect(old.status).toBe('needs_reconciliation');
    expect(String(old.lateProviderResult)).toContain('"delivered":true');
    const listed = await sendPacket(req({}), packetParams(id));
    expect((await listed.json()).packet.sendState.warnings[0]).toMatch(/late provider result/);
  });

  it('reconcile rules: claimed rows wait 15 minutes; "not delivered" waits for the idempotency window; a same-key Retry settles it', async () => {
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(ambiguous());
    expect((await send(id)).status).toBe(502);
    const notYet = await send(id, { action: 'reconcile', recipient: 'student', delivered: false, note: 'no log' });
    expect(notYet.status).toBe(409);
    expect((await notYet.json()).code).toBe('retry_first');
    expect((await send(id, { action: 'email_again' })).status).toBe(409);
    const retried = await send(id);
    expect(retried.status).toBe(200);
    expect(mocks.send.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([sendIdempotencyKey(id, 1, 'student'), sendIdempotencyKey(id, 1, 'student')]);
  });

  it('a late success after "mark delivered" is recorded without changing the outcome', async () => {
    const id = await signOne();
    const pending = deferred();
    mocks.send.mockImplementationOnce(() => pending.promise);
    const slow = send(id);
    await new Promise((r) => setTimeout(r, 20));
    ageClaims(RECONCILE_CLAIMED_MIN_AGE_MS + 1000);
    expect((await send(id, { action: 'reconcile', recipient: 'student', delivered: true, note: 'Delivered per Resend log' })).status).toBe(200);
    pending.resolve({ data: { id: 'late' }, error: null });
    await slow;
    expect(db.sends[0].status).toBe('reconciled_delivered');
    expect(String(db.sends[0].lateProviderResult)).toContain('"delivered":true');
  });

  it('reconcile still works after a recipient change; further sending needs a re-sign', async () => {
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(ambiguous());
    expect((await send(id)).status).toBe(502);
    db.users[0].email = 'changed@example.test';
    expect((await send(id, { action: 'reconcile', recipient: 'student', delivered: true, note: 'Delivered per Resend log' })).status).toBe(200);
    const more = await send(id, { action: 'email_again' });
    expect(more.status).toBe(409);
    expect((await more.json()).code).toBe('recipient_changed');
  });

  it('"Email again" is refused while the new attempt has unclaimed (pending) rows or only the student is done', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    const started = await startSendAttempt({
      packetId: id,
      expectedCurrent: null,
      now: new Date(),
      recipients: [
        { recipient: 'student', email: 'member@example.test', cc: null },
        { recipient: 'counselor', email: COUNSELOR.email, cc: null },
      ],
      record: { startedAt: new Date().toISOString(), startedById: ADMIN, from: 'x@example.test', branding: mocks.branding.value as never },
    });
    expect(started.ok).toBe(true);
    const clicks = await Promise.all([send(id, { action: 'email_again' }), send(id, { action: 'email_again' })]);
    expect(clicks.map((r) => r.status)).toEqual([409, 409]);
    db.sends.find((r) => r.recipient === 'student')!.status = 'sent';
    expect((await send(id, { action: 'email_again' })).status).toBe(409);
    expect(db.packets[0].sendAttemptNo).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('attempt 2 partially failing is retried as attempt 2 (no attempt 3)', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    expect((await send(id)).status).toBe(200);
    mocks.send.mockImplementation(async (_r: unknown, a: { to: string }) => {
      if (a.to === COUNSELOR.email) throw ambiguous();
      return { data: { id: 'x' }, error: null };
    });
    const second = await send(id, { action: 'email_again', confirmDuplicateTo: ['counselor', 'student'] });
    expect(second.status).toBe(502);
    expect((await second.json()).packet.sendState.nextAction).toBe('retry');
    expect((await send(id, { action: 'email_again' })).status).toBe(409);
    mocks.send.mockResolvedValue({ data: { id: 'y' }, error: null });
    expect((await send(id)).status).toBe(200);
    expect(db.packets[0].sendAttemptNo).toBe(2);
    expect(mocks.send.mock.calls.at(-1)?.[1].idempotencyKey).toBe(sendIdempotencyKey(id, 2, 'counselor'));
  });

  it('a crash after a claim within the window: the retry reuses the same key', async () => {
    const id = await signOne();
    mocks.send.mockImplementationOnce(() => new Promise(() => {}));
    void send(id);
    await new Promise((r) => setTimeout(r, 20));
    ageClaims(10 * 60 * 1000);
    const res = await send(id);
    expect(res.status).toBe(200);
    expect(mocks.send.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([sendIdempotencyKey(id, 1, 'student'), sendIdempotencyKey(id, 1, 'student')]);
  });

  it('a plain press on a completed attempt resends nothing; "Email again" uses new keys', async () => {
    const id = await signOne();
    await send(id);
    expect((await send(id)).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((await send(id, { action: 'email_again', confirmDuplicateTo: ['student'] })).status).toBe(200);
    expect(mocks.send.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([sendIdempotencyKey(id, 1, 'student'), sendIdempotencyKey(id, 2, 'student')]);
    expect(db.packets[0].sendCount).toBe(2);
  });

  it('a corrupt non-null send attempt fails closed: 409, no new key, no send; a null attempt starts attempt 1', async () => {
    const id = await signOne();
    db.packets[0].sendAttemptNo = 1;
    db.packets[0].sendAttempt = { attemptNo: 'x' };
    const res = await send(id);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('needs_reconciliation');
    expect((await send(id, { action: 'email_again' })).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
    db.packets[0].sendAttemptNo = null;
    db.packets[0].sendAttempt = null;
    expect((await send(id)).status).toBe(200);
  });

  describe('cc drift', () => {
    it('refuses when a counselor was assigned after signing', async () => {
      const id = await signOne();
      db.counselor = COUNSELOR;
      const res = await send(id);
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('counselor_changed');
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('refuses when the counselor changed after signing', async () => {
      db.counselor = COUNSELOR;
      const id = await signOne();
      db.counselor = { ...COUNSELOR, id: 'c0000000-0000-4000-8000-000000000099', email: 'other@example.test' };
      expect((await send(id)).status).toBe(409);
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('refuses when the counselor was removed after signing', async () => {
      db.counselor = COUNSELOR;
      const id = await signOne();
      db.counselor = null;
      expect((await send(id)).status).toBe(409);
      expect(mocks.send).not.toHaveBeenCalled();
    });
  });

  it('a corrupt snapshot is refused (409) and nothing is sent; a legacy packet cannot be emailed', async () => {
    const id = await signOne();
    db.packets[0].signedSnapshot = { version: 1, provider: {} };
    const res = await send(id);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('snapshot_corrupt');
    db.packets[0].signedSnapshot = null;
    expect((await send(id)).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('refuses an admin from another org (403) without sending', async () => {
    const id = await signOne();
    mocks.getActorOrganizationId.mockResolvedValue(OTHER_ORG);
    mocks.isSuperAdmin.mockResolvedValue(true);
    expect((await send(id)).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('is admin-only: a counselor cannot trigger the send', async () => {
    const id = await signOne();
    mocks.isAdmin.mockResolvedValue(false);
    expect((await send(id)).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('Supersede and re-issue', () => {
  const send = (id: string, payload: Record<string, unknown> = {}) => sendPacket(req(payload), packetParams(id));
  const resign = (oldId: string, overrides: Partial<Body> = {}) =>
    createPacket(req(body({ ...overrides, supersedesPacketId: oldId, supersedeReason: 'Member email changed after signing' } as Partial<Body>)), params(MEMBER));

  it('after recipient drift: supersede, then the replacement signs and sends; the old one cannot send; audit fields are set', async () => {
    const oldId = await signOne();
    db.users[0].email = 'new@example.test';
    expect((await send(oldId)).status).toBe(409);
    // A plain second packet with the same approval is still refused.
    expect((await createPacket(req(body()), params(MEMBER))).status).toBe(409);
    const res = await resign(oldId);
    expect(res.status).toBe(201);
    const newId = (await res.json()).packet.id as string;
    const old = db.packets.find((p) => p.id === oldId)!;
    expect(old).toMatchObject({ status: 'superseded', supersededById: ADMIN, supersededReason: 'Member email changed after signing', supersededByPacketId: newId });
    expect(old.supersededAt).toBeInstanceOf(Date);
    expect(db.packets.find((p) => p.id === newId)!.supersedesPacketId).toBe(oldId);
    const oldSend = await send(oldId);
    expect(oldSend.status).toBe(409);
    expect((await oldSend.json()).code).toBe('superseded_packet');
    expect((await send(oldId, { action: 'email_again' })).status).toBe(409);
    expect((await send(newId)).status).toBe(200);
    expect(mocks.send.mock.calls.at(-1)?.[1].to).toBe('new@example.test');
    // And the replacement itself now blocks a plain duplicate.
    expect((await createPacket(req(body()), params(MEMBER))).status).toBe(409);
  });

  it('refuses to supersede while a copy of the old packet is being sent', async () => {
    const oldId = await signOne();
    let resolve!: (v: unknown) => void;
    mocks.send.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const inFlight = send(oldId);
    await new Promise((r) => setTimeout(r, 20));
    const res = await resign(oldId);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('in_progress');
    expect(db.packets.find((p) => p.id === oldId)!.status).toBe('signed');
    resolve({ data: { id: 'x' }, error: null });
    await inFlight;
  });

  it('the replacement cannot be delivered until the old packet\'s unconfirmed copies are settled; reconcile on the old packet works', async () => {
    const oldId = await signOne();
    mocks.send.mockRejectedValueOnce(new Error('socket hang up'));
    expect((await send(oldId)).status).toBe(502);
    const newId = (await (await resign(oldId)).json()).packet.id as string;
    const blocked = await send(newId);
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe('prior_packet_unsettled');
    expect((await send(oldId, { action: 'reconcile', recipient: 'student', delivered: true, note: 'Delivered per Resend log' })).status).toBe(200);
    expect((await send(newId)).status).toBe(200);
  });

  it('members see the current packet first and a superseded one only if it reached, or may have reached, them', async () => {
    const neverSent = await signOne();
    const r1 = await resign(neverSent);
    const current1 = (await r1.json()).packet.id as string;
    expect((await send(current1)).status).toBe(200); // delivered to the member
    const r2 = await resign(current1, { fundingAttestation: { reference: 'TEST-ITA-0001' } });
    expect(r2.status).toBe(201);
    const current2 = (await r2.json()).packet.id as string;
    // current2 is signed but not sent yet: hidden from the member until a send could reach them.
    const listed = await listPacketsForMember(MEMBER);
    expect(listed.map((p) => p.id)).toEqual([current1]);
    expect(listed[0]).toMatchObject({ status: 'superseded', supersededByPacketId: current2 });
    expect((await send(current2)).status).toBe(200);
    expect((await listPacketsForMember(MEMBER)).map((p) => p.id)).toEqual([current2, current1]);
  });
});

describe('GET /api/billing-packets/[packetId]/pdf', () => {
  it('lets the member download their own J6; a corrupt snapshot is a 409, never a live re-render', async () => {
    const id = await signOne();
    expect((await sendPacket(req({}), packetParams(id))).status).toBe(200);
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

describe('Send-state races with supersede (checkpoint 4)', () => {
  const send = (id: string, payload: Record<string, unknown> = {}) => sendPacket(req(payload), packetParams(id));
  const resign = (oldId: string, overrides: Partial<Body> = {}) =>
    createPacket(req(body({ ...overrides, supersedesPacketId: oldId, supersedeReason: 'Correction' } as Partial<Body>)), params(MEMBER));
  const gate = () => {
    let open!: () => void;
    const promise = new Promise<void>((r) => (open = r));
    return { promise, open };
  };
  const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

  it('start deferred, supersede commits, start resumes: no attempt, no provider call, 409', async () => {
    const oldId = await signOne();
    const g = gate();
    mocks.brandingGate.value = g.promise;
    const stale = send(oldId); // passes the route's status check, then waits before startSendAttempt
    await tick();
    mocks.brandingGate.value = null;
    expect((await resign(oldId)).status).toBe(201);
    g.open();
    const res = await stale;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('superseded_packet');
    expect(mocks.send).not.toHaveBeenCalled();
    const old = db.packets.find((p) => p.id === oldId)!;
    expect(old).toMatchObject({ status: 'superseded', sendAttemptNo: null });
    expect(db.sends.filter((r) => r.packetId === oldId)).toHaveLength(0);
  });

  it('claim deferred, supersede commits first: the claim fails under the lock and nothing is sent', async () => {
    const oldId = await signOne();
    const g = gate();
    mocks.buildGate.value = g.promise;
    const stale = send(oldId); // attempt 1 started (pending rows), waiting before the claim
    await tick();
    expect(db.sends.filter((r) => r.packetId === oldId).map((r) => r.status)).toEqual(['pending']);
    mocks.buildGate.value = null;
    expect((await resign(oldId)).status).toBe(201);
    expect(db.sends.find((r) => r.packetId === oldId)!.status).toBe('rejected_definite'); // closed in the supersede transaction
    g.open();
    const res = await stale;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('superseded_packet');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('claim first, supersede second: supersede is refused (in_progress) and the send completes', async () => {
    const oldId = await signOne();
    let resolve!: (v: unknown) => void;
    mocks.send.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const inFlight = send(oldId);
    await tick();
    const res = await resign(oldId);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('in_progress');
    resolve({ data: { id: 'm-1' }, error: null });
    expect((await inFlight).status).toBe(200);
    expect(db.packets.find((p) => p.id === oldId)!.status).toBe('sent');
  });

  it('a direct claim on a superseded packet is refused; a missing row fails closed', async () => {
    const oldId = await signOne();
    expect((await resign(oldId)).status).toBe(201);
    expect(await claimRecipient({ packetId: oldId, attemptNo: 1, recipient: 'student', email: 'member@example.test', cc: null, now: new Date() })).toEqual({ kind: 'superseded' });
    const id = await signOne({ fundingAttestation: { reference: 'TEST-ITA-0009' } });
    expect(await claimRecipient({ packetId: id, attemptNo: 1, recipient: 'student', email: 'member@example.test', cc: null, now: new Date() })).toEqual({ kind: 'missing_row' });
    expect(db.sends.filter((r) => r.packetId === id)).toHaveLength(0);
  });

  it('completion deferred, supersede commits, completion resumes: packet stays superseded and the row result is recorded', async () => {
    const oldId = await signOne();
    let resolve!: (v: unknown) => void;
    mocks.send.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const slow = send(oldId);
    await tick();
    db.sends.forEach((r) => (r.lastClaimedAt = new Date(Date.now() - RECONCILE_CLAIMED_MIN_AGE_MS - 1000))); // a hung request
    expect((await resign(oldId)).status).toBe(201);
    resolve({ data: { id: 'm-late' }, error: null });
    const res = await slow;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('superseded_packet');
    const old = db.packets.find((p) => p.id === oldId)!;
    expect(old.status).toBe('superseded');
    expect(old.sentAt ?? null).toBeNull();
    const row = db.sends.find((r) => r.packetId === oldId)!;
    expect(row).toMatchObject({ status: 'sent', providerMessageId: 'm-late' });
    expect(row.providerResultAt).toBeInstanceOf(Date);
  });
});

describe('Provider acceptance is never lost to a racing transition', () => {
  async function claimedRow() {
    const id = await signOne();
    await startSendAttempt({
      packetId: id,
      expectedCurrent: null,
      now: new Date(),
      recipients: [{ recipient: 'student', email: 'member@example.test', cc: null }],
      record: { startedAt: new Date().toISOString(), startedById: ADMIN, from: 'x@example.test', branding: mocks.branding.value as never },
    });
    const claim = await claimRecipient({ packetId: id, attemptNo: 1, recipient: 'student', email: 'member@example.test', cc: null, now: new Date() });
    if (claim.kind !== 'claimed') throw new Error(claim.kind);
    return claim.row;
  }

  it('timeout transition first, late acceptance second: ends sent with the provider result', async () => {
    const row = await claimedRow();
    expect((await recordAmbiguousOutcome(row, 'timeout'))!.status).toBe('ambiguous');
    await recordLateProviderResult(row.id, { delivered: true, detail: 'late', messageId: 'm-1' });
    expect(db.sends[0]).toMatchObject({ status: 'sent', providerMessageId: 'm-1' });
    expect(String(db.sends[0].providerResult)).toContain('"delivered":true');
  });

  it('late acceptance first, timeout transition second: stays sent, never ambiguous', async () => {
    const row = await claimedRow();
    await recordLateProviderResult(row.id, { delivered: true, detail: 'late', messageId: 'm-1' });
    expect(db.sends[0].status).toBe('sent');
    expect((await recordAmbiguousOutcome(row, 'timeout'))!.status).toBe('sent');
    expect(db.sends[0]).toMatchObject({ status: 'sent', providerMessageId: 'm-1' });
  });

  it('acceptance recorded but its status CAS lost: the timeout path goes to sent, not ambiguous; the result is write-once', async () => {
    const row = await claimedRow();
    Object.assign(db.sends[0], { providerResult: '{"delivered":true}', providerResultAt: new Date(), providerMessageId: 'm-1' });
    expect((await recordAmbiguousOutcome(row, 'timeout'))!.status).toBe('sent');
    await recordProviderAcceptance(row.id, { messageId: 'm-2', detail: 'again', late: false });
    expect(db.sends[0].providerMessageId).toBe('m-1');
  });

  it('reconcile "not delivered" and a concurrent acceptance serialize on the lock: never terminal-undelivered with an acceptance', async () => {
    const row = await claimedRow();
    db.sends[0].status = 'ambiguous';
    db.sends[0].claimedAt = new Date(Date.now() - 2 * IDEMPOTENCY_SAFE_RETRY_MS);
    db.sends[0].lastClaimedAt = new Date(Date.now() - 2 * IDEMPOTENCY_SAFE_RETRY_MS);
    // The acceptance starts while reconcile holds the lock (right after its row read).
    let accepted: Promise<void> | null = null;
    mocks.afterSendRead.value = () => {
      accepted = recordProviderAcceptance(row.id, { messageId: 'm-gap', detail: 'late', late: true });
    };
    mocks.trace.length = 0;
    const res = await sendPacket(req({ action: 'reconcile', recipient: 'student', delivered: false, note: 'no log found' }), packetParams(row.packetId as string));
    await accepted;
    expect(res.status).toBe(200); // reconcile held the lock first
    // The acceptance then landed and contradicted it: flagged, not left terminal.
    expect(db.sends[0]).toMatchObject({ status: 'needs_reconciliation', providerMessageId: 'm-gap' });
    expect(String(db.sends[0].lastError)).toMatch(/AFTER it was recorded as not delivered/);
    // The provider did accept the only expected copy, so the packet is finalized truthfully.
    expect(db.packets[0]).toMatchObject({ status: 'sent', sentTo: ['member@example.test'] });
  });

  it('the reconcile "not delivered" CAS itself refuses a row whose acceptance was recorded after the read', async () => {
    const row = await claimedRow();
    Object.assign(db.sends[0], { status: 'ambiguous', claimedAt: new Date(Date.now() - 2 * IDEMPOTENCY_SAFE_RETRY_MS), lastClaimedAt: new Date(Date.now() - 2 * IDEMPOTENCY_SAFE_RETRY_MS) });
    // Only the result columns land in the gap (status and token unchanged): the CAS guard must still refuse.
    mocks.afterSendRead.value = () => Object.assign(db.sends[0], { providerResultAt: new Date(), providerResult: '{"delivered":true}' });
    const res = await sendPacket(req({ action: 'reconcile', recipient: 'student', delivered: false, note: 'no log found' }), packetParams(row.packetId as string));
    expect(res.status).toBe(409);
    expect(db.sends[0].status).toBe('ambiguous');
  });

  it('reconcile "not delivered" first, then the acceptance: needs_reconciliation with a warning, never silently terminal', async () => {
    const row = await claimedRow();
    Object.assign(db.sends[0], { status: 'ambiguous', claimedAt: new Date(Date.now() - 2 * IDEMPOTENCY_SAFE_RETRY_MS), lastClaimedAt: new Date(Date.now() - 2 * IDEMPOTENCY_SAFE_RETRY_MS) });
    const res = await sendPacket(req({ action: 'reconcile', recipient: 'student', delivered: false, note: 'no log found' }), packetParams(row.packetId as string));
    expect(res.status).toBe(200);
    await recordProviderAcceptance(row.id, { messageId: 'm-after', detail: 'late', late: true });
    expect(db.sends[0].status).toBe('needs_reconciliation');
  });

  it('a new attempt starting in the gap (acceptance recorded, status not settled) creates no new key', async () => {
    const row = await claimedRow();
    // Gap: terminal-looking status, acceptance already recorded.
    Object.assign(db.sends[0], { status: 'reconciled_not_delivered', providerResultAt: new Date(), providerResult: '{"delivered":true}', providerMessageId: 'm-gap' });
    const started = await startSendAttempt({
      packetId: row.packetId as string,
      expectedCurrent: 1,
      now: new Date(),
      recipients: [{ recipient: 'student', email: 'member@example.test', cc: null }],
      record: { startedAt: new Date().toISOString(), startedById: ADMIN, from: 'x@example.test', branding: mocks.branding.value as never },
    });
    expect(started).toEqual({ ok: false, reason: 'duplicate' });
    const viaRoute = await sendPacket(req({ action: 'email_again' }), packetParams(row.packetId as string));
    expect(viaRoute.status).toBe(409);
    expect((await viaRoute.json()).code).toBe('duplicate_confirmation_required');
    expect(db.sends).toHaveLength(1);
    expect(db.packets[0].sendAttemptNo).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('acceptance arriving between startSendAttempt\'s last read and its create waits for the lock; the old row is then flagged', async () => {
    const row = await claimedRow();
    Object.assign(db.sends[0], { status: 'reconciled_not_delivered' }); // terminal, undelivered
    const startArgs = {
      packetId: row.packetId as string,
      expectedCurrent: 1,
      now: new Date(),
      recipients: [{ recipient: 'student' as const, email: 'member@example.test', cc: null }],
      record: { startedAt: new Date().toISOString(), startedById: ADMIN, from: 'x@example.test', branding: mocks.branding.value as never },
    };
    let acceptance: Promise<void> | null = null;
    // The start's delivered read is its last findMany before the create: hook the gap there.
    let reads = 0;
    const arm = () => {
      mocks.afterSendFindMany.value = () => {
        reads += 1;
        if (reads < 2) return arm(); // 1st findMany = terminal check, 2nd = delivered read
        acceptance = recordProviderAcceptance(row.id, { messageId: 'm-gap', detail: 'late', late: true });
      };
    };
    arm();
    mocks.trace.length = 0;
    const started = await startSendAttempt(startArgs);
    await acceptance;
    expect(started.ok).toBe(true);
    // The acceptance blocked on the lock until attempt 2's row was created.
    expect(mocks.trace).toEqual(['create:2:student', 'provider_result']);
    const old = db.sends.find((r) => r.attemptNo === 1)!;
    expect(old).toMatchObject({ status: 'needs_reconciliation', providerMessageId: 'm-gap' });
    expect(String(old.lastError)).toMatch(/Check for a duplicate email/);
  });

  it('acceptance committing first: startSendAttempt sees a delivered recipient and requires a duplicate confirmation', async () => {
    const row = await claimedRow();
    Object.assign(db.sends[0], { status: 'reconciled_not_delivered' });
    await recordProviderAcceptance(row.id, { messageId: 'm-first', detail: 'late', late: true });
    const args = {
      packetId: row.packetId as string,
      expectedCurrent: 1,
      now: new Date(),
      recipients: [{ recipient: 'student' as const, email: 'member@example.test', cc: null }],
      record: { startedAt: new Date().toISOString(), startedById: ADMIN, from: 'x@example.test', branding: mocks.branding.value as never },
    };
    // Flagged for reconciliation (not terminal) -> no new attempt at all; once reconciled delivered, a duplicate needs confirmation.
    expect(await startSendAttempt(args)).toEqual({ ok: false, reason: 'not_terminal' });
    Object.assign(db.sends[0], { status: 'reconciled_delivered' });
    expect(await startSendAttempt(args)).toEqual({ ok: false, reason: 'duplicate' });
    expect((await startSendAttempt({ ...args, confirmedDuplicates: ['student'] })).ok).toBe(true);
  });

  it('timeout, then a late acceptance: the packet is finalized (sent, sentAt, sentTo)', async () => {
    const row = await claimedRow();
    await recordAmbiguousOutcome(row, 'timeout');
    expect(db.packets[0].status).toBe('signed');
    await recordLateProviderResult(row.id, { delivered: true, detail: 'late', messageId: 'm-late' });
    expect(db.packets[0]).toMatchObject({ status: 'sent', sendCount: 1, sentTo: ['member@example.test'] });
    expect(db.packets[0].sentAt).toBeInstanceOf(Date);
  });

  it('a late acceptance on a superseded packet records the row but leaves the packet superseded', async () => {
    const row = await claimedRow();
    await recordAmbiguousOutcome(row, 'timeout');
    db.sends[0].lastClaimedAt = new Date(Date.now() - RECONCILE_CLAIMED_MIN_AGE_MS - 1000);
    const res = await createPacket(req(body({ supersedesPacketId: row.packetId, supersedeReason: 'Correction' } as Partial<Body>)), params(MEMBER));
    expect(res.status).toBe(201);
    await recordLateProviderResult(row.id, { delivered: true, detail: 'late', messageId: 'm-late' });
    const old = db.packets.find((p) => p.id === row.packetId)!;
    expect(old.status).toBe('superseded');
    expect(old.sentAt ?? null).toBeNull();
    expect(db.sends.find((r) => r.id === row.id)).toMatchObject({ status: 'sent', providerMessageId: 'm-late' });
  });

  it('a late acceptance for an older attempt records the row but does not change the packet', async () => {
    const row = await claimedRow();
    await recordAmbiguousOutcome(row, 'timeout');
    // Operator settled attempt 1 after the window; attempt 2 started and is still pending.
    Object.assign(db.sends[0], { status: 'reconciled_not_delivered' });
    const next = await startSendAttempt({
      packetId: row.packetId as string,
      expectedCurrent: 1,
      now: new Date(),
      recipients: [{ recipient: 'student', email: 'member@example.test', cc: null }],
      record: { startedAt: new Date().toISOString(), startedById: ADMIN, from: 'x@example.test', branding: mocks.branding.value as never },
    });
    expect(next.ok).toBe(true);
    await recordLateProviderResult(row.id, { delivered: true, detail: 'late', messageId: 'm-old' });
    expect(db.packets[0]).toMatchObject({ status: 'signed', sendAttemptNo: 2 });
    expect(db.packets[0].sentAt ?? null).toBeNull();
    expect(db.sends.find((r) => r.id === row.id)).toMatchObject({ status: 'needs_reconciliation', providerMessageId: 'm-old' });
  });

  it('an acceptance after "not delivered" was recorded goes back to needs_reconciliation; "not delivered" is refused once accepted', async () => {
    const row = await claimedRow();
    db.sends[0].status = 'reconciled_not_delivered';
    await recordLateProviderResult(row.id, { delivered: true, detail: 'late', messageId: 'm-1' });
    expect(db.sends[0].status).toBe('needs_reconciliation');
    expect(String(db.sends[0].lastError)).toMatch(/AFTER it was recorded as not delivered/);
    db.sends[0].claimedAt = new Date(Date.now() - 2 * IDEMPOTENCY_SAFE_RETRY_MS);
    const res = await sendPacket(req({ action: 'reconcile', recipient: 'student', delivered: false, note: 'no log' }), packetParams(row.packetId as string));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('not_reconcilable');
  });
});

describe('Reconcile on a superseded packet', () => {
  const send = (id: string, payload: Record<string, unknown> = {}) => sendPacket(req(payload), packetParams(id));
  const resign = (oldId: string) =>
    createPacket(req(body({ supersedesPacketId: oldId, supersedeReason: 'Correction' } as Partial<Body>)), params(MEMBER));

  it('reconciling every old row: 200, old stays superseded, the replacement becomes sendable', async () => {
    const oldId = await signOne();
    mocks.send.mockRejectedValueOnce(new Error('socket hang up'));
    expect((await send(oldId)).status).toBe(502);
    const newId = (await (await resign(oldId)).json()).packet.id as string;
    const res = await send(oldId, { action: 'reconcile', recipient: 'student', delivered: true, note: 'Resend log shows delivered (message id m-x)' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ kind: 'reconciliation_recorded', outcome: 'delivered', recipient: 'student', replacementSendable: true });
    expect(body.packet.status).toBe('superseded');
    expect(db.packets.find((p) => p.id === oldId)!.status).toBe('superseded');
    expect((await send(newId)).status).toBe(200);
  });

  it('a partial reconcile reflects exactly the committed row, and the replacement stays blocked', async () => {
    db.counselor = COUNSELOR;
    const oldId = await signOne();
    mocks.send.mockRejectedValue(new Error('socket hang up'));
    expect((await send(oldId)).status).toBe(502);
    mocks.send.mockResolvedValue({ data: { id: 'msg' }, error: null });
    // Synthetic state: both copies unconfirmed (the counselor copy after an earlier retry).
    Object.assign(db.sends.find((r) => r.recipient === 'counselor')!, { status: 'ambiguous', claimedAt: new Date(), lastClaimedAt: new Date() });
    const newId = (await (await resign(oldId)).json()).packet.id as string;
    const res = await send(oldId, { action: 'reconcile', recipient: 'student', delivered: true, note: 'Resend log shows delivered' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.replacementSendable).toBe(false);
    expect(body.sendState.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipient: 'student', status: 'reconciled_delivered' }),
        expect.objectContaining({ recipient: 'counselor', status: 'ambiguous' }),
      ]),
    );
    const blocked = await send(newId);
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe('prior_packet_unsettled');
  });
});

describe('Partial delivery and targeted attempts', () => {
  const send = (id: string, payload: Record<string, unknown> = {}) => sendPacket(req(payload), packetParams(id));
  const definite = () => Object.assign(new Error('Invalid `to` field'), { providerErrorName: 'validation_error' });

  async function partiallyDelivered() {
    db.counselor = COUNSELOR;
    const id = await signOne();
    mocks.send.mockImplementation(async (_r: unknown, a: { to: string }) => {
      if (a.to === COUNSELOR.email) throw definite();
      return { data: { id: 'm-student' }, error: null };
    });
    expect((await send(id)).status).toBe(502);
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: 'm-2' }, error: null });
    return id;
  }

  it('shows per-recipient history after a reload and offers only the remaining recipient', async () => {
    const id = await partiallyDelivered();
    const reload = await listAdminPackets(new Request('http://localhost/x'), params(MEMBER));
    const [p] = (await reload.json()).packets;
    expect(p.status).toBe('signed');
    expect(p.sendState.history).toEqual([
      expect.objectContaining({ attemptNo: 1, recipient: 'student', status: 'sent', email: 'member@example.test' }),
      expect.objectContaining({ attemptNo: 1, recipient: 'counselor', status: 'rejected_definite' }),
    ]);
    expect(p.sendState.history[0].sentAt).toEqual(expect.any(String));
    expect(p.sendState.delivered).toEqual([expect.objectContaining({ recipient: 'student', attemptNo: 1 })]);
    expect(p.sendState.remaining).toEqual(['counselor']);
    expect(p.sendState.nextAction).toBe('email_again');
    expect(id).toBe(p.id);
  });

  it('"Send to remaining recipients" emails only the counselor; the stored subset makes the attempt terminal', async () => {
    const id = await partiallyDelivered();
    const res = await send(id, { action: 'send_remaining' });
    expect(res.status).toBe(200);
    expect((await res.json()).sentTo).toEqual([COUNSELOR.email]);
    expect(mocks.send.mock.calls.map((c) => [c[1].to, c[1].idempotencyKey])).toEqual([[COUNSELOR.email, sendIdempotencyKey(id, 2, 'counselor')]]);
    const p = db.packets[0];
    expect(p).toMatchObject({ status: 'sent', sendAttemptNo: 2 });
    expect((p.sendAttempt as { recipients: string[] }).recipients).toEqual(['counselor']);
    // The packet summary covers every attempt: the student got attempt 1.
    expect(p.sentTo).toEqual(['member@example.test', COUNSELOR.email]);
    // Attempt 2 has only the counselor row and is terminal: a new (confirmed) attempt may start.
    expect((await send(id, { action: 'send_remaining' })).status).toBe(409);
    expect((await send(id, { action: 'email_again', confirmDuplicateTo: ['student', 'counselor'] })).status).toBe(200);
    expect(db.packets[0].sendAttemptNo).toBe(3);
  });

  it('a full resend without confirmation is refused naming who already has it; with a matching confirmation it goes', async () => {
    const id = await partiallyDelivered();
    const refused = await send(id, { action: 'email_again' });
    expect(refused.status).toBe(409);
    const body = await refused.json();
    expect(body.code).toBe('duplicate_confirmation_required');
    expect(body.deliveredTo).toEqual([expect.objectContaining({ recipient: 'student', email: 'member@example.test', attemptNo: 1 })]);
    expect((await send(id, { action: 'email_again', confirmDuplicateTo: ['counselor'] })).status).toBe(409); // must match exactly
    expect(mocks.send).not.toHaveBeenCalled();
    const ok = await send(id, { action: 'email_again', confirmDuplicateTo: ['student'] });
    expect(ok.status).toBe(200);
    expect(mocks.send.mock.calls.map((c) => c[1].to)).toEqual(['member@example.test', COUNSELOR.email]);
  });
});

describe('Pre-send visibility', () => {
  const send = (id: string, payload: Record<string, unknown> = {}) => sendPacket(req(payload), packetParams(id));
  const memberPdf = async (id: string) => {
    mocks.isAdmin.mockResolvedValue(false);
    mocks.getUser.mockResolvedValue({ id: MEMBER });
    const res = await packetPdf(new Request(`http://localhost/api/billing-packets/${id}/pdf?doc=j5`), packetParams(id));
    mocks.isAdmin.mockResolvedValue(true);
    mocks.getUser.mockResolvedValue({ id: ADMIN });
    return res.status;
  };

  it('a signed, unsent packet is hidden from the member and counselor (list and PDF) but visible to the admin', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    expect(await listPacketsForMember(MEMBER, 'member')).toEqual([]);
    expect(await listPacketsForMember(MEMBER, 'counselor')).toEqual([]);
    expect(await memberPdf(id)).toBe(404);
    const admin = await listAdminPackets(new Request('http://localhost/x'), params(MEMBER));
    expect((await admin.json()).packets.map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await send(id)).status).toBe(200);
    expect((await listPacketsForMember(MEMBER, 'member')).map((p) => p.id)).toEqual([id]);
    expect((await listPacketsForMember(MEMBER, 'counselor')).map((p) => p.id)).toEqual([id]);
    expect(await memberPdf(id)).toBe(200);
  });

  it('an ambiguous student copy counts as possibly received; a rejected counselor copy keeps it from the counselor', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(new Error('socket hang up'));
    expect((await send(id)).status).toBe(502);
    expect((await listPacketsForMember(MEMBER, 'member')).map((p) => p.id)).toEqual([id]);
    expect(await listPacketsForMember(MEMBER, 'counselor')).toEqual([]); // counselor copy closed, never attempted
  });
});

describe('Legacy and corrupt snapshots', () => {
  it('serialize sendBlockedReason, and supersede re-issues them with a fresh snapshot', async () => {
    const id = await signOne();
    const row = db.packets[0];
    expect(serializeBillingPacket(row as never).sendBlockedReason).toBeNull();
    row.signedSnapshot = { version: 1 };
    expect(serializeBillingPacket(row as never).sendBlockedReason).toBe('snapshot_corrupt');
    row.signedSnapshot = null;
    expect(serializeBillingPacket(row as never).sendBlockedReason).toBe('legacy_packet');
    const blocked = await sendPacket(req({}), packetParams(id));
    expect((await blocked.json()).code).toBe('legacy_packet');
    const res = await createPacket(req(body({ supersedesPacketId: id, supersedeReason: 'Re-issue with a snapshot' } as Partial<Body>)), params(MEMBER));
    expect(res.status).toBe(201);
    const replacement = (await res.json()).packet;
    expect(replacement.sendBlockedReason).toBeNull();
    expect(db.packets.find((p) => p.id === replacement.id)!.signedSnapshot).toEqual(expect.objectContaining({ version: 1 }));
    expect(db.packets.find((p) => p.id === id)!.status).toBe('superseded');
  });
});

describe('A new attempt never sends over an unacknowledged earlier copy', () => {
  const send = (id: string, payload: Record<string, unknown> = {}) => sendPacket(req(payload), packetParams(id));
  const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
  const DAY2 = 2 * 24 * 60 * 60 * 1000;
  const age = (r: Row) => Object.assign(r, { claimedAt: new Date(Date.now() - DAY2), lastClaimedAt: new Date(Date.now() - DAY2) });

  /** Attempt 1 unconfirmed then recorded "not delivered"; attempt 2 started and paused before its claim. */
  async function attempt2Paused(): Promise<{ id: string; old: Row; resume: () => Promise<Response> }> {
    const id = await signOne();
    mocks.send.mockRejectedValueOnce(new Error('socket hang up'));
    expect((await send(id)).status).toBe(502); // provider call 1
    const old = db.sends[0];
    age(old);
    expect((await send(id, { action: 'reconcile', recipient: 'student', delivered: false, note: 'No entry in the Resend log' })).status).toBe(200);
    let open!: () => void;
    mocks.buildGate.value = new Promise<void>((r) => (open = r));
    const pending = send(id, { action: 'email_again' });
    await tick();
    expect(db.sends.find((r) => r.attemptNo === 2)?.status).toBe('pending');
    return {
      id,
      old,
      resume: async () => {
        mocks.buildGate.value = null;
        open();
        return pending;
      },
    };
  }

  it('late acceptance for attempt 1 after attempt 2 started: attempt 2 does not send (409, one provider call total)', async () => {
    const { old, resume } = await attempt2Paused();
    await recordLateProviderResult(old.id, { delivered: true, detail: 'late', messageId: 'm-old' });
    const res = await resume();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('prior_copy_accepted');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(db.sends.find((r) => r.attemptNo === 2)).toMatchObject({ status: 'needs_reconciliation', lastError: expect.stringMatching(/earlier attempt/) });
  });

  it('the same through the unlocked fallback (provider result only, no status): still 409, still one provider call', async () => {
    const { old, resume } = await attempt2Paused();
    (prismaMock.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error('Transaction API error: timeout');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordLateProviderResult(old.id, { delivered: true, detail: 'late', messageId: 'm-old' });
    spy.mockRestore();
    expect(old).toMatchObject({ status: 'reconciled_not_delivered', providerMessageId: 'm-old' }); // status untouched by the fallback
    const res = await resume();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('prior_copy_accepted');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('a known delivered copy with an explicit confirmation still allows attempt 2 (one new provider call)', async () => {
    const id = await signOne();
    expect((await send(id)).status).toBe(200);
    const res = await send(id, { action: 'email_again', confirmDuplicateTo: ['student'] });
    expect(res.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const attempt = db.packets[0].sendAttempt as { acknowledgedDuplicates: Array<{ recipient: string; sendIds: string[]; confirmedById: string }> };
    expect(attempt.acknowledgedDuplicates).toEqual([
      expect.objectContaining({ recipient: 'student', sendIds: [db.sends.find((r) => r.attemptNo === 1)!.id], confirmedById: ADMIN }),
    ]);
  });

  it('mixed: the acknowledged student copy sends, the newly accepted counselor copy is blocked', async () => {
    db.counselor = COUNSELOR;
    const id = await signOne();
    mocks.send.mockImplementation(async (_r: unknown, a: { to: string }) => {
      if (a.to === COUNSELOR.email) throw new Error('socket hang up');
      return { data: { id: 'm-student-1' }, error: null };
    });
    expect((await send(id)).status).toBe(502); // calls 1 (student ok) and 2 (counselor unconfirmed)
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: 'm-2' }, error: null });
    const counselorOld = db.sends.find((r) => r.recipient === 'counselor')!;
    age(counselorOld);
    expect((await send(id, { action: 'reconcile', recipient: 'counselor', delivered: false, note: 'No entry in the Resend log' })).status).toBe(200);
    let open!: () => void;
    mocks.buildGate.value = new Promise<void>((r) => (open = r));
    const pending = send(id, { action: 'email_again', confirmDuplicateTo: ['student'] });
    await tick();
    await recordLateProviderResult(counselorOld.id, { delivered: true, detail: 'late', messageId: 'm-counselor-1' });
    mocks.buildGate.value = null;
    open();
    const res = await pending;
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json).toMatchObject({ code: 'prior_copy_accepted', recipient: 'counselor' });
    expect(mocks.send.mock.calls.map((c) => c[1].to)).toEqual(['member@example.test']); // only the acknowledged student copy
    expect(db.sends.find((r) => r.attemptNo === 2 && r.recipient === 'counselor')!.status).toBe('needs_reconciliation');
    expect(db.sends.find((r) => r.attemptNo === 2 && r.recipient === 'student')!.status).toBe('sent');
  });
});

describe('Stale counselor assignments (org transfer, deleted) count as no counselor', () => {
  const send = (id: string, payload: Record<string, unknown> = {}) => sendPacket(req(payload), packetParams(id));
  const counselorPdf = async (id: string) => {
    mocks.isAdmin.mockResolvedValue(false);
    mocks.getUser.mockResolvedValue({ id: COUNSELOR.id });
    const res = await packetPdf(new Request(`http://localhost/api/billing-packets/${id}/pdf?doc=j5`), packetParams(id));
    mocks.isAdmin.mockResolvedValue(true);
    mocks.getUser.mockResolvedValue({ id: ADMIN });
    return res.status;
  };

  for (const [label, stale] of [
    ['transferred to another org', { organizationId: OTHER_ORG }],
    ['deleted', { deletedAt: new Date() }],
  ] as const) {
    it(`a counselor ${label} after assignment: no PDF, not resolved at sign, send is 409 recipient_changed`, async () => {
      db.counselor = { ...COUNSELOR, organizationId: ORG };
      const id = await signOne();
      expect((await send(id)).status).toBe(200); // both copies reached them while valid
      expect(await counselorPdf(id)).toBe(200);
      const beforeCalls = mocks.send.mock.calls.length;
      Object.assign(db.counselor!, stale);
      // (a) PDF access is denied.
      expect(await counselorPdf(id)).toBe(404);
      // (b) A new packet sees no counselor.
      const second = await createPacket(req(body({ fundingAttestation: { reference: 'TEST-ITA-0077' } })), params(MEMBER));
      expect(second.status).toBe(201);
      const secondId = (await second.json()).packet.id as string;
      expect((db.packets.find((p) => p.id === secondId)!.signedSnapshot as { counselor: unknown }).counselor).toBeNull();
      // (c) Sending the packet signed with that counselor: recipient drift.
      const res = await send(id, { action: 'email_again', confirmDuplicateTo: ['student', 'counselor'] });
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('counselor_changed');
      expect(mocks.send.mock.calls.length).toBe(beforeCalls);
    });
  }
});
