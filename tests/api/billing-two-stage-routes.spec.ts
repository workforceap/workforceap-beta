// @vitest-environment node
/**
 * Two-stage J5/J6 billing API routes (M3): authorization order, default-off
 * gates, error copy after side effects, the bounded upload, the readiness
 * shape against #2706's keys, and the staff-only archive read path. Prisma,
 * Storage and email are fakes; no real provider or database is touched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const ORG = '00000000-0000-4000-8000-000000000001';
  const OTHER_ORG = '00000000-0000-4000-8000-0000000000ff';
  const ADMIN = 'a0000000-0000-4000-8000-000000000001';
  const MEMBER = 'b0000000-0000-4000-8000-000000000002';
  const CASE = 'c0000000-0000-4000-8000-000000000003';
  const state = {
    userOrg: new Map<string, string>(),
    cases: [] as Array<Record<string, unknown>>,
    attestations: [] as Array<Record<string, unknown>>,
    artifacts: [] as Array<Record<string, unknown>>,
    records: [] as Array<Record<string, unknown>>,
    receipt: [] as Array<Record<string, unknown>>,
    designated: null as null | { userId: string },
    auditCreate: null as null | (() => never),
  };
  return { ORG, OTHER_ORG, ADMIN, MEMBER, CASE, state };
});

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  auditLog: vi.fn(async () => undefined),
  archive: vi.fn(),
  readArchive: vi.fn(),
  txCreate: vi.fn(),
  receiptCreate: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/tenant/organization', () => ({
  DEFAULT_ORG_ID: h.ORG,
  getActorOrganizationId: async (id: string) => h.state.userOrg.get(id) ?? h.ORG,
  getSubjectOrganizationId: async (id: string) => {
    const org = h.state.userOrg.get(id);
    if (!org) throw new Error('no user');
    return org;
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/billing/packetAccess', () => ({ resolveAssignedCounselorContact: async () => ({ userId: 'u-c', fullName: 'Synthetic Counselor', email: 'counselor@example.test' }) }));
vi.mock('@/lib/email', () => ({ getResend: () => null }));
vi.mock('@/lib/email/send', () => ({
  FixtureRecipientSkippedError: class extends Error {},
  ResendResolvedSendError: class extends Error {},
  sendBrandedEmailOrThrowOnSkip: vi.fn(async () => {
    throw new Error('a test must never reach the provider');
  }),
}));
vi.mock('@/lib/billing/twoStage/storageArchive', () => ({
  FINANCE_ARCHIVE_KEY_SEGMENTS: { j5_signed_pdf: 'j5', j6_signed_pdf: 'j6', board_signed_voucher: 'voucher', board_invoice: 'board-invoice', external_j5_copy: 'external-j5' },
  archiveFinancePdf: mocks.archive,
  readFinanceArchivePdf: mocks.readArchive,
}));

function prismaFake() {
  type Key = 'attestations' | 'artifacts' | 'records' | 'receipt';
  const byCase = (key: Key) => async ({ where }: { where: Record<string, unknown> }) =>
    h.state[key].filter((r) => r.caseId === where.caseId && r.organizationId === where.organizationId);
  const db = {
    user: {
      findFirst: async ({ where }: { where: { id: string; organizationId: string } }) =>
        h.state.userOrg.get(where.id) === where.organizationId ? { id: where.id, organizationId: where.organizationId, fullName: 'Synthetic Student', email: 'student@example.test' } : null,
      findMany: async () => [],
    },
    billingCase: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        h.state.cases.find((c) => Object.entries(where).every(([k, v]) => c[k] === v)) ?? null,
      findMany: async () => h.state.cases,
      create: mocks.txCreate,
    },
    billingAttestation: { findMany: byCase('attestations') },
    billingArtifact: {
      findMany: byCase('artifacts'),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => h.state.artifacts.find((a) => a.id === where.id && a.caseId === where.caseId && a.organizationId === where.organizationId) ?? null,
    },
    billingStageRecord: { findMany: byCase('records') },
    billingPaymentEvent: { findMany: async () => [] },
    billingVoucherReceiptSignature: {
      findMany: byCase('receipt'),
      // The database stamps attested_at (M1 877466f); the fake does the same.
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mocks.receiptCreate(data);
        const row = { ...data, id: 'rs-new', representationArtifactId: null, representationSha256: null, attestedAt: new Date('2026-09-29T18:00:00Z') };
        h.state.receipt.push(row);
        return row;
      },
    },
    billingDesignatedSigner: { findFirst: async () => h.state.designated },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db;
}
vi.mock('@/lib/db/prisma', () => ({ prisma: prismaFake() }));
vi.mock('@/lib/tenant/withTenantScope', async () => {
  const { prisma } = await import('@/lib/db/prisma');
  return { withTenantScope: async (_org: string, fn: (db: unknown) => Promise<unknown>) => fn(prisma) };
});

import { GET as listCases, POST as openCase } from '@/app/api/admin/members/[id]/billing/two-stage/cases/route';
import { GET as caseSummary } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/route';
import { GET as downloadFile } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/files/[artifactId]/route';
import { POST as uploadVoucher } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/voucher/route';
import { POST as sign } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/[stage]/sign/route';
import { POST as send } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/[stage]/send/route';
import { GET as receiptStatement, POST as receiptAttest } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/voucher/[artifactId]/receipt-attestation/route';
import { J5_READINESS_KEYS, J6_READINESS_KEYS, type ApiErrorBody, type CaseSummaryDto, type ReadinessKey } from '@/lib/billing/twoStage/dto';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';

const ORIGIN = 'http://localhost';
const base = `${ORIGIN}/api/admin/members/${h.MEMBER}/billing/two-stage/cases`;

function jsonReq(url: string, body: unknown, headers: Record<string, string> = { origin: ORIGIN }) {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
const memberParams = () => ({ params: Promise.resolve({ id: h.MEMBER }) });
const caseParams = <T extends object>(extra: T = {} as T) => ({ params: Promise.resolve({ id: h.MEMBER, caseId: h.CASE, ...extra }) });

const GATE_ENV = ['BILLING_TWO_STAGE_MIGRATION_APPLIED', 'BILLING_EXECUTIVE_SIGNER_USER_ID', 'BILLING_TWO_STAGE_EMAIL_ENABLED', 'BILLING_PACKET_PROVIDER_ORG_ID'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of GATE_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.BILLING_TWO_STAGE_MIGRATION_APPLIED = 'true';
  h.state.userOrg = new Map([
    [h.ADMIN, h.ORG],
    [h.MEMBER, h.ORG],
  ]);
  h.state.cases = [{ id: h.CASE, organizationId: h.ORG, memberId: h.MEMBER, subjectMemberId: h.MEMBER, programSlug: 'data-analytics-professional-certificate-google', createdBySubjectId: h.ADMIN, createdAt: new Date('2026-09-20T15:00:00Z') }];
  h.state.attestations = [];
  h.state.artifacts = [];
  h.state.records = [];
  h.state.receipt = [];
  h.state.designated = null;
  mocks.getUser.mockResolvedValue({ id: h.ADMIN });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.archive.mockReset();
  mocks.readArchive.mockReset();
  mocks.txCreate.mockReset();
  mocks.receiptCreate.mockReset();
});

afterEach(() => {
  for (const k of GATE_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('two-stage routes: authorization and request checks', () => {
  it('every route is closed with 503 MIGRATION_NOT_APPLIED by default, before auth or any read', async () => {
    delete process.env.BILLING_TWO_STAGE_MIGRATION_APPLIED;
    const res = await listCases(new Request(base), memberParams());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'MIGRATION_NOT_APPLIED' });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('refuses a mutation without a same-site Origin (403 ORIGIN_REJECTED) before auth', async () => {
    const cases: Array<Record<string, string>> = [{}, { origin: 'https://evil.example' }, { origin: ORIGIN, 'sec-fetch-site': 'cross-site' }];
    for (const headers of cases) {
      const res = await openCase(jsonReq(base, { programSlug: 'x' }, headers), memberParams());
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('ORIGIN_REJECTED');
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it('401 unauthenticated, 403 for a non-admin (member role)', async () => {
    mocks.getUser.mockResolvedValueOnce(null);
    expect((await listCases(new Request(base), memberParams())).status).toBe(401);
    mocks.isAdmin.mockResolvedValueOnce(false);
    const res = await listCases(new Request(base), memberParams());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ADMIN_REQUIRED');
  });

  it('an admin of another tenant sees the member as not found', async () => {
    h.state.userOrg.set(h.ADMIN, h.OTHER_ORG);
    const res = await caseSummary(new Request(`${base}/${h.CASE}`), caseParams());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('MEMBER_NOT_FOUND');
  });

  it('a member outside the training-provider organization is refused (403 PROVIDER_ORG_ONLY)', async () => {
    h.state.userOrg.set(h.ADMIN, h.OTHER_ORG);
    h.state.userOrg.set(h.MEMBER, h.OTHER_ORG);
    const res = await listCases(new Request(base), memberParams());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PROVIDER_ORG_ONLY');
  });

  it("a case of another member is not found (case ownership)", async () => {
    h.state.cases[0].memberId = 'someone-else';
    const res = await caseSummary(new Request(`${base}/${h.CASE}`), caseParams());
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('CASE_NOT_FOUND');
  });
});

describe('two-stage routes: sign and send are hard-disabled', () => {
  const signBody = { recordId: 'r', version: 1, contentSha256: 'a'.repeat(64), intentConfirmed: true, intentText: 'x' };

  it('sign: 503 SIGNER_NOT_CONFIGURED by default, then 503 SIGNED_RENDERER_UNAVAILABLE once a signer id is set', async () => {
    let res = await sign(jsonReq(`${base}/${h.CASE}/j5/sign`, signBody), caseParams({ stage: 'j5' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SIGNER_NOT_CONFIGURED');
    process.env.BILLING_EXECUTIVE_SIGNER_USER_ID = h.ADMIN;
    res = await sign(jsonReq(`${base}/${h.CASE}/j5/sign`, signBody), caseParams({ stage: 'j5' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SIGNED_RENDERER_UNAVAILABLE');
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it('send: 503 EMAIL_NOT_ENABLED by default; J6 then 503 SIGNER_PRINCIPAL_UNSET with no designated signer', async () => {
    let res = await send(jsonReq(`${base}/${h.CASE}/j5/send`, { recordId: 'r', versionHash: 'a'.repeat(64) }), caseParams({ stage: 'j5' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('EMAIL_NOT_ENABLED');
    process.env.BILLING_TWO_STAGE_EMAIL_ENABLED = 'true';
    res = await send(jsonReq(`${base}/${h.CASE}/j6/send`, { recordId: 'r', versionHash: 'a'.repeat(64) }), caseParams({ stage: 'j6' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SIGNER_PRINCIPAL_UNSET');
    expect(mocks.readArchive).not.toHaveBeenCalled();
  });

  it('an unknown stage is 404 NOT_FOUND', async () => {
    process.env.BILLING_EXECUTIVE_SIGNER_USER_ID = h.ADMIN;
    const res = await sign(jsonReq(`${base}/${h.CASE}/j7/sign`, signBody), caseParams({ stage: 'j7' }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('NOT_FOUND');
  });

  it("the receipt attestation is closed until a signer principal is designated, and refuses anyone else", async () => {
    let res = await receiptAttest(jsonReq(`${base}/${h.CASE}/voucher/v1/receipt-attestation`, {}), caseParams({ artifactId: 'v1' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SIGNER_PRINCIPAL_UNSET');
    h.state.designated = { userId: 'michael-user' };
    res = await receiptAttest(jsonReq(`${base}/${h.CASE}/voucher/v1/receipt-attestation`, {}), caseParams({ artifactId: 'v1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('VOUCHER_ATTESTER_NOT_DESIGNATED');
  });

  it('the receipt attestation needs the designated-signer row and the env signer to name the same account (fail closed)', async () => {
    h.state.designated = { userId: h.ADMIN };
    // Row names the caller, env signer unset: refused.
    let res = await receiptAttest(jsonReq(`${base}/${h.CASE}/voucher/v1/receipt-attestation`, {}), caseParams({ artifactId: 'v1' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SIGNER_NOT_CONFIGURED');
    // Row names the caller, env names someone else: refused, never "pick the row".
    process.env.BILLING_EXECUTIVE_SIGNER_USER_ID = 'b0000000-0000-4000-8000-000000000999';
    res = await receiptAttest(jsonReq(`${base}/${h.CASE}/voucher/v1/receipt-attestation`, {}), caseParams({ artifactId: 'v1' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('NOT_SIGNER');
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it('the designated signer attests the exact file with a Prisma create that leaves attested_at to the database', async () => {
    h.state.designated = { userId: h.ADMIN };
    process.env.BILLING_EXECUTIVE_SIGNER_USER_ID = h.ADMIN;
    const sha = 'b'.repeat(64);
    h.state.artifacts = [{ id: 'v1', organizationId: h.ORG, caseId: h.CASE, kind: 'board_signed_voucher', source: 'uploaded', fileName: 'v.pdf', mimeType: 'application/pdf', byteLength: 5, sha256: sha, storageBucket: 'billing-finance', storageKey: 'k', createdBySubjectId: h.ADMIN, createdAt: new Date('2026-09-29T15:00:00Z') }];
    h.state.attestations = [{ id: 'att-voucher', organizationId: h.ORG, caseId: h.CASE, kind: 'voucher_board_signed', artifactId: 'v1', voucherReference: 'SYNTH-PO-001', attestedBySubjectId: h.ADMIN, attestedAt: new Date('2026-09-29T16:00:00Z') }];
    const url = `${base}/${h.CASE}/voucher/v1/receipt-attestation`;
    const statement = await receiptStatement(new Request(url), caseParams({ artifactId: 'v1' }));
    expect(statement.status).toBe(200);
    const { statementText } = (await statement.json()) as { statementText: string };
    const res = await receiptAttest(jsonReq(url, { expectedSha256: sha, method: 'present_on_original', statementConfirmed: true, statementText }), caseParams({ artifactId: 'v1' }));
    expect(res.status).toBe(201);
    expect(mocks.receiptCreate).toHaveBeenCalledTimes(1);
    const data = mocks.receiptCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(data).toEqual({ organizationId: h.ORG, caseId: h.CASE, voucherArtifactId: 'v1', voucherSha256: sha, attestedByUserId: h.ADMIN, method: 'present_on_original', statement: statementText });
    expect('attestedAt' in data).toBe(false);
    const body = (await res.json()) as { receiptAttestation: { attestationId: string; sha256: string; attestedAt: string } };
    expect(body.receiptAttestation).toMatchObject({ attestationId: 'rs-new', sha256: sha, attestedAt: '2026-09-29T18:00:00.000Z' });
  });
});

describe('two-stage routes: uploads', () => {
  it('refuses an oversized upload from Content-Length before reading the body', async () => {
    let pulled = false;
    const stream = new ReadableStream(
      {
        pull() {
          pulled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const req = new Request(`${base}/${h.CASE}/voucher`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(4 * 1024 * 1024 + 1) },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const res = await uploadVoucher(req, caseParams());
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('PAYLOAD_TOO_LARGE');
    expect(pulled).toBe(false);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it('stops reading a body without Content-Length as soon as it passes 4 MiB', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let chunks = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunks += 1;
        controller.enqueue(chunk);
        if (chunks > 20) controller.close();
      },
    });
    const req = new Request(`${base}/${h.CASE}/voucher`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'multipart/form-data; boundary=x' }, body: stream, duplex: 'half' } as RequestInit);
    const res = await uploadVoucher(req, caseParams());
    expect(res.status).toBe(413);
    expect(chunks).toBeLessThanOrEqual(6);
  });

  function form(file: Blob, name: string) {
    const f = new FormData();
    f.set('file', file, name);
    return new Request(`${base}/${h.CASE}/voucher`, { method: 'POST', headers: { origin: ORIGIN }, body: f });
  }

  it('accepts only a PDF voucher: JPEG, PNG and a renamed non-PDF are refused before storage (415 VOUCHER_PDF_ONLY)', async () => {
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], { type: 'image/jpeg' });
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], { type: 'image/png' });
    const renamed = new Blob([new TextEncoder().encode('not a pdf at all')], { type: 'application/pdf' });
    const pdfMagicWrongType = new Blob([new TextEncoder().encode('%PDF-1.7 synthetic')], { type: 'image/png' });
    for (const [blob, name] of [[jpeg, 'voucher.jpg'], [png, 'voucher.png'], [renamed, 'voucher.pdf'], [pdfMagicWrongType, 'voucher.pdf']] as const) {
      const res = await uploadVoucher(form(blob, name), caseParams());
      expect(res.status, name).toBe(415);
      const b = await res.json();
      expect(b.code).toBe('VOUCHER_PDF_ONLY');
      expect(b.error).toBe('Upload the signed voucher as a PDF.');
    }
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it('after a storage write, an unexpected failure says the outcome is uncertain (never "nothing was signed or sent")', async () => {
    mocks.archive.mockResolvedValueOnce({ ref: { caseId: h.CASE, kind: 'board_signed_voucher', bucket: 'billing-finance', key: 'k', sha256: 'x', byteLength: 1, mimeType: 'application/pdf' }, reused: false });
    const pdf = new Blob([new TextEncoder().encode('%PDF-1.7 synthetic voucher')], { type: 'application/pdf' });
    const res = await uploadVoucher(form(pdf, 'voucher.pdf'), caseParams());
    // The fake archive answered with another hash: an integrity failure after the write.
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('ARCHIVE_INTEGRITY_MISMATCH');

    mocks.archive.mockRejectedValueOnce(new TypeError('socket closed'));
    const res2 = await uploadVoucher(form(pdf, 'voucher.pdf'), caseParams());
    expect(res2.status).toBe(500);
    const b = await res2.json();
    expect(b.code).toBe('OUTCOME_UNCERTAIN');
    expect(b.error).toMatch(/not known/u);
    expect(b.error).not.toMatch(/nothing was (signed or )?sent/iu);
  });

  it('before any side effect, an unexpected failure is INTERNAL_ERROR ("before anything was changed")', async () => {
    mocks.isSuperAdmin.mockRejectedValueOnce(new Error('db down'));
    const res = await listCases(new Request(base), memberParams());
    expect(res.status).toBe(500);
    const b = await res.json();
    expect(b.code).toBe('INTERNAL_ERROR');
    expect(b.error).toMatch(/before anything was changed/u);
  });
});

describe('two-stage routes: case summary readiness and the staff-only archive', () => {
  it('returns #2706 readiness keys only, with the receiving signature false until the designated signer attests the exact file', async () => {
    h.state.attestations = [
      {
        id: 'att-ready', organizationId: h.ORG, caseId: h.CASE, kind: 'j5_readiness', statement: 's', evidenceReference: 'e',
        classStartDate: new Date('2026-09-30T00:00:00Z'), classEndDate: null, artifactId: null, voucherReference: null, authorizedAmountCents: null,
        authorizedStartDate: null, authorizedEndDate: null, receivedOn: null, receivingSignaturePresent: null, externalReference: null, externalQuoteDate: null,
        quotedProgramSlug: null, quotedClassName: null, authorizedProgramSlug: null, authorizedClassName: null, studentReadyConfirmed: true,
        counselorRequestedBy: 'Synthetic Counselor', counselorRequestedOn: new Date('2026-09-19T00:00:00Z'), counselorRequestReference: 'email', attestedBySubjectId: h.ADMIN, attestedAt: new Date('2026-09-20T16:00:00Z'),
      },
      {
        id: 'att-voucher', organizationId: h.ORG, caseId: h.CASE, kind: 'voucher_board_signed', statement: 's', evidenceReference: 'e',
        classStartDate: null, classEndDate: null, artifactId: 'v1', voucherReference: 'SYNTH-PO-001', authorizedAmountCents: 750000,
        authorizedStartDate: new Date('2026-09-30T00:00:00Z'), authorizedEndDate: new Date('2027-02-28T00:00:00Z'), receivedOn: new Date('2026-09-29T00:00:00Z'),
        // The staff flag is true, and must not satisfy Michael's receiving signature.
        receivingSignaturePresent: true, externalReference: null, externalQuoteDate: null, quotedProgramSlug: null, quotedClassName: null,
        authorizedProgramSlug: 'data-analytics-professional-certificate-google', authorizedClassName: 'x', studentReadyConfirmed: null,
        counselorRequestedBy: null, counselorRequestedOn: null, counselorRequestReference: null, attestedBySubjectId: h.ADMIN, attestedAt: new Date('2026-09-29T16:00:00Z'),
      },
    ];
    h.state.artifacts = [
      { id: 'v1', organizationId: h.ORG, caseId: h.CASE, kind: 'board_signed_voucher', source: 'uploaded', fileName: 'voucher.pdf', mimeType: 'application/pdf', byteLength: 10, sha256: 'b'.repeat(64), storageBucket: 'billing-finance', storageKey: 'k', createdBySubjectId: h.ADMIN, createdAt: new Date('2026-09-29T15:00:00Z') },
    ];
    const res = await caseSummary(new Request(`${base}/${h.CASE}`), caseParams());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res.json()) as CaseSummaryDto;
    const allowed = new Set<string>([...J5_READINESS_KEYS, ...J6_READINESS_KEYS]);
    for (const key of Object.keys(body.readiness)) expect(allowed.has(key), key).toBe(true);
    expect(Object.values(body.readiness).every((v) => typeof v === 'boolean')).toBe(true);
    expect(body.readiness.studentApprovedAndReady).toBe(true);
    expect(body.readiness.counselorRequestedQuote).toBe(true);
    const j6 = body.readinessByStage.j6 as Partial<Record<ReadinessKey, boolean>>;
    expect(j6.originalVoucherHashVerified).toBe(true);
    expect(j6.michaelReceivingSignatureAttested).toBe(false);
    expect(body.j6.blockers.map((b) => b.code)).toContain('RECEIVING_SIGNATURE_NOT_ATTESTED');
    // Staff uploaded and the voucher data exists: only Michael's receiving signature is outstanding, and it says so.
    expect(body.j6.blockers.find((b) => b.code === 'RECEIVING_SIGNATURE_NOT_ATTESTED')?.waitingOn).toBe('designated_signer');
    expect(body.readinessWaitingOn).toEqual({ michaelReceivingSignatureAttested: 'designated_signer' });
    expect(body.waitingOnDesignatedSigner).toEqual([
      expect.objectContaining({ step: 'voucher_receipt_signature', artifactId: 'v1', sha256: 'b'.repeat(64), readinessKeys: ['michaelReceivingSignatureAttested'], ready: false, viewerIsDesignatedSigner: false }),
    ]);
    expect(body.viewer.isDesignatedSigner).toBe(false);
    expect(body.gates.receiptSignaturePrincipal).toMatchObject({ enabled: false, code: 'SIGNER_PRINCIPAL_UNSET' });
    expect(body.gates.signing.enabled).toBe(false);
    // The summary never calls Storage: the archive gate is unknown, not closed.
    expect(body.gates.financeArchive).toMatchObject({ enabled: null, code: null });
    expect(body.j6.blockers.some((b) => b.code === 'FINANCE_ARCHIVE_UNAVAILABLE')).toBe(false);
    expect(body.gates.realEmail.enabled).toBe(false);
    expect(body.j6.voucher?.artifact.downloadPath).toBe(`/api/admin/members/${h.MEMBER}/billing/two-stage/cases/${h.CASE}/files/v1`);
    expect(JSON.stringify(body)).not.toMatch(/https?:\/\/|token=|signedUrl/u);

    // The designated signer's attestation on the exact hash flips it; one on other bytes does not.
    h.state.designated = { userId: 'michael-user' };
    h.state.receipt = [{ id: 'rs-1', organizationId: h.ORG, caseId: h.CASE, voucherArtifactId: 'v1', voucherSha256: 'c'.repeat(64), attestedByUserId: 'michael-user', method: 'present_on_original', representationArtifactId: null, representationSha256: null, statement: 's', attestedAt: new Date('2026-09-29T17:00:00Z') }];
    let again = (await (await caseSummary(new Request(`${base}/${h.CASE}`), caseParams())).json()) as CaseSummaryDto;
    expect(again.readinessByStage.j6.michaelReceivingSignatureAttested).toBe(false);
    h.state.receipt[0].voucherSha256 = 'b'.repeat(64);
    again = (await (await caseSummary(new Request(`${base}/${h.CASE}`), caseParams())).json()) as CaseSummaryDto;
    expect(again.readinessByStage.j6.michaelReceivingSignatureAttested).toBe(true);
    expect(again.j6.voucher?.receiptAttestation?.attestationId).toBe('rs-1');
    expect(again.waitingOnDesignatedSigner).toEqual([]);
    expect(again.readinessWaitingOn).toEqual({});
    expect(again.j6.blockers.some((b) => b.waitingOn)).toBe(false);

    // A replacement voucher clears it.
    h.state.artifacts.push({ ...h.state.artifacts[0], id: 'v2', sha256: 'd'.repeat(64), createdAt: new Date('2026-09-30T15:00:00Z') });
    again = (await (await caseSummary(new Request(`${base}/${h.CASE}`), caseParams())).json()) as CaseSummaryDto;
    expect(again.j6.voucher?.artifact.id).toBe('v2');
    expect(again.j6.voucher?.receiptAttestation).toBeNull();
    expect(again.readinessByStage.j6.michaelReceivingSignatureAttested).toBe(false);
    // The new file waits on Michael twice, in order: its voucher data, then his receiving signature on its hash.
    expect(again.waitingOnDesignatedSigner.map((t) => [t.step, t.artifactId, t.ready])).toEqual([
      ['voucher_data', 'v2', true],
      ['voucher_receipt_signature', 'v2', false],
    ]);
    expect(again.readinessWaitingOn).toEqual({
      voucherReferenceAndReceivedDateVerified: 'designated_signer',
      voucherTermsVerified: 'designated_signer',
      michaelReceivingSignatureAttested: 'designated_signer',
    });
    expect(again.j6.blockers.filter((b) => b.waitingOn === 'designated_signer').map((b) => b.code).sort()).toEqual(['J6_VOUCHER_ATTESTATION_INCOMPLETE', 'RECEIVING_SIGNATURE_NOT_ATTESTED']);
    // The voucher-data blocker names who must act, never reads like a staff task.
    const dataBlocker = again.j6.blockers.find((b) => b.code === 'J6_VOUCHER_ATTESTATION_INCOMPLETE')!;
    expect(dataBlocker.message).toMatch(/^Waiting on Michael A\. Brown/u);
    expect(dataBlocker.message).not.toMatch(/^Confirm the uploaded/u);
  });

  it('archive files are readable only through the admin route: a member-role account and another tenant never reach Storage', async () => {
    h.state.artifacts = [{ id: 'v1', organizationId: h.ORG, caseId: h.CASE, kind: 'board_signed_voucher', source: 'uploaded', fileName: 'v.pdf', mimeType: 'application/pdf', byteLength: 5, sha256: 'b'.repeat(64), storageBucket: 'billing-finance', storageKey: `cases/${h.CASE}/voucher/${'b'.repeat(64)}.pdf`, createdBySubjectId: h.ADMIN, createdAt: new Date() }];
    const url = `${base}/${h.CASE}/files/v1`;
    mocks.isAdmin.mockResolvedValueOnce(false);
    expect((await downloadFile(new Request(url), caseParams({ artifactId: 'v1' }))).status).toBe(403);
    h.state.userOrg.set(h.ADMIN, h.OTHER_ORG);
    expect((await downloadFile(new Request(url), caseParams({ artifactId: 'v1' }))).status).toBe(404);
    expect(mocks.readArchive).not.toHaveBeenCalled();

    h.state.userOrg.set(h.ADMIN, h.ORG);
    mocks.readArchive.mockResolvedValueOnce(new TextEncoder().encode('%PDF-'));
    const ok = await downloadFile(new Request(url), caseParams({ artifactId: 'v1' }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('application/pdf');
    expect(ok.headers.get('x-billing-sha256')).toBe('b'.repeat(64));
    expect(ok.headers.get('location')).toBeNull();
  });
});

describe('two-stage routes: a billing-rule refusal after a committed step is not a clean refusal', () => {
  const refusal = () => Object.assign(new Error('VOUCHER_RECEIPT_SIGNATURE_UNATTESTED: a J6 is sent only with a valid receipt-signature attestation on its voucher'), { code: '23514' });
  const run = (fn: Parameters<typeof twoStageRoute>[2]) => twoStageRoute('test', { mutation: true, caseRoute: true }, fn)(jsonReq(`${base}/${h.CASE}/j6/send`, {}), caseParams());

  it('with nothing kept yet, keeps the named refusal and its plain copy', async () => {
    const res = await run(async (ctx) => {
      ctx.effects.mark();
      throw refusal();
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.code).toBe('VOUCHER_RECEIPT_SIGNATURE_UNATTESTED');
    expect(body.outcomeUncertain).toBeUndefined();
  });

  it('after a committed step (a copy sent, a reconcile committed), says the outcome is uncertain and to reconcile first', async () => {
    const res = await run(async (ctx) => {
      ctx.effects.committed();
      throw refusal();
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.code).toBe('VOUCHER_RECEIPT_SIGNATURE_UNATTESTED');
    expect(body.outcomeUncertain).toBe(true);
    expect(body.error).toMatch(/copies may already have been sent/u);
    expect(body.error).toMatch(/reconcile/u);
    const unnamed = await run(async (ctx) => {
      ctx.effects.committed();
      throw Object.assign(new Error('some other rule'), { code: '23514' });
    });
    expect(((await unnamed.json()) as ApiErrorBody)).toMatchObject({ code: 'BILLING_RULE_REFUSED', outcomeUncertain: true });
  });
});
