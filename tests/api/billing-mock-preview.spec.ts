// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(),
  resolveAdminPageTenant: vi.fn(),
  captureException: vi.fn(),
  readFile: vi.fn(),
  databaseAccess: vi.fn(() => { throw new Error('Mock previews must not access application records'); }),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser, resolveAuthGucContext: mocks.resolveAuthGucContext }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: mocks.resolveAdminPageTenant }));
vi.mock('@sentry/nextjs', () => ({ captureException: mocks.captureException }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
vi.mock('@/lib/db/prisma', () => ({ prisma: new Proxy({}, { get: mocks.databaseAccess }) }));

import { GET } from '@/app/api/admin/billing/preview/[stage]/route';
import { getMockBillingDocumentFacts, MOCK_BILLING_PREVIEW } from '@/lib/billing/twoStage/mockPreview';
import { WAP_BILLING_LETTERHEAD, WAP_LOGO_PUBLIC_PATH } from '@/lib/billing/twoStage/letterhead';
import { getGucContext } from '@/lib/db/gucContext';

const logoPng = new Uint8Array(readFileSync(join(process.cwd(), WAP_LOGO_PUBLIC_PATH)));
const adminContext = { userId: 'sample-admin', orgId: 'sample-org', role: 'admin' } as const;

function preview(stage: string, query = ''): Promise<Response> {
  return GET(new Request(`http://localhost/api/admin/billing/preview/${encodeURIComponent(stage)}${query}`), {
    params: Promise.resolve({ stage }),
  });
}

async function extractText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true }).promise;
  try {
    expect(pdf.numPages).toBe(1);
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    return content.items.flatMap((item) => 'str' in item ? [item.str] : []).join(' ');
  } finally {
    await pdf.destroy();
  }
}

describe('GET /api/admin/billing/preview/[stage]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'sample-admin' });
    mocks.resolveAuthGucContext.mockResolvedValue(adminContext);
    mocks.resolveAdminPageTenant.mockResolvedValue({ ok: true, orgId: 'sample-org', superAdmin: false });
    mocks.readFile.mockResolvedValue(logoPng);
  });

  it('requires authentication before role resolution or reading the logo', async () => {
    mocks.getUser.mockResolvedValue(null);
    mocks.resolveAuthGucContext.mockResolvedValue({ userId: null, orgId: null, role: 'anonymous' });
    const response = await preview('j5');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.resolveAdminPageTenant).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it('rejects a non-admin even when there is an authenticated user', async () => {
    mocks.resolveAuthGucContext.mockResolvedValue({ ...adminContext, role: 'member' });
    mocks.resolveAdminPageTenant.mockResolvedValue({ ok: false });
    const response = await preview('j6');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(mocks.resolveAdminPageTenant).toHaveBeenCalledExactlyOnceWith('sample-admin');
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it('runs admin authorization inside the standard request context and releases it afterwards', async () => {
    mocks.resolveAdminPageTenant.mockImplementationOnce(async () => {
      expect(getGucContext()).toEqual(adminContext);
      return { ok: true, orgId: 'sample-org', superAdmin: false };
    });
    expect(getGucContext()).toBeUndefined();
    const response = await preview('j5');
    expect(response.status).toBe(200);
    expect(mocks.resolveAuthGucContext).toHaveBeenCalledOnce();
    expect(getGucContext()).toBeUndefined();
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(mocks.databaseAccess).not.toHaveBeenCalled();
  });

  it.each(['j4', 'J5', 'j5.pdf', '../j5', 'j6/sign', ''])('refuses the unknown stage %j', async (stage) => {
    const response = await preview(stage);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.databaseAccess).not.toHaveBeenCalled();
  });

  it.each(['j5', 'j6'] as const)('renders an unmistakable unsigned %s PDF from static facts', async (stage) => {
    const response = await preview(stage, '?student=Real%20Person&email=real%40example.com&signed=true&caseId=real-case');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(`inline; filename="mock-${stage}-unsigned.pdf"`);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getTitle()).toContain(`MOCK-${stage.toUpperCase()}-001`);
    expect(parsed.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    const text = await extractText(bytes);
    expect(text).toContain(`MOCK - ${MOCK_BILLING_PREVIEW.documents[stage].title}`);
    expect(text).toContain('DRAFT - SIGNATURE REQUIRED');
    expect(text).toContain('Executive signature required before issue');
    expect(text).toContain(MOCK_BILLING_PREVIEW.student.name);
    expect(text).toContain(MOCK_BILLING_PREVIEW.boardName);
    expect(text).toContain(MOCK_BILLING_PREVIEW.className);
    expect(text).toContain('160 hours');
    expect(text).toContain('September 30, 2026');
    expect(text).toContain('March 30, 2027'); // six-month terms (contentVersion 2)
    expect(text).toContain('$7,500.00');
    expect(text).toContain(WAP_BILLING_LETTERHEAD.footer.phone);
    expect(text).not.toMatch(/Real Person|real@example\.com|real-case|SIGNED -|electronic signature|\/s\//u);
    const emails = text.match(/[a-z]+@[a-z.]+/gu) ?? [];
    expect(emails.length).toBeGreaterThan(0);
    expect(emails.every((email) => email.endsWith('@example.invalid'))).toBe(true);
    if (stage === 'j6') {
      expect(text).toContain('receiving signature not yet attested');
      expect(text).toContain(MOCK_BILLING_PREVIEW.voucherReference);
      expect(text).toContain('follow up in 10 to 14 days');
    } else {
      expect(text).not.toContain(MOCK_BILLING_PREVIEW.voucherReference);
      expect(text).not.toContain(MOCK_BILLING_PREVIEW.financePerson.email);
    }
    expect(mocks.readFile).toHaveBeenCalledExactlyOnceWith(join(process.cwd(), WAP_LOGO_PUBLIC_PATH));
    expect(mocks.databaseAccess).not.toHaveBeenCalled();
  });

  it('reports a render/input failure without leaking details or producing a document', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.readFile.mockRejectedValueOnce(new Error('private filesystem details'));
    try {
      const response = await preview('j5');
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual({
        code: 'INTERNAL_ERROR',
        error: 'Something went wrong before anything was changed. Reload and try again.',
      });
      expect(log).toHaveBeenCalledWith('[billing/two-stage mock preview GET]', expect.any(Error));
      expect(mocks.captureException).toHaveBeenCalledOnce();
      expect(mocks.databaseAccess).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe('synthetic billing facts', () => {
  it('contains no signable identity or receiving-signature attestation', () => {
    for (const stage of ['j5', 'j6'] as const) {
      const facts = getMockBillingDocumentFacts(stage, logoPng);
      expect(facts.documentNumber).toBe(`MOCK-${stage.toUpperCase()}-001`);
      expect(facts).not.toHaveProperty('signature');
      expect(facts).not.toHaveProperty('signed');
      expect(facts.signer).not.toHaveProperty('id');
      expect(facts.signer).not.toHaveProperty('principalId');
      expect(facts.student.email).toBe('student@example.invalid');
      expect(facts.counselor.email).toBe('counselor@example.invalid');
      if (facts.stage === 'j6') {
        expect(facts.financePerson.email).toBe('finance@example.invalid');
        expect(facts.signedVoucher.receivingSignatureAttestationId).toBeNull();
        expect(facts.signedVoucher.sha256).toBe('0'.repeat(64));
      }
    }
  });

  it('isolates logo bytes and nested facts from callers and keeps shared UI facts frozen', () => {
    const callerLogo = new Uint8Array(logoPng);
    const facts = getMockBillingDocumentFacts('j5', callerLogo);
    callerLogo.fill(0);
    expect(facts.letterhead.logoPng).toEqual(logoPng);
    expect(facts.student).not.toBe(MOCK_BILLING_PREVIEW.student);
    expect(Object.isFrozen(MOCK_BILLING_PREVIEW)).toBe(true);
    expect(Object.isFrozen(MOCK_BILLING_PREVIEW.student)).toBe(true);
    expect(Object.isFrozen(MOCK_BILLING_PREVIEW.documents.j6)).toBe(true);
  });
});
