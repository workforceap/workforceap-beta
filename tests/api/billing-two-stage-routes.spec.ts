// @vitest-environment node
/**
 * Two-stage J5/J6 billing API routes (M3): authorization order, default-off
 * gates, error copy after side effects, the bounded upload, the readiness
 * shape against #2706's keys, and the staff-only archive read path. Prisma,
 * Storage and email are fakes; no real provider or database is touched.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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
    signatureAssets: [] as Array<Record<string, unknown>>,
    payments: [] as Array<Record<string, unknown>>,
    auditCreate: null as null | (() => never),
    failBillingReads: false,
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
  transaction: vi.fn(),
  receiptCreate: vi.fn(),
  storeSignature: vi.fn(),
  readSignature: vi.fn(),
  signatureCreate: vi.fn(),
  signatureRevoke: vi.fn(),
  artifactCreate: vi.fn(),
  emailSend: vi.fn(async () => { throw new Error('a test must never reach the provider'); }),
  recordUpdate: vi.fn(async (_args: unknown): Promise<{ count: number }> => ({ count: 0 })),
  paymentCreate: vi.fn(async (_args: unknown): Promise<unknown> => ({ id: 'pay-new' })),
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
  sendBrandedEmailOrThrowOnSkip: mocks.emailSend,
}));
vi.mock('@/lib/billing/twoStage/storageArchive', () => ({
  FINANCE_ARCHIVE_KEY_SEGMENTS: { j5_signed_pdf: 'j5', j6_signed_pdf: 'j6', board_signed_voucher: 'voucher', board_invoice: 'board-invoice', external_j5_copy: 'external-j5' },
  archiveFinancePdf: mocks.archive,
  readFinanceArchivePdf: mocks.readArchive,
}));
vi.mock('@/lib/billing/twoStage/signatureStorage', () => ({
  storeSignaturePng: mocks.storeSignature,
  readSignaturePng: mocks.readSignature,
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
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (h.state.failBillingReads) throw new Error('billing schema must not be read');
        return h.state.cases.find((c) => Object.entries(where).every(([k, v]) => c[k] === v)) ?? null;
      },
      findMany: async () => h.state.cases,
      create: mocks.txCreate,
    },
    billingAttestation: { findMany: byCase('attestations') },
    billingSignerSignatureAsset: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => h.state.signatureAssets.filter((a) => a.organizationId === where.organizationId),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mocks.signatureCreate(data);
        // uploaded_at / approved_at are stamped by the database trigger.
        const row = { ...data, id: 'sig-new', uploadedAt: new Date('2026-09-29T18:00:00Z'), approvedAt: new Date('2026-09-29T18:00:00Z'), revokedAt: null };
        h.state.signatureAssets.push(row);
        return row;
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        mocks.signatureRevoke(args);
        const row = h.state.signatureAssets.find((a) => a.id === args.where.id && a.revokedAt === null);
        if (!row) return { count: 0 };
        Object.assign(row, args.data, { revokedAt: new Date('2026-09-29T18:00:00Z') });
        return { count: 1 };
      },
    },
    billingArtifact: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mocks.artifactCreate(data);
        return { ...data, id: 'art-signed', createdAt: new Date('2026-09-29T18:00:00Z') };
      },
      findMany: byCase('artifacts'),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => h.state.artifacts.find((a) => a.id === where.id && a.caseId === where.caseId && a.organizationId === where.organizationId) ?? null,
    },
    billingStageRecord: {
      findMany: byCase('records'),
      updateMany: (args: unknown) => mocks.recordUpdate(args),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => h.state.records.find((r) => r.id === where.id) ?? null,
    },
    billingPaymentEvent: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => h.state.payments.filter((r) => r.caseId === where.caseId && r.organizationId === where.organizationId),
      create: (args: unknown) => mocks.paymentCreate(args),
    },
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
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => { mocks.transaction(); return fn(db); },
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
import { GET as previewDraft } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/[stage]/draft/preview/route';
import { POST as reviewDraftRoute } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/[stage]/draft/review/route';
import { GET as memberPreviewGet, POST as memberPreviewPost } from '@/app/api/admin/members/[id]/billing/two-stage/[stage]/preview/route';
import { POST as uploadVoucher } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/voucher/route';
import { POST as sign } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/[stage]/sign/route';
import { POST as send } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/[stage]/send/route';
import { GET as receiptStatement, POST as receiptAttest } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/voucher/[artifactId]/receipt-attestation/route';
import { J5_READINESS_KEYS, J6_READINESS_KEYS, type ApiErrorBody, type CaseSummaryDto, type ReadinessKey } from '@/lib/billing/twoStage/dto';
import { namedRefusal, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { POST as closeRoute } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/[stage]/versions/[recordId]/close/route';
import { POST as paymentReceivedRoute } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/payment/received/route';
import { POST as freeze } from '@/app/api/admin/members/[id]/billing/two-stage/cases/[caseId]/[stage]/freeze/route';
import { GET as signatureGet, POST as signaturePost } from '@/app/api/admin/members/[id]/billing/two-stage/signature/route';
import type { Attestation } from '@/lib/billing/twoStage/attestations';
import { contentSha256, sha256Hex } from '@/lib/billing/twoStage/canonical';
import { buildJ5Content, recipientRowsForContent } from '@/lib/billing/twoStage/content';
import { WAP_LOGO_PUBLIC_PATH } from '@/lib/billing/twoStage/letterhead';
import { inspectSignaturePng, signatureApprovalStatement } from '@/lib/billing/twoStage/signatureAsset';
import { RendererAdapterError, renderDraftFromContent } from '@/lib/billing/twoStage/rendererAdapter';
import { adapterError } from '@/lib/billing/twoStage/api/documents';
import { ApiError } from '@/lib/billing/twoStage/api/http';
import { signerIntentStatement } from '@/lib/billing/twoStage/signing';
import { syntheticPng } from '../fixtures/billing/syntheticPng';

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
  h.state.signatureAssets = [];
  h.state.payments = [];
  h.state.failBillingReads = false;
  mocks.getUser.mockResolvedValue({ id: h.ADMIN });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.archive.mockReset();
  mocks.readArchive.mockReset();
  mocks.txCreate.mockReset();
  mocks.transaction.mockReset();
  mocks.receiptCreate.mockReset();
  mocks.recordUpdate.mockReset();
  mocks.recordUpdate.mockImplementation(async () => ({ count: 0 }));
  mocks.paymentCreate.mockReset();
  mocks.paymentCreate.mockImplementation(async () => ({ id: 'pay-new' }));
  mocks.storeSignature.mockReset();
  mocks.readSignature.mockReset();
  mocks.signatureCreate.mockReset();
  mocks.signatureRevoke.mockReset();
  mocks.artifactCreate.mockReset();
});

afterEach(() => {
  for (const k of GATE_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('two-stage routes: authorization and request checks', () => {
  it('operational routes are closed with 503 MIGRATION_NOT_APPLIED by default, before auth or any read', async () => {
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

describe('member document previews: incomplete information is allowed without issuing anything', () => {
  const url = (stage = 'j5', query = '') => `${ORIGIN}/api/admin/members/${h.MEMBER}/billing/two-stage/${stage}/preview${query}`;
  const params = (stage = 'j5') => ({ params: Promise.resolve({ id: h.MEMBER, stage }) });
  async function pdfText(response: Response) {
    expect(response.status).toBe(200);
    const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), useSystemFonts: true, disableFontFace: true }).promise;
    try {
      expect(pdf.numPages).toBe(1);
      return (await (await pdf.getPage(1)).getTextContent()).items.flatMap((item) => 'str' in item ? [item.str] : []).join(' ');
    } finally { await pdf.destroy(); }
  }

  it('renders GET and POST for both stages without cases, enrollments, readiness, or an enabled billing schema', async () => {
    delete process.env.BILLING_TWO_STAGE_MIGRATION_APPLIED;
    h.state.cases = [];
    h.state.failBillingReads = true;
    const auditCalls = mocks.auditLog.mock.calls.length;
    const emailCalls = mocks.emailSend.mock.calls.length;
    for (const stage of ['j5', 'j6']) {
      const get = await memberPreviewGet(new Request(url(stage, '?download=1')), params(stage));
      expect(get.headers.get('content-type')).toBe('application/pdf');
      expect(get.headers.get('content-disposition')).toBe(`attachment; filename="${stage.toUpperCase()}-PREVIEW.pdf"`);
      expect(get.headers.get('x-billing-document-mode')).toBe('preview');
      expect(get.headers.get('cache-control')).toContain('no-store');
      expect(get.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
      const getText = await pdfText(get);
      expect(getText).toContain('PREVIEW - NOT SIGNED');
      expect(getText).toContain('Synthetic Student');
      expect(getText).toContain('[Not provided]');
      expect(getText).toContain('no program enrollment is recorded');
      expect(getText).not.toMatch(/160 hours|September 30|2027|SYNTH-PO/);
      const post = await memberPreviewPost(jsonReq(url(stage), {
        student: { name: 'Typed Student', email: '' }, counselor: { name: 'Typed Counselor', email: '', phone: '' },
        finance: { name: 'Typed Finance', email: '' }, boardName: '',
      }), params(stage));
      expect(post.headers.get('content-disposition')).toContain('inline');
      const postText = await pdfText(post);
      expect(postText).toContain('Typed Student');
      expect(postText).not.toContain('student@example.test');
      expect(postText).toContain(stage === 'j5' ? 'Typed Counselor' : 'Typed Finance');
      if (stage === 'j6') expect(postText).toContain('not a payment request');
    }
    for (const mock of [mocks.transaction, mocks.txCreate, mocks.recordUpdate, mocks.artifactCreate, mocks.receiptCreate, mocks.signatureCreate,
      mocks.signatureRevoke, mocks.storeSignature, mocks.readSignature, mocks.archive, mocks.readArchive, mocks.paymentCreate]) expect(mock).not.toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledTimes(auditCalls);
    expect(mocks.emailSend).toHaveBeenCalledTimes(emailCalls);
    expect(h.state.records).toEqual([]);
    expect(h.state.attestations).toEqual([]);
  });

  it('still renders incomplete J5 and J6 when billing is enabled but no case exists', async () => {
    h.state.cases = [];
    for (const stage of ['j5', 'j6']) {
      expect(await pdfText(await memberPreviewGet(new Request(url(stage)), params(stage)))).toContain('[Not provided]');
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('uses only a member-owned case and labels a selected catalog program without claiming enrollment', async () => {
    h.state.cases[0].memberId = 'someone-else';
    let response = await memberPreviewGet(new Request(url('j5', `?caseId=${h.CASE}`)), params());
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('CASE_NOT_FOUND');
    h.state.cases[0].memberId = h.MEMBER;
    h.state.cases[0].organizationId = h.OTHER_ORG;
    response = await memberPreviewGet(new Request(url('j5', `?caseId=${h.CASE}`)), params());
    expect(response.status).toBe(404);
    h.state.cases[0].organizationId = h.ORG;
    response = await memberPreviewGet(new Request(url('j5', `?caseId=${h.CASE}&programSlug=different-program`)), params());
    expect(response.status).toBe(422);
    h.state.cases = [];
    const text = await pdfText(await memberPreviewGet(new Request(url('j5', '?programSlug=data-analytics-professional-certificate-google')), params()));
    expect(text).toContain('160 hours');
    expect(text).toContain('enrollment is not confirmed');
    expect(text).toContain('[Not provided]');
  });

  it('uses an existing readiness date without creating evidence or requiring official gates', async () => {
    h.state.attestations = [{ organizationId: h.ORG, caseId: h.CASE, kind: 'j5_readiness', classStartDate: new Date('2026-09-30T00:00:00Z') }];
    const text = await pdfText(await memberPreviewGet(new Request(url('j6', `?caseId=${h.CASE}`)), params('j6')));
    expect(text).toContain('September 30, 2026');
    expect(text).toContain('March 30, 2027');
    expect(text).toContain('not a payment request');
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(h.state.attestations).toHaveLength(1);
  });

  it('uses actual class-start evidence for a new J6 ahead of the quoted J5 dates, while retaining a saved J6 snapshot', async () => {
    const quoted = { kind: 'j5_quote_voucher_request', training: { classStartDate: '2026-09-30', classEndDate: '2027-03-30' } };
    h.state.records = [{ organizationId: h.ORG, caseId: h.CASE, stage: 'j5', status: 'draft', content: quoted }];
    h.state.attestations = [{ organizationId: h.ORG, caseId: h.CASE, kind: 'class_started', classStartDate: new Date('2026-10-15T00:00:00Z'), classEndDate: new Date('2027-04-15T00:00:00Z') }];
    const text = await pdfText(await memberPreviewGet(new Request(url('j6', `?caseId=${h.CASE}`)), params('j6')));
    expect(text).toContain('October 15, 2026');
    expect(text).toContain('April 15, 2027');
    expect(text).not.toContain('September 30, 2026');
    expect(text).not.toContain('March 30, 2027');
    const j5Text = await pdfText(await memberPreviewGet(new Request(url('j5', `?caseId=${h.CASE}`)), params()));
    expect(j5Text).toContain('September 30, 2026');
    expect(j5Text).toContain('March 30, 2027');
    h.state.records.unshift({ organizationId: h.ORG, caseId: h.CASE, stage: 'j6', status: 'draft', content: { ...quoted, kind: 'j6_invoice_cover_letter' } });
    const savedText = await pdfText(await memberPreviewGet(new Request(url('j6', `?caseId=${h.CASE}`)), params('j6')));
    expect(savedText).toContain('September 30, 2026');
    expect(savedText).toContain('March 30, 2027');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('keeps authentication, administrator, tenant, provider, origin, and stage guards with the migration gate off', async () => {
    delete process.env.BILLING_TWO_STAGE_MIGRATION_APPLIED;
    h.state.failBillingReads = true;
    mocks.getUser.mockResolvedValueOnce(null);
    expect((await memberPreviewGet(new Request(url()), params())).status).toBe(401);
    mocks.isAdmin.mockResolvedValueOnce(false);
    expect((await memberPreviewGet(new Request(url()), params())).status).toBe(403);
    h.state.userOrg.set(h.ADMIN, h.OTHER_ORG);
    expect((await memberPreviewGet(new Request(url()), params())).status).toBe(404);
    h.state.userOrg.set(h.MEMBER, h.OTHER_ORG);
    expect((await memberPreviewGet(new Request(url()), params())).status).toBe(403);
    mocks.isSuperAdmin.mockResolvedValueOnce(true);
    expect((await memberPreviewGet(new Request(url()), params())).status).toBe(403);
    h.state.userOrg.set(h.ADMIN, h.ORG);
    h.state.userOrg.set(h.MEMBER, h.ORG);
    expect((await memberPreviewPost(jsonReq(url(), {}, { origin: 'https://evil.example' }), params())).status).toBe(403);
    expect((await memberPreviewGet(new Request(url('j7')), params('j7'))).status).toBe(404);
    expect((await memberPreviewGet(new Request(url('j5', `?caseId=${h.CASE}`)), params())).status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe('two-stage routes: sign and send are hard-disabled', () => {
  const signBody = { recordId: 'r', version: 1, contentSha256: 'a'.repeat(64), intentConfirmed: true, intentText: 'x' };

  it('sign: 503 SIGNER_NOT_CONFIGURED by default, then 503 SIGNER_PRINCIPAL_UNSET once a signer id is set but no signer is designated', async () => {
    let res = await sign(jsonReq(`${base}/${h.CASE}/j5/sign`, signBody), caseParams({ stage: 'j5' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SIGNER_NOT_CONFIGURED');
    process.env.BILLING_EXECUTIVE_SIGNER_USER_ID = h.ADMIN;
    res = await sign(jsonReq(`${base}/${h.CASE}/j5/sign`, signBody), caseParams({ stage: 'j5' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SIGNER_PRINCIPAL_UNSET');
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
    // Row names the caller, env names someone else: refused (M1 cross-check fails closed), never "pick the row".
    process.env.BILLING_EXECUTIVE_SIGNER_USER_ID = 'b0000000-0000-4000-8000-000000000999';
    res = await receiptAttest(jsonReq(`${base}/${h.CASE}/voucher/v1/receipt-attestation`, {}), caseParams({ artifactId: 'v1' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SIGNER_NOT_CONFIGURED');
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
    // The voucher steps no longer wait on him; only his (not yet uploaded) signature image does.
    expect(again.j6.blockers.filter((b) => b.waitingOn).map((b) => b.code)).toEqual(['SIGNATURE_ASSET_MISSING']);

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
    expect(again.j6.blockers.filter((b) => b.waitingOn === 'designated_signer').map((b) => b.code).sort()).toEqual(['J6_VOUCHER_ATTESTATION_INCOMPLETE', 'RECEIVING_SIGNATURE_NOT_ATTESTED', 'SIGNATURE_ASSET_MISSING']);
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
    expect(ok.headers.get('content-disposition')).toBe('inline; filename="v.pdf"');
    mocks.readArchive.mockResolvedValueOnce(new TextEncoder().encode('%PDF-'));
    const download = await downloadFile(new Request(`${url}?download=1`), caseParams({ artifactId: 'v1' }));
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="v.pdf"');
    expect(download.headers.get('cache-control')).toContain('no-store');
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

function stageRecord(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'rec-1', organizationId: h.ORG, caseId: h.CASE, stage: 'j5', version: 1, status: 'signed', documentNumber: 'WAP-Q-2026-0001', contentSha256: 'e'.repeat(64),
    content: {}, priorJ5RecordId: null, voucherArtifactId: null, signedArtifactId: null, signedAt: null, signedBySubjectId: null, sentAt: null, sendReceipt: null,
    closedBySubjectId: null, closeReason: null, supersededAt: null, voidedAt: null, sendCancelledAt: null, sendCancelledBySubjectId: null, sendCancelReason: null,
    acceptedRolesAtClose: [], createdBySubjectId: h.ADMIN, createdAt: new Date('2026-09-20T15:00:00Z'), updatedAt: new Date('2026-09-20T15:00:00Z'),
    recipients: [], sends: [], ...over,
  };
}

describe('two-stage routes: closing a version records who and why', () => {
  const url = `${base}/${h.CASE}/j5/versions/rec-1/close`;
  const params = () => caseParams({ stage: 'j5', recordId: 'rec-1' });

  it('refuses a close without a reason before any write (422 CLOSE_REASON_REQUIRED)', async () => {
    h.state.records = [stageRecord({})];
    for (const reason of [undefined, '', '   ']) {
      const res = await closeRoute(jsonReq(url, { action: 'void', reason, versionHash: 'e'.repeat(64) }), params());
      expect(res.status).toBe(422);
      expect(((await res.json()) as ApiErrorBody).code).toBe('CLOSE_REASON_REQUIRED');
    }
    expect(mocks.recordUpdate).not.toHaveBeenCalled();
  });

  it('writes the actor and the trimmed reason in the closing update', async () => {
    h.state.records = [stageRecord({})];
    await closeRoute(jsonReq(url, { action: 'void', reason: '  Wrong board address  ', versionHash: 'e'.repeat(64) }), params());
    expect(mocks.recordUpdate).toHaveBeenCalledTimes(1);
    const { data } = mocks.recordUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ status: 'voided', closedBySubjectId: h.ADMIN, closeReason: 'Wrong board address' });
    // voided_at is stamped by the database, never passed.
    expect('voidedAt' in data).toBe(false);
  });

  it('maps the M1 refusal CLOSE_ACTOR_REASON_REQUIRED to its own code', async () => {
    h.state.records = [stageRecord({})];
    mocks.recordUpdate.mockImplementationOnce(async () => {
      throw Object.assign(new Error('CLOSE_ACTOR_REASON_REQUIRED: closing a signed or sent record records who (closed_by_subject_id) and why (close_reason)'), { code: '23514' });
    });
    const res = await closeRoute(jsonReq(url, { action: 'void', reason: 'Duplicate', versionHash: 'e'.repeat(64) }), params());
    expect(res.status).toBe(422);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.code).toBe('CLOSE_ACTOR_REASON_REQUIRED');
    expect(body.outcomeUncertain).toBeUndefined();
  });
});

describe('two-stage routes: payment received is never dated before the J6 was sent', () => {
  // A J6 sent 2026-09-10 (Chicago), its pending event anchored 10-14 days later.
  const sentJ6 = () => stageRecord({ id: 'j6-1', stage: 'j6', status: 'sent', documentNumber: 'WAP-I-2026-0001', sentAt: new Date('2026-09-10T15:00:00Z') });
  const pending = () => ({
    id: 'pay-1', organizationId: h.ORG, caseId: h.CASE, j6RecordId: 'j6-1', status: 'pending', expectedFollowUpFrom: new Date('2026-09-20T00:00:00Z'), expectedFollowUpTo: new Date('2026-09-24T00:00:00Z'),
    receivedOn: null, evidence: null, recordedBySubjectId: h.ADMIN, recordedAt: new Date('2026-09-10T15:01:00Z'),
  });
  const url = `${base}/${h.CASE}/payment/received`;

  it('refuses a received date before the Chicago send date (422 PAYMENT_RECEIVED_BEFORE_SENT), before any write', async () => {
    h.state.records = [sentJ6()];
    h.state.payments = [pending()];
    const res = await paymentReceivedRoute(jsonReq(url, { j6RecordId: 'j6-1', receivedOn: '2026-09-09', evidence: 'Remittance 1' }), caseParams());
    expect(res.status).toBe(422);
    expect(((await res.json()) as ApiErrorBody).code).toBe('PAYMENT_RECEIVED_BEFORE_SENT');
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
  });

  it('records a received date on the send date against the J6 holding the pending event; the DB bound maps to the same code', async () => {
    h.state.records = [sentJ6()];
    h.state.payments = [pending()];
    mocks.paymentCreate.mockImplementationOnce(async () => {
      throw Object.assign(new Error('PAYMENT_RECEIVED_BEFORE_SENT: a payment cannot be received before the J6 was sent'), { code: '23514' });
    });
    const res = await paymentReceivedRoute(jsonReq(url, { j6RecordId: 'j6-1', receivedOn: '2026-09-10', evidence: 'Remittance 1' }), caseParams());
    expect(mocks.paymentCreate).toHaveBeenCalledTimes(1);
    const { data } = mocks.paymentCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ j6RecordId: 'j6-1', status: 'received', evidence: 'Remittance 1' });
    expect('recordedAt' in data).toBe(false);
    expect(res.status).toBe(422);
    expect(((await res.json()) as ApiErrorBody).code).toBe('PAYMENT_RECEIVED_BEFORE_SENT');
  });
});

describe('two-stage routes: every M1 named database refusal has its own code', () => {
  // The CODE: prefixes M1 55a0562 raises (prisma/migrations/20260927230000_billing_two_stage_j5_j6).
  const M1_CODES = [
    'CLOSE_ACTOR_REASON_REQUIRED', 'J5_ISSUE_DATE_NOT_SERVER_DATE', 'J5_LINKED_BY_OPEN_J6', 'J6_ISSUE_DATE_NOT_SERVER_DATE', 'J6_SIGNED_BEFORE_CLASS_START',
    'J6_SIGNED_BEFORE_VOUCHER_RECEIPT', 'LETTERHEAD_FOOTER_MISMATCH', 'PAYMENT_RECEIVED_BEFORE_SENT', 'SEND_FAILED_WITHOUT_PROVIDER_REJECTION', 'SIGNER_DELEGATION_DISABLED',
    'SIGNER_NOT_DESIGNATED', 'SIGNER_PRINCIPAL_UNSET', 'VOUCHER_ATTESTER_NOT_DESIGNATED', 'VOUCHER_ATTESTER_NOT_SIGNER', 'VOUCHER_RECEIPT_SIGNATURE_UNATTESTED',
    'VOUCHER_RECEIPT_SIGNATURE_WRONG_PRINCIPAL',
  ];
  it('maps each to itself', () => {
    for (const code of M1_CODES) expect(namedRefusal(`${code}: refused by the database`)?.code, code).toBe(code);
    expect(namedRefusal('billing send status cannot move from pending to sent')).toBeNull();
  });
});


// ---------------------------------------------------------------------------
// The designated signer's approved signature image, and signing with it.

const SIG_URL = `${ORIGIN}/api/admin/members/${h.MEMBER}/billing/two-stage/signature`;
/** Generated stand-ins; no real signature image is used or committed. */
const PNG = new Uint8Array(syntheticPng(360, 90));
const PNG_SHA = sha256Hex(PNG);
const OTHER_PNG = new Uint8Array(syntheticPng(361, 90));
const OTHER_SHA = sha256Hex(OTHER_PNG);

const storageError = (code: string) => Object.assign(new Error(code), { name: 'FinanceArchiveError', code });

function uploadReq(opts: { png?: Uint8Array | null; type?: string; attestation?: unknown; headers?: Record<string, string> } = {}) {
  const form = new FormData();
  if (opts.png !== null) form.set('file', new File([new Uint8Array(opts.png ?? PNG)], 'signature.png', { type: opts.type ?? 'image/png' }));
  form.set('attestation', JSON.stringify(opts.attestation ?? { statementConfirmed: true, statementText: signatureApprovalStatement() }));
  return new Request(SIG_URL, { method: 'POST', headers: opts.headers ?? { origin: ORIGIN }, body: form });
}

function assetRow(over: Record<string, unknown> = {}) {
  const sha = (over.sha256 as string | undefined) ?? PNG_SHA;
  return {
    id: 'sig-1',
    organizationId: h.ORG,
    signerUserId: h.ADMIN,
    uploadedByUserId: h.ADMIN,
    storageBucket: 'billing-finance',
    storageKey: `signature/${h.ORG}/${h.ADMIN}/${sha}.png`,
    mimeType: 'image/png',
    byteLength: PNG.length,
    sha256: sha,
    widthPx: 360,
    heightPx: 90,
    pngHeader: Buffer.from(PNG.subarray(0, 33)),
    approvalStatement: signatureApprovalStatement(),
    uploadedAt: new Date('2026-09-29T17:00:00Z'),
    approvedAt: new Date('2026-09-29T17:00:00Z'),
    revokedAt: null,
    revokedBySubjectId: null,
    revokeReason: null,
    ...over,
  };
}

/** Michael's setup: designated in the database, and the env cross-check names the same account. */
function asDesignatedSigner() {
  process.env.BILLING_EXECUTIVE_SIGNER_USER_ID = h.ADMIN;
  h.state.designated = { userId: h.ADMIN };
}

function fakeStore() {
  mocks.storeSignature.mockImplementation(async ({ organizationId, signerUserId, bytes }: { organizationId: string; signerUserId: string; bytes: Uint8Array }) => {
    const inspected = inspectSignaturePng(bytes);
    if (!inspected.ok) throw new Error('fake store got a non-PNG');
    return { ref: { organizationId, signerUserId, bucket: 'billing-finance', key: `signature/${organizationId}/${signerUserId}/${inspected.png.sha256}.png`, sha256: inspected.png.sha256, byteLength: bytes.length }, png: inspected.png, reused: false };
  });
}

async function code(res: Response): Promise<string> {
  return ((await res.json()) as ApiErrorBody).code;
}

describe('two-stage routes: the designated signer signature image', () => {
  it('GET shows any admin whether an image is approved (metadata only, never the storage key), and only the signer may upload', async () => {
    let res = await signatureGet(new Request(SIG_URL), memberParams());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: null, approvalStatement: signatureApprovalStatement(), viewerCanUpload: false });

    h.state.designated = { userId: h.ADMIN };
    h.state.signatureAssets = [assetRow()];
    res = await signatureGet(new Request(SIG_URL), memberParams());
    const body = await res.json();
    expect(body.viewerCanUpload).toBe(true);
    expect(body.active).toMatchObject({ id: 'sig-1', sha256: PNG_SHA, widthPx: 360, heightPx: 90 });
    expect(JSON.stringify(body)).not.toMatch(/storageKey|storage_key|signature\//u);

    mocks.getUser.mockResolvedValue({ id: 'someone-else' });
    h.state.userOrg.set('someone-else', h.ORG);
    expect((await (await signatureGet(new Request(SIG_URL), memberParams())).json()).viewerCanUpload).toBe(false);
  });

  it('is closed by default and refuses a request without a same-site Origin', async () => {
    mocks.getUser.mockClear();
    delete process.env.BILLING_TWO_STAGE_MIGRATION_APPLIED;
    expect((await signaturePost(uploadReq(), memberParams())).status).toBe(503);
    expect(mocks.getUser).not.toHaveBeenCalled();
    process.env.BILLING_TWO_STAGE_MIGRATION_APPLIED = 'true';
    const res = await signaturePost(uploadReq({ headers: { origin: 'https://evil.example' } }), memberParams());
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('ORIGIN_REJECTED');
    expect(mocks.storeSignature).not.toHaveBeenCalled();
  });

  it('only the designated signer, signed in as himself, with the configured signer account, can upload; nothing is stored otherwise', async () => {
    fakeStore();
    // No signer designated yet.
    let res = await signaturePost(uploadReq(), memberParams());
    expect([res.status, await code(res)]).toEqual([503, 'SIGNER_PRINCIPAL_UNSET']);
    // Designated is someone else: this admin cannot approve his signature.
    h.state.designated = { userId: 'the-real-signer' };
    res = await signaturePost(uploadReq(), memberParams());
    expect([res.status, await code(res)]).toEqual([403, 'SIGNATURE_ASSET_WRONG_PRINCIPAL']);
    // Designated is this admin, but the signer account is not configured (env is the required second key).
    h.state.designated = { userId: h.ADMIN };
    res = await signaturePost(uploadReq(), memberParams());
    expect([res.status, await code(res)]).toEqual([503, 'SIGNER_NOT_CONFIGURED']);
    // The env names a different account than the database row: fail closed.
    process.env.BILLING_EXECUTIVE_SIGNER_USER_ID = 'a1111111-1111-4111-8111-111111111111';
    res = await signaturePost(uploadReq(), memberParams());
    expect(res.status).toBe(503);
    expect(mocks.storeSignature).not.toHaveBeenCalled();
    expect(mocks.signatureCreate).not.toHaveBeenCalled();
  });

  it('validates before any storage write: unconfirmed statement, not a PNG, wrong declared type, no file', async () => {
    fakeStore();
    asDesignatedSigner();
    const attempt = async (req: Request, status: number, expected: string) => {
      const res = await signaturePost(req, memberParams());
      expect([res.status, await code(res)]).toEqual([status, expected]);
    };
    await attempt(uploadReq({ attestation: { statementConfirmed: false, statementText: signatureApprovalStatement() } }), 422, 'SIGNATURE_STATEMENT_NOT_CONFIRMED');
    await attempt(uploadReq({ attestation: { statementConfirmed: true, statementText: 'I agree.' } }), 422, 'SIGNATURE_STATEMENT_NOT_CONFIRMED');
    await attempt(uploadReq({ png: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(100).fill(1)]) }), 422, 'SIGNATURE_IMAGE_INVALID');
    await attempt(uploadReq({ type: 'image/jpeg' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
    await attempt(uploadReq({ png: null }), 422, 'UPLOAD_EMPTY');
    expect(mocks.storeSignature).not.toHaveBeenCalled();
    expect(mocks.signatureCreate).not.toHaveBeenCalled();
  });

  it('approves the image: stores the exact bytes, then records who and what, leaving every timestamp to the database', async () => {
    fakeStore();
    asDesignatedSigner();
    const res = await signaturePost(uploadReq(), memberParams());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.signature).toMatchObject({ sha256: PNG_SHA, widthPx: 360, heightPx: 90, byteLength: PNG.length });
    expect(body.replaced).toBeNull();

    expect(mocks.storeSignature).toHaveBeenCalledTimes(1);
    const stored = mocks.storeSignature.mock.calls[0][0] as { organizationId: string; signerUserId: string; bytes: Uint8Array };
    expect([stored.organizationId, stored.signerUserId, sha256Hex(stored.bytes)]).toEqual([h.ORG, h.ADMIN, PNG_SHA]);

    expect(mocks.signatureCreate).toHaveBeenCalledTimes(1);
    const data = mocks.signatureCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(data).toMatchObject({
      organizationId: h.ORG,
      signerUserId: h.ADMIN,
      uploadedByUserId: h.ADMIN,
      storageBucket: 'billing-finance',
      storageKey: `signature/${h.ORG}/${h.ADMIN}/${PNG_SHA}.png`,
      mimeType: 'image/png',
      sha256: PNG_SHA,
      approvalStatement: signatureApprovalStatement(),
    });
    expect((data.pngHeader as Buffer).length).toBe(33);
    for (const stamped of ['uploadedAt', 'approvedAt', 'revokedAt', 'revokedBySubjectId']) expect(data).not.toHaveProperty(stamped);
    expect(mocks.signatureRevoke).not.toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'billing.two_stage.signature_asset_approved', actorUserId: h.ADMIN }), expect.anything());
  });

  it('uploading the identical image again changes nothing', async () => {
    fakeStore();
    asDesignatedSigner();
    h.state.signatureAssets = [assetRow()];
    const res = await signaturePost(uploadReq(), memberParams());
    expect(res.status).toBe(200);
    expect((await res.json()).signature.id).toBe('sig-1');
    expect(mocks.storeSignature).not.toHaveBeenCalled();
    expect(mocks.signatureCreate).not.toHaveBeenCalled();
  });

  it('a different image needs an explicit replacement and a reason; the old row is revoked (who and why) in the same transaction', async () => {
    fakeStore();
    asDesignatedSigner();
    h.state.signatureAssets = [assetRow()];
    const confirmed = { statementConfirmed: true, statementText: signatureApprovalStatement() };

    let res = await signaturePost(uploadReq({ png: OTHER_PNG, attestation: confirmed }), memberParams());
    expect([res.status, await code(res)]).toEqual([409, 'SIGNATURE_ASSET_EXISTS']);
    res = await signaturePost(uploadReq({ png: OTHER_PNG, attestation: { ...confirmed, replace: true, revokeReason: '   ' } }), memberParams());
    expect([res.status, await code(res)]).toEqual([422, 'SIGNATURE_REVOKE_REASON_REQUIRED']);
    expect(mocks.storeSignature).not.toHaveBeenCalled();

    res = await signaturePost(uploadReq({ png: OTHER_PNG, attestation: { ...confirmed, replace: true, revokeReason: ' Cleaner scan ' } }), memberParams());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.signature.sha256).toBe(OTHER_SHA);
    expect(body.replaced).toMatchObject({ id: 'sig-1', sha256: PNG_SHA });
    expect(mocks.signatureRevoke).toHaveBeenCalledWith({
      where: { id: 'sig-1', organizationId: h.ORG, revokedAt: null },
      data: { revokedBySubjectId: h.ADMIN, revokeReason: 'Cleaner scan' },
    });
  });

  it('a storage outage approves nothing: no database row, and a clear error', async () => {
    asDesignatedSigner();
    mocks.storeSignature.mockRejectedValue(storageError('STORAGE_UNAVAILABLE'));
    const res = await signaturePost(uploadReq(), memberParams());
    expect([res.status, await code(res)]).toEqual([503, 'FINANCE_ARCHIVE_UNAVAILABLE']);
    expect(mocks.signatureCreate).not.toHaveBeenCalled();
  });
});

describe('two-stage routes: case summary reports the signature image', () => {
  it('a designated signer with no image blocks signing on both stages; an approved image clears it', async () => {
    asDesignatedSigner();
    let summary = (await (await caseSummary(new Request(`${base}/${h.CASE}`), caseParams())).json()) as CaseSummaryDto;
    expect(summary.signature).toMatchObject({ active: null, viewerCanUpload: true });
    for (const stage of [summary.j5, summary.j6]) expect(stage.blockers.map((b) => b.code)).toContain('SIGNATURE_ASSET_MISSING');
    // Only he can upload it, so both stages name him as the one who must act.
    for (const stage of [summary.j5, summary.j6]) {
      expect(stage.blockers.find((b) => b.code === 'SIGNATURE_ASSET_MISSING')).toMatchObject({ waitingOn: 'designated_signer' });
    }
    expect(summary.j5.canSign).toBe(false);

    h.state.signatureAssets = [assetRow()];
    summary = (await (await caseSummary(new Request(`${base}/${h.CASE}`), caseParams())).json()) as CaseSummaryDto;
    expect(summary.signature.active).toMatchObject({ id: 'sig-1', sha256: PNG_SHA });
    for (const stage of [summary.j5, summary.j6]) expect(stage.blockers.map((b) => b.code)).not.toContain('SIGNATURE_ASSET_MISSING');
  });

  it('with no designated signer there is no image blocker (the principal gate already explains it)', async () => {
    const summary = (await (await caseSummary(new Request(`${base}/${h.CASE}`), caseParams())).json()) as CaseSummaryDto;
    for (const stage of [summary.j5, summary.j6]) expect(stage.blockers.map((b) => b.code)).not.toContain('SIGNATURE_ASSET_MISSING');
  });
});

describe('two-stage routes: signing a J5 with the approved image', () => {
  const NOW_ISO = '2026-10-01T18:00:00.000Z';
  const REC = 'rec-j5';
  const logoPng = new Uint8Array(readFileSync(join(process.cwd(), WAP_LOGO_PUBLIC_PATH)));
  const logoSha = sha256Hex(logoPng);
  const readiness: Attestation = {
    id: 'att-ready', kind: 'j5_readiness', statement: 'synthetic', evidenceReference: 'synthetic evidence', classStartDate: '2026-09-30', classEndDate: null, artifactId: null,
    voucherReference: null, authorizedAmountCents: null, authorizedStartDate: null, authorizedEndDate: null, receivedOn: null, receivingSignaturePresent: null, externalReference: null,
    externalQuoteDate: null, quotedProgramSlug: null, quotedClassName: null, authorizedProgramSlug: null, authorizedClassName: null, studentReadyConfirmed: true,
    counselorRequestedBy: 'Casey Counselor', counselorRequestedOn: '2026-09-19', counselorRequestReference: 'Email 2026-09-19', attestedBySubjectId: h.ADMIN, attestedAt: '2026-09-20T15:00:00.000Z',
  };
  const day = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

  /** A saved J5 draft that froze `frozen` (the image its content names), plus the evidence it needs. */
  function seedDraft(frozen: { assetId: string; assetSha256: string } | null) {
    const built = buildJ5Content({
      documentNumber: 'WAP-Q-2026-0001',
      logoSha256: logoSha,
      issueDate: '2026-10-01',
      student: { name: 'Jordan Example', email: 'jordan@example.test' },
      counselor: { name: 'Casey Counselor', email: 'casey@example.test', phone: '(555) 010-0201' },
      boardName: 'Workforce Solutions Capital Area',
      programSlug: 'data-analytics-professional-certificate-google',
      readiness,
      signatureAsset: frozen,
    });
    if (!built.ok) throw new Error(built.errors.join('; '));
    const content = built.content;
    h.state.attestations = [
      { ...readiness, caseId: h.CASE, organizationId: h.ORG, classStartDate: day(readiness.classStartDate), counselorRequestedOn: day(readiness.counselorRequestedOn), attestedAt: new Date(readiness.attestedAt) },
    ];
    h.state.records = [
      {
        id: REC, organizationId: h.ORG, caseId: h.CASE, stage: 'j5', version: 1, status: 'draft', documentNumber: content.documentNumber, content, contentSha256: built.contentSha256,
        className: content.training.className, contactHours: content.training.contactHours, classStartDate: day(content.training.classStartDate), classEndDate: day(content.training.classEndDate),
        createdBySubjectId: h.ADMIN, createdAt: new Date('2026-10-01T17:00:00Z'), updatedAt: new Date('2026-10-01T17:30:00Z'),
        signedAt: null, signedBySubjectId: null, signedArtifactId: null, sentAt: null, supersededAt: null, voidedAt: null, closedBySubjectId: null, acceptedRolesAtClose: [],
        sendCancelledAt: null, sendCancelledBySubjectId: null, readinessAttestationId: readiness.id,
        recipients: recipientRowsForContent(content).map((r) => ({ stageRecordId: REC, organizationId: h.ORG, stage: 'j5', recipientRole: r.role, recipientName: r.name, email: r.email, phone: r.phone })),
        sends: [],
      },
    ];
    return { content, hash: built.contentSha256 };
  }

  it('previews and downloads an unsigned J5 with closed signing gates, while enforcing version and tenant guards', async () => {
    const { hash } = seedDraft(null);
    delete process.env.BILLING_EXECUTIVE_SIGNER_USER_ID;
    h.state.designated = null;
    const path = `${base}/${h.CASE}/j5/draft/preview?recordId=${REC}&versionHash=${hash}`;
    for (const [suffix, disposition] of [['', 'inline'], ['&download=1', 'attachment']] as const) {
      const response = await previewDraft(new Request(`${path}${suffix}`), caseParams({ stage: 'j5' }));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/pdf');
      expect(response.headers.get('content-disposition')).toBe(`${disposition}; filename="WAP-Q-2026-0001-DRAFT.pdf"`);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    }
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.recordUpdate).not.toHaveBeenCalled();
    const stale = await previewDraft(new Request(path.replace(hash, '0'.repeat(64))), caseParams({ stage: 'j5' }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe('VERSION_STALE');
    h.state.userOrg.set(h.ADMIN, h.OTHER_ORG);
    expect((await previewDraft(new Request(`${path}&download=1`), caseParams({ stage: 'j5' }))).status).toBe(404);
  });

  it('renders an explicit mock of the saved J5 despite signing gates, without signature, lifecycle, archive or email effects', async () => {
    const { hash } = seedDraft({ assetId: 'sig-1', assetSha256: PNG_SHA });
    h.state.signatureAssets = [assetRow()];
    delete process.env.BILLING_EXECUTIVE_SIGNER_USER_ID;
    h.state.designated = null;
    const before = JSON.stringify(h.state.records);
    const auditCalls = mocks.auditLog.mock.calls.length;
    const emailCalls = mocks.emailSend.mock.calls.length;
    const path = `${base}/${h.CASE}/j5/draft/preview?recordId=${REC}&versionHash=${hash}&mode=mock`;
    for (const [suffix, disposition] of [['', 'inline'], ['&download=1', 'attachment']] as const) {
      const response = await previewDraft(new Request(`${path}${suffix}`), caseParams({ stage: 'j5' }));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toBe(`${disposition}; filename="WAP-Q-2026-0001-MOCK.pdf"`);
      expect(response.headers.get('x-billing-document-mode')).toBe('mock');
      expect(response.headers.get('x-billing-version-hash')).toBe(hash);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const pdf = await getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true }).promise;
      try {
        expect(pdf.numPages).toBe(1);
        const content = await (await pdf.getPage(1)).getTextContent();
        const text = content.items.flatMap((item) => 'str' in item ? [item.str] : []).join(' ');
        expect(text).toContain('MOCK - REVIEW ONLY - NOT SIGNED');
        expect(text).toContain('Jordan Example');
      } finally {
        await pdf.destroy();
      }
    }
    expect(JSON.stringify(h.state.records)).toBe(before);
    for (const fn of [mocks.archive, mocks.readArchive, mocks.readSignature, mocks.storeSignature, mocks.recordUpdate, mocks.artifactCreate, mocks.txCreate]) expect(fn).not.toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledTimes(auditCalls);
    expect(mocks.emailSend).toHaveBeenCalledTimes(emailCalls);

    const stale = await previewDraft(new Request(path.replace(hash, '0'.repeat(64))), caseParams({ stage: 'j5' }));
    expect([stale.status, await code(stale)]).toEqual([409, 'VERSION_STALE']);
    mocks.isAdmin.mockResolvedValueOnce(false);
    expect((await previewDraft(new Request(path), caseParams({ stage: 'j5' }))).status).toBe(403);
    h.state.userOrg.set(h.ADMIN, h.OTHER_ORG);
    expect((await previewDraft(new Request(path), caseParams({ stage: 'j5' }))).status).toBe(404);
    h.state.userOrg.set(h.ADMIN, h.ORG);
    h.state.cases[0].memberId = 'another-member';
    expect((await previewDraft(new Request(path), caseParams({ stage: 'j5' }))).status).toBe(404);
    h.state.cases[0].memberId = h.MEMBER;
    h.state.records[0].status = 'signed';
    const signed = await previewDraft(new Request(path), caseParams({ stage: 'j5' }));
    expect([signed.status, await code(signed)]).toEqual([409, 'NOT_A_DRAFT']);
  });

  it('rejects J6 mock and unsupported preview modes before rendering', async () => {
    const { hash } = seedDraft(null);
    for (const [stage, mode] of [['j6', 'mock'], ['j5', 'signed'], ['j5', ''], ['j5', 'unknown']] as const) {
      const response = await previewDraft(new Request(`${base}/${h.CASE}/${stage}/draft/preview?recordId=${REC}&versionHash=${hash}&mode=${mode}`), caseParams({ stage }));
      expect([response.status, await code(response)]).toEqual([400, 'PREVIEW_MODE_INVALID']);
    }
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.readSignature).not.toHaveBeenCalled();
  });

  const mockEditorValues = {
    boardName: 'Synthetic Review Board',
    student: { name: 'Typed Student', email: 'typed.student@example.test' },
    counselor: { name: 'Typed Counselor', email: 'typed.counselor@example.test', phone: '(555) 010-9999' },
    expectedVersionHash: null,
  };

  it('creates a mock directly from complete editor fields and recorded readiness with no saved draft or side effects', async () => {
    seedDraft(null);
    h.state.records = [];
    delete process.env.BILLING_EXECUTIVE_SIGNER_USER_ID;
    h.state.designated = null;
    const before = JSON.stringify({ records: h.state.records, attestations: h.state.attestations, artifacts: h.state.artifacts });
    const auditCalls = mocks.auditLog.mock.calls.length;
    const emailCalls = mocks.emailSend.mock.calls.length;
    const response = await reviewDraftRoute(jsonReq(`${base}/${h.CASE}/j5/draft/review?mode=mock`, mockEditorValues), caseParams({ stage: 'j5' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="J5-MOCK-REVIEW.pdf"');
    expect(response.headers.get('x-billing-document-mode')).toBe('mock');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
    const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), useSystemFonts: true, disableFontFace: true }).promise;
    try {
      const content = await (await pdf.getPage(1)).getTextContent();
      const text = content.items.flatMap((item) => 'str' in item ? [item.str] : []).join(' ');
      expect(text).toContain('MOCK - REVIEW ONLY - NOT SIGNED');
      expect(text).toContain('Typed Student | typed.student@example.test');
      expect(text).toContain('Typed Counselor | typed.counselor@example.test');
      expect(text).toContain('Synthetic Review Board');
      expect(text).toContain('March 30, 2027');
      const metadata = await pdf.getMetadata();
      expect((metadata.info as { Title?: string }).Title).toContain('WAP-MOCK-PREVIEW');
    } finally {
      await pdf.destroy();
    }
    expect(JSON.stringify({ records: h.state.records, attestations: h.state.attestations, artifacts: h.state.artifacts })).toBe(before);
    for (const fn of [mocks.transaction, mocks.txCreate, mocks.archive, mocks.readArchive, mocks.readSignature, mocks.storeSignature, mocks.recordUpdate, mocks.artifactCreate, mocks.receiptCreate]) expect(fn).not.toHaveBeenCalled();
    expect(mocks.auditLog).toHaveBeenCalledTimes(auditCalls);
    expect(mocks.emailSend).toHaveBeenCalledTimes(emailCalls);
  });

  it('requires complete printed fields and existing readiness for an unsaved mock while default review stays JSON', async () => {
    const path = `${base}/${h.CASE}/j5/draft/review`;
    const incomplete = await reviewDraftRoute(jsonReq(`${path}?mode=mock`, { ...mockEditorValues, counselor: { ...mockEditorValues.counselor, phone: '' } }), caseParams({ stage: 'j5' }));
    expect(incomplete.status).toBe(422);
    expect(await incomplete.json()).toMatchObject({ code: 'DRAFT_INCOMPLETE', fields: { 'counselor.phone': { code: 'FIELD_REQUIRED' } }, blockers: [{ code: 'J5_READINESS_MISSING' }] });
    const readiness = await reviewDraftRoute(jsonReq(`${path}?mode=mock`, mockEditorValues), caseParams({ stage: 'j5' }));
    expect(readiness.status).toBe(422);
    expect((await readiness.json()).blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'J5_READINESS_MISSING' })]));
    const normal = await reviewDraftRoute(jsonReq(path, {}), caseParams({ stage: 'j5' }));
    expect(normal.status).toBe(200);
    expect(normal.headers.get('content-type')).toContain('application/json');
    expect(await normal.json()).toMatchObject({ stage: 'j5', current: null, complete: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(h.state.records).toEqual([]);
  });

  it('applies origin, admin, tenant, case and optimistic-version checks to unsaved mock composition', async () => {
    const { hash } = seedDraft(null);
    const path = `${base}/${h.CASE}/j5/draft/review?mode=mock`;
    const run = (body: unknown = mockEditorValues, headers?: Record<string, string>) => reviewDraftRoute(jsonReq(path, body, headers), caseParams({ stage: 'j5' }));
    expect((await run(mockEditorValues, { origin: 'https://other.example.test' })).status).toBe(403);
    mocks.getUser.mockResolvedValueOnce(null);
    expect((await run()).status).toBe(401);
    mocks.isAdmin.mockResolvedValueOnce(false);
    expect((await run()).status).toBe(403);
    h.state.userOrg.set(h.ADMIN, h.OTHER_ORG);
    expect((await run()).status).toBe(404);
    h.state.userOrg.set(h.ADMIN, h.ORG);
    h.state.cases[0].memberId = 'another-member';
    expect((await run()).status).toBe(404);
    h.state.cases[0].memberId = h.MEMBER;
    const stale = await run(); // caller thought there was no saved draft
    expect([stale.status, await code(stale)]).toEqual([409, 'DRAFT_CONFLICT']);
    expect((await run({ ...mockEditorValues, expectedVersionHash: hash })).status).toBe(200);
    h.state.records = [];
    const vanished = await run({ ...mockEditorValues, expectedVersionHash: hash });
    expect([vanished.status, await code(vanished)]).toEqual([409, 'DRAFT_CONFLICT']);
    for (const [stage, mode] of [['j6', 'mock'], ['j5', 'signed'], ['j5', '']] as const) {
      const invalid = await reviewDraftRoute(jsonReq(`${base}/${h.CASE}/${stage}/draft/review?mode=${mode}`, mockEditorValues), caseParams({ stage }));
      expect([invalid.status, await code(invalid)]).toEqual([400, 'PREVIEW_MODE_INVALID']);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('keeps a same-day legacy draft reviewable but requires six-month terms before freeze or sign', async () => {
    const { content } = seedDraft({ assetId: 'sig-1', assetSha256: PNG_SHA });
    h.state.signatureAssets = [assetRow()];
    content.contentVersion = 1;
    content.training.classEndDate = '2027-02-28';
    const hash = contentSha256(content);
    Object.assign(h.state.records[0], { contentVersion: 1, contentSha256: hash, classEndDate: day('2027-02-28') });
    const before = JSON.stringify(h.state.records[0]);
    const preview = await previewDraft(new Request(`${base}/${h.CASE}/j5/draft/preview?recordId=${REC}&versionHash=${hash}`), caseParams({ stage: 'j5' }));
    expect(preview.status).toBe(200);
    const summary = (await (await caseSummary(new Request(`${base}/${h.CASE}`), caseParams())).json()) as CaseSummaryDto;
    expect(summary.j5.canSign).toBe(false);
    expect(summary.j5.blockers).toContainEqual(expect.objectContaining({ code: 'DRAFT_STALE', message: expect.stringContaining('Save the draft again') }));
    expect(summary.j5.readinessAttestation?.quotedClassEndDate).toBe('2027-02-28');
    const checkpoint = await freeze(jsonReq(`${base}/${h.CASE}/j5/freeze`, { recordId: REC, versionHash: hash }), caseParams({ stage: 'j5' }));
    expect([checkpoint.status, await code(checkpoint)]).toEqual([409, 'DRAFT_STALE']);
    const signed = await sign(signReq(hash, content), caseParams({ stage: 'j5' }));
    expect([signed.status, await code(signed)]).toEqual([409, 'DRAFT_STALE']);
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.recordUpdate).not.toHaveBeenCalled();
    expect(JSON.stringify(h.state.records[0])).toBe(before);
  });

  const signReq = (hash: string, content: { title: string; documentNumber: string }) =>
    jsonReq(`${base}/${h.CASE}/j5/sign`, {
      recordId: REC,
      version: 1,
      contentSha256: hash,
      intentConfirmed: true,
      intentText: signerIntentStatement({ documentTitle: content.title, documentNumber: content.documentNumber, contentSha256: hash }),
    });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW_ISO));
    asDesignatedSigner();
    mocks.readSignature.mockResolvedValue(PNG);
    // The archive and the database behave as they will: bytes in, a content-addressed ref out; the sign update stamps the record.
    mocks.archive.mockImplementation(async ({ caseId, kind, bytes }: { caseId: string; kind: string; bytes: Uint8Array }) => {
      const sha = sha256Hex(bytes);
      return { ref: { caseId, kind, bucket: 'billing-finance', key: `cases/${caseId}/j5/${sha}.pdf`, sha256: sha, byteLength: bytes.length, mimeType: 'application/pdf' }, reused: false };
    });
    mocks.artifactCreate.mockImplementation((data: Record<string, unknown>) => {
      h.state.artifacts.push({ ...data, id: 'art-signed', createdAt: new Date(NOW_ISO) });
    });
    mocks.recordUpdate.mockImplementation(async (args: unknown) => {
      const { where, data } = args as { where: { id: string; contentSha256: string }; data: Record<string, unknown> };
      const row = h.state.records.find((r) => r.id === where.id);
      if (!row || row.status !== 'draft' || row.contentSha256 !== where.contentSha256) return { count: 0 };
      Object.assign(row, data, { signedAt: new Date(NOW_ISO) });
      return { count: 1 };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('signs with the approved image: renders the final page, archives the exact bytes, and records approved_image', async () => {
    h.state.signatureAssets = [assetRow()];
    const { content, hash } = seedDraft({ assetId: 'sig-1', assetSha256: PNG_SHA });
    const res = await sign(signReq(hash, content), caseParams({ stage: 'j5' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.record.status).toBe('signed');
    expect(body.record.signed).toMatchObject({ signatureMethod: 'approved_image' });

    // The image came from the private archive, by the asset's own key.
    expect(mocks.readSignature).toHaveBeenCalledWith(expect.objectContaining({ key: `signature/${h.ORG}/${h.ADMIN}/${PNG_SHA}.png`, sha256: PNG_SHA }));

    // The archived bytes are the final page: a PDF with the logo and the signature, and no draft marker.
    expect(mocks.archive).toHaveBeenCalledTimes(1);
    const archived = mocks.archive.mock.calls[0][0] as { kind: string; bytes: Uint8Array };
    expect(archived.kind).toBe('j5_signed_pdf');
    const text = Buffer.from(archived.bytes).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    // Exactly one more image than the same page as a draft (the logo, plus its alpha mask, is in both).
    const draft = await renderDraftFromContent(content, { logoPng, frozenAt: NOW_ISO });
    const images = (bytes: Uint8Array) => (Buffer.from(bytes).toString('latin1').match(/\/Subtype\s*\/Image/gu) ?? []).length;
    expect(images(archived.bytes)).toBe(images(draft) + 1);
    expect(text).not.toMatch(/DRAFT/u);

    // The database update carries the method and the exact-version guard the trigger checks.
    expect(mocks.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: REC, status: 'draft', contentSha256: hash }),
        data: expect.objectContaining({ status: 'signed', signatureMethod: 'approved_image', signedBySubjectId: h.ADMIN, signedViaDelegationId: null }),
      }),
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'billing.two_stage.signed', metadata: expect.objectContaining({ signatureAssetId: 'sig-1', signatureAssetSha256: PNG_SHA }) }),
      expect.anything(),
    );
  });

  it('refuses before rendering or storing anything when the signer has no active image', async () => {
    const { content, hash } = seedDraft({ assetId: 'sig-1', assetSha256: PNG_SHA });
    h.state.signatureAssets = [];
    const res = await sign(signReq(hash, content), caseParams({ stage: 'j5' }));
    expect([res.status, await code(res)]).toEqual([409, 'SIGNATURE_ASSET_MISSING']);
    expect(mocks.readSignature).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.recordUpdate).not.toHaveBeenCalled();
  });

  it('refuses a draft that froze another image, or none: the draft must be saved again', async () => {
    h.state.signatureAssets = [assetRow({ id: 'sig-2', sha256: OTHER_SHA })];
    for (const frozen of [{ assetId: 'sig-1', assetSha256: PNG_SHA }, null]) {
      const { content, hash } = seedDraft(frozen);
      const res = await sign(signReq(hash, content), caseParams({ stage: 'j5' }));
      expect([res.status, await code(res)]).toEqual([409, 'SIGNATURE_ASSET_MISMATCH']);
    }
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.recordUpdate).not.toHaveBeenCalled();
  });

  it('"Review for signature" (freeze) applies the same image check, so the signer learns early', async () => {
    const { hash } = seedDraft({ assetId: 'sig-1', assetSha256: PNG_SHA });
    h.state.signatureAssets = [];
    const res = await freeze(jsonReq(`${base}/${h.CASE}/j5/freeze`, { recordId: REC, versionHash: hash }), caseParams({ stage: 'j5' }));
    expect([res.status, await code(res)]).toEqual([409, 'SIGNATURE_ASSET_MISSING']);
  });

  it('a stored image that fails its integrity check stops the sign before anything is archived', async () => {
    h.state.signatureAssets = [assetRow()];
    const { content, hash } = seedDraft({ assetId: 'sig-1', assetSha256: PNG_SHA });
    mocks.readSignature.mockRejectedValue(storageError('INTEGRITY_MISMATCH'));
    const res = await sign(signReq(hash, content), caseParams({ stage: 'j5' }));
    expect([res.status, await code(res)]).toEqual([502, 'ARCHIVE_INTEGRITY_MISMATCH']);
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.recordUpdate).not.toHaveBeenCalled();
  });

  it('only the designated signer can sign, even with an approved image and an admin account', async () => {
    h.state.signatureAssets = [assetRow()];
    const { content, hash } = seedDraft({ assetId: 'sig-1', assetSha256: PNG_SHA });
    const other = 'a2222222-2222-4222-8222-222222222222';
    h.state.userOrg.set(other, h.ORG);
    mocks.getUser.mockResolvedValue({ id: other });
    const res = await sign(signReq(hash, content), caseParams({ stage: 'j5' }));
    expect(res.status).toBe(403);
    expect(mocks.readSignature).not.toHaveBeenCalled();
    expect(mocks.archive).not.toHaveBeenCalled();
  });
});

describe('two-stage routes: renderer refusals keep their own codes', () => {
  const mapped = (error: RendererAdapterError): ApiError => {
    try {
      adapterError(error);
    } catch (thrown) {
      if (thrown instanceof ApiError) return thrown;
      throw thrown;
    }
    throw new Error('adapterError returned');
  };

  it('a held J6 refused by the signed renderer is J6_HELD with its holds, not TEXT_NOT_PRINTABLE', () => {
    const e = mapped(new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'A J6 on hold cannot be signed.', { holds: ['voucher_amount_differs'] }));
    expect(e.status).toBe(409);
    expect(e.body).toMatchObject({ code: 'J6_HELD', holds: ['voucher_amount_differs'], blockers: [{ code: 'HOLD_VOUCHER_AMOUNT_DIFFERS', hardHold: true }] });
  });

  it('a J6 without the receiving-signature attestation is RECEIVING_SIGNATURE_NOT_ATTESTED', () => {
    const e = mapped(new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'A signed J6 needs the designated signer receiving-signature attestation.', { field: 'voucher' }));
    expect([e.status, e.body.code]).toEqual([409, 'RECEIVING_SIGNATURE_NOT_ATTESTED']);
  });

  it('other unrenderable content, and a changed signature image, keep their existing codes', () => {
    const shape = mapped(new RendererAdapterError('CONTENT_NOT_RENDERABLE', 'The total must be $7,500.00.', { field: 'totalCents' }));
    expect([shape.status, shape.body.code, shape.body.field]).toEqual([422, 'TEXT_NOT_PRINTABLE', 'totalCents']);
    const image = mapped(new RendererAdapterError('SIGNATURE_IMAGE_MISMATCH', 'The signature image is not the one this draft was prepared with.'));
    expect([image.status, image.body.code]).toEqual([409, 'SIGNATURE_ASSET_MISMATCH']);
  });
});
