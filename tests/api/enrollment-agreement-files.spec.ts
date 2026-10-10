// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ getBucket: vi.fn(), upload: vi.fn(), remove: vi.fn(), download: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ storage: { getBucket: storage.getBucket, from: storage.from } }) }));
import { readAgreementPdf } from '@/lib/enrollmentAgreements/pdf';
import { MAX_UPLOAD_BYTES } from '@/lib/enrollmentAgreements/types';
import { agreementPdfResponse, agreementSha256, agreementStoragePath, readStoredAgreementPdf, removeStagedAgreementPdf, storeAgreementPdf } from '@/lib/enrollmentAgreements/storage';
import { readBoundedBody } from '@/lib/enrollmentAgreements/http';

beforeEach(() => {
  vi.resetAllMocks();
  storage.getBucket.mockResolvedValue({ data: { public: false }, error: null });
  storage.from.mockReturnValue(storage);
  storage.upload.mockResolvedValue({ error: null }); storage.remove.mockResolvedValue({ error: null });
});

describe('bounded enrollment agreement PDF validation', () => {
  it('classifies a thrown private-bucket preflight as a definite pre-upload failure', async () => {
    storage.getBucket.mockRejectedValue(new Error('private upstream diagnostic'));
    await expect(storeAgreementPdf('synthetic.pdf', new Uint8Array([1])))
      .rejects.toMatchObject({ code: 'PRIVATE_STORAGE_UNAVAILABLE' });
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('preserves the exact supplied four-page template bytes, without running its JavaScript', async () => {
    const original = await readFile('assets/enrollment/workforceap-enrollment-2026.pdf');
    const bytes = await readAgreementPdf(new File([original], 'agreement.pdf', { type: 'application/pdf' }));
    expect(agreementSha256(bytes)).toBe('dee5087ba4503c3d38dfb10c8e149a630f5c8b72e3c9d8a045a306737afff3a5');
    expect(Buffer.compare(original, bytes)).toBe(0);
  }, 10000);
  it('rejects empty, wrongly typed, too-large and renamed files', async () => {
    await expect(readAgreementPdf(new File([], 'empty.pdf'))).rejects.toMatchObject({ code: 'EMPTY_PDF' });
    await expect(readAgreementPdf(new File(['html'], 'form.pdf', { type: 'text/html' }))).rejects.toMatchObject({ code: 'INVALID_PDF' });
    await expect(readAgreementPdf(new File(['html'], 'form.html', { type: 'application/pdf' }))).rejects.toMatchObject({ code: 'INVALID_PDF' });
    await expect(readAgreementPdf({ size: MAX_UPLOAD_BYTES + 1 } as File)).rejects.toMatchObject({ code: 'PDF_TOO_LARGE', status: 413 });
    await expect(readAgreementPdf(new File(['<html>Not a PDF</html>'], 'form.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ code: 'INVALID_PDF' });
  });
  it('rejects fake magic/EOF, missing EOF, and PDFs beyond the bounded page count', async () => {
    await expect(readAgreementPdf(new File(['%PDF-1.7\nnot a real document\n%%EOF'], 'fake.pdf'))).rejects.toMatchObject({ code: 'INVALID_PDF' });
    const doc = await PDFDocument.create(); doc.addPage(); const bytes = await doc.save();
    await expect(readAgreementPdf(new File([bytes.slice(0, -8)], 'truncated.pdf'))).rejects.toMatchObject({ code: 'INVALID_PDF' });
    for (let i = 1; i < 51; i += 1) doc.addPage();
    await expect(readAgreementPdf(new File([Uint8Array.from(await doc.save()).buffer], 'too-many-pages.pdf'))).rejects.toMatchObject({ code: 'INVALID_PDF' });
  }, 10000);
  it('accepts a plain scanned-style PDF without treating text as authenticated signatures', async () => {
    const doc = await PDFDocument.create(); doc.addPage().drawText('Synthetic student name. Not an authenticated signature.');
    const bytes = await doc.save();
    expect(await readAgreementPdf(new File([Uint8Array.from(bytes).buffer], 'scan.pdf', { type: 'application/pdf' }))).toEqual(bytes);
  });
  it('bounds streamed bodies even if Content-Length is absent or dishonest', async () => {
    const body = new Uint8Array(33);
    await expect(readBoundedBody(new Request('https://portal.test', { method: 'POST', body }), 32)).rejects.toMatchObject({ status: 413 });
    await expect(readBoundedBody(new Request('https://portal.test', { method: 'POST', body, headers: { 'content-length': '1' } }), 32)).rejects.toMatchObject({ status: 413 });
  });
});

describe('original-only PDF active-content policy', () => {
  async function assertRejected(document: PDFDocument) {
    const bytes = Uint8Array.from(await document.save()).buffer;
    await expect(readAgreementPdf(new File([bytes], 'agreement.pdf', { type: 'application/pdf' })))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_PDF_CONTENT', status: 400 });
  }
  async function blankDocument() {
    const document = await PDFDocument.create(); document.addPage(); return document;
  }
  async function originalDocument() {
    return PDFDocument.load(await readFile('assets/enrollment/workforceap-enrollment-2026.pdf'), { updateMetadata: false });
  }

  it.each(['Launch', 'GoToR', 'GoToE', 'ImportData', 'SubmitForm', 'URI', 'RichMediaExecute'])(
    'rejects %s actions, including actions hidden in indirect objects', async (action) => {
      const document = await blankDocument();
      document.context.register(document.context.obj({ Type: 'Action', S: action, F: PDFString.of('example.invalid') }));
      await assertRejected(document);
    },
  );
  it('rejects XFA, embedded payloads, and Filespec/EF attachments', async () => {
    const xfa = await blankDocument();
    xfa.catalog.set(PDFName.of('AcroForm'), xfa.context.obj({ XFA: PDFString.of('<template/>') }));
    await assertRejected(xfa);
    const attached = await blankDocument();
    await attached.attach(new Uint8Array([1, 2, 3]), 'payload.bin', { mimeType: 'application/octet-stream' });
    await assertRejected(attached);
    const orphan = await blankDocument();
    orphan.context.register(orphan.context.stream(new Uint8Array([1, 2, 3]), { Type: 'EmbeddedFile' }));
    await assertRejected(orphan);
  });
  it('rejects unknown string, compressed-stream, and oversized-stream JavaScript without executing it', async () => {
    const document = await blankDocument();
    document.addJavaScript('unknown', 'throw new Error("must never run");');
    await assertRejected(document);
    for (const script of ['throw new Error("must never run");', 'a'.repeat(9000)]) {
      const streamDocument = await originalDocument();
      const field = streamDocument.getForm().getTextField('Participant_Email').acroField.dict;
      const action = field.lookup(PDFName.of('AA'), PDFDict).lookup(PDFName.of('V'), PDFDict);
      action.set(PDFName.of('JS'), streamDocument.context.register(streamDocument.context.flateStream(script)));
      await assertRejected(streamDocument);
    }
  });
  it('rejects relocation of the exact approved Finalize script to document-open or chained execution', async () => {
    const relocated = await originalDocument();
    const finalize = relocated.getForm().getButton('Finalize_Form').acroField.dict.lookup(PDFName.of('A'), PDFDict);
    relocated.catalog.set(PDFName.of('OpenAction'), finalize);
    await assertRejected(relocated);
    const chained = await originalDocument();
    const chainedFinalize = chained.getForm().getButton('Finalize_Form').acroField.dict.lookup(PDFName.of('A'), PDFDict);
    chainedFinalize.set(PDFName.of('Next'), chained.context.obj({ S: 'GoTo', D: PDFString.of('somewhere') }));
    await assertRejected(chained);
  });
  it('does not trust an attachment named Content Credentials without exact original bytes and association', async () => {
    const spoof = await blankDocument();
    await spoof.attach(new Uint8Array([1, 2, 3]), 'Content Credentials', { mimeType: 'application/c2pa' });
    await assertRejected(spoof);
    const changed = await originalDocument();
    const names = changed.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
    const spec = names.lookup(1, PDFDict);
    spec.lookup(PDFName.of('EF'), PDFDict).set(PDFName.of('F'), changed.context.register(changed.context.flateStream(new Uint8Array([1, 2, 3]), { Type: 'EmbeddedFile', Subtype: 'application/c2pa' })));
    await assertRejected(changed);
    const moved = await originalDocument();
    const specToMove = moved.catalog.lookup(PDFName.of('AF'), PDFArray).get(0);
    moved.getPages()[0].node.set(PDFName.of('AF'), moved.context.obj([specToMove]));
    await assertRejected(moved);
  });
  it('accepts filled field values with unchanged approved scripts and credential blobs, preserving uploaded bytes', async () => {
    const document = await originalDocument();
    document.getForm().getTextField('Participant_Email').setText('synthetic-student@example.invalid');
    // Only test ingestion fidelity, not form appearance regeneration. The
    // uploaded bytes remain untouched; this fixture is never a delivered PDF.
    const bytes = Uint8Array.from(await document.save({ updateFieldAppearances: false }));
    const uploaded = await readAgreementPdf(new File([bytes.buffer], 'filled-agreement.pdf', { type: 'application/pdf' }));
    expect(uploaded).toEqual(bytes);
  }, 15000);
});

describe('private immutable storage and downloads', () => {
  it('refuses a public or absent bucket before writing', async () => {
    storage.getBucket.mockResolvedValue({ data: { public: true }, error: null });
    await expect(storeAgreementPdf('enrollment-agreements/member/id.pdf', new Uint8Array([1]))).rejects.toMatchObject({ code: 'PRIVATE_STORAGE_UNAVAILABLE' });
    storage.getBucket.mockResolvedValue({ data: null, error: { message: 'private provider details' } });
    await expect(storeAgreementPdf('enrollment-agreements/member/id.pdf', new Uint8Array([1]))).rejects.toMatchObject({ code: 'PRIVATE_STORAGE_UNAVAILABLE' });
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('never overwrites prior signed copies and limits compensation to the staged path', async () => {
    const path = agreementStoragePath('member', 'new-revision'); const bytes = new Uint8Array([1, 2]);
    await storeAgreementPdf(path, bytes);
    expect(storage.upload).toHaveBeenCalledExactlyOnceWith(path, bytes, { contentType: 'application/pdf', upsert: false, cacheControl: '0' });
    await removeStagedAgreementPdf(path); expect(storage.remove).toHaveBeenCalledExactlyOnceWith([path]);
  });
  it('fail-closes if storage cleanup cannot complete', async () => {
    storage.remove.mockResolvedValue({ error: { message: 'provider diagnostic' } });
    await expect(removeStagedAgreementPdf('enrollment-agreements/member/new.pdf')).rejects.toMatchObject({ code: 'UPLOAD_CLEANUP_UNAVAILABLE' });
  });
  it('checks ownership path, byte count and hash before serving original bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const row = { id: 'id', memberId: null, subjectMemberId: 'member', storagePath: agreementStoragePath('member', 'id'), sha256: agreementSha256(bytes), sizeBytes: 3 };
    storage.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    expect(await readStoredAgreementPdf(row)).toEqual(bytes);
    await expect(readStoredAgreementPdf({ ...row, storagePath: 'enrollment-agreements/other/id.pdf' })).rejects.toMatchObject({ code: 'DOCUMENT_UNAVAILABLE' });
    await expect(readStoredAgreementPdf({ ...row, sizeBytes: 4 })).rejects.toMatchObject({ code: 'DOCUMENT_UNAVAILABLE' });
    await expect(readStoredAgreementPdf({ ...row, sha256: '0'.repeat(64) })).rejects.toMatchObject({ code: 'DOCUMENT_UNAVAILABLE' });
  });
  it('downloads only as noncacheable sandboxed attachments, never an inline viewer or signed URL', async () => {
    const response = agreementPdfResponse(new Uint8Array([1, 2, 3]), 'enrollment-agreement.pdf');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="enrollment-agreement.pdf"');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
