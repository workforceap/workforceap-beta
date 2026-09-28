import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PROGRAM_SYLLABI } from '@/shared/programSyllabi';
import {
  renderJ5QuoteVoucherRequestDraftPdf,
  renderJ6InvoiceVoucherCoverLetterDraftPdf,
  type J5QuoteVoucherRequestFacts,
  type J6InvoiceVoucherCoverLetterFacts,
} from './documentPdf';

const logoPng = new Uint8Array(readFileSync(join(process.cwd(), 'public', 'images', 'logo-tight.png')));

function j5(overrides: Partial<J5QuoteVoucherRequestFacts> = {}): J5QuoteVoucherRequestFacts {
  return {
    stage: 'j5',
    documentNumber: 'SYNTH-J5-001',
    issueDate: '2026-09-27',
    frozenAt: '2026-09-27T18:30:00.000Z',
    student: { name: 'Jordan Example', email: 'jordan@example.test' },
    boardName: 'Workforce Solutions Capital',
    counselor: { name: 'Casey Counselor', email: 'casey@example.test', phone: '(555) 010-0201' },
    programSlug: 'data-analytics-professional-certificate-google',
    className: 'Management Analyst & Business Intelligence Professional Certificate',
    classHours: 160,
    classStartDate: '2026-09-30',
    classEndDate: '2027-02-28',
    tuitionCents: 750_000,
    tuitionLabel: 'Tuition & Fees',
    title: 'Quote / Voucher Request',
    signer: { name: 'Michael A. Brown, PMP, ChE', title: 'Executive Director' },
    letterhead: {
      logoPng,
      organizationName: 'Workforce Advancement Project',
      website: 'www.WorkforceAP.org',
      businessPhone: '(512) 825-2896',
      addressLine1: '207 Settlers Valley Suite C',
      addressLine2: 'Pflugerville, TX 78660',
    },
    ...overrides,
  };
}

function j6(overrides: Partial<J6InvoiceVoucherCoverLetterFacts> = {}): J6InvoiceVoucherCoverLetterFacts {
  const common = j5();
  return {
    ...common,
    stage: 'j6',
    documentNumber: 'SYNTH-J6-001',
    issueDate: '2026-10-01',
    frozenAt: '2026-10-01T18:30:00.000Z',
    title: 'Invoice / Voucher Cover Letter',
    financePerson: { name: 'Morgan Finance', email: 'morgan@example.test' },
    classStartedAt: '2026-09-30',
    paymentInstruction: 'Please arrange payment by check or wire to Workforce Advancement Project and confirm the expected remittance date.',
    paymentFollowUpWording: 'We will follow up in 10 to 14 days if payment has not been recorded.',
    signedVoucher: {
      reference: 'SYNTH-PO-001',
      receivedDate: '2026-09-30',
      authorizedAmountCents: 750_000,
      sha256: 'a'.repeat(64),
      receivingSignatureAttestationId: 'synthetic-attestation-001',
    },
    ...overrides,
  };
}

type ExtractedPdf = { text: string; positions: Array<{ x: number; y: number; width: number }> };

async function extract(bytes: Uint8Array): Promise<ExtractedPdf> {
  const task = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true });
  const pdf = await task.promise;
  try {
    assert.equal(pdf.numPages, 1);
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const items = content.items.flatMap((item) => 'str' in item ? [item] : []);
    return {
      text: items.map((item) => item.str).join(' '),
      positions: items.filter((item) => item.str.trim()).map((item) => ({ x: item.transform[4], y: item.transform[5], width: item.width })),
    };
  } finally {
    await pdf.destroy();
  }
}

describe('two-stage WAP billing PDFs', () => {
  it('renders a one-page J5 quote before any voucher or finance facts exist', async () => {
    const bytes = await renderJ5QuoteVoucherRequestDraftPdf(j5());
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
    const pdf = await PDFDocument.load(bytes);
    assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
    const { text } = await extract(bytes);
    assert.match(text, /\bJ5\b/u);
    assert.match(text, /Quote \/ Voucher Request/u);
    assert.match(text, /DRAFT - SIGNATURE REQUIRED/u);
    assert.match(text, /Casey Counselor \| casey@example\.test/u);
    assert.match(text, /Jordan Example \| jordan@example\.test/u);
    assert.match(text, /Management Analyst & Business Intelligence Professional Certificate/u);
    assert.match(text, /160 hours/u);
    assert.match(text, /September 30, 2026/u);
    assert.match(text, /February 28, 2027/u);
    assert.equal((text.match(/Tuition & Fees/gu) ?? []).length, 1);
    assert.match(text, /\$7,500\.00/u);
    assert.doesNotMatch(text, /SYNTH-PO-001|Training Invoice|Net 30|class-by-class|syllabus/iu);
  });

  it('renders a separate J6 cover letter that points to the received voucher and keeps 10-14 days as follow-up', async () => {
    const bytes = await renderJ6InvoiceVoucherCoverLetterDraftPdf(j6());
    if (process.env.WAP_PDF_PREVIEW_DIR) {
      mkdirSync(process.env.WAP_PDF_PREVIEW_DIR, { recursive: true });
      writeFileSync(join(process.env.WAP_PDF_PREVIEW_DIR, 'J5-synthetic-draft.pdf'), await renderJ5QuoteVoucherRequestDraftPdf(j5()));
      writeFileSync(join(process.env.WAP_PDF_PREVIEW_DIR, 'J6-synthetic-draft.pdf'), bytes);
    }
    const { text } = await extract(bytes);
    assert.match(text, /\bJ6\b/u);
    assert.match(text, /Invoice \/ Voucher Cover Letter/u);
    assert.match(text, /Morgan Finance \| morgan@example\.test/u);
    assert.match(text, /COPY\s+Casey Counselor; Jordan Example/u);
    assert.match(text, /signed voucher SYNTH-PO-001/u);
    assert.match(text, /Enclosure for issued packet: received, signed training voucher SYNTH-PO-001/u);
    assert.match(text, /follow up in 10 to 14 days/u);
    assert.equal((text.match(/Tuition & Fees/gu) ?? []).length, 1);
    assert.match(text, /\$7,500\.00/u);
    assert.doesNotMatch(text, /Net 14|Net 30|Due Date|class-by-class|syllabus|Training Invoice/iu);
  });

  it('never marks a draft signed, including when a JS caller smuggles a signature field', async () => {
    const text = (await extract(await renderJ5QuoteVoucherRequestDraftPdf(j5()))).text;
    assert.match(text, /DRAFT - SIGNATURE REQUIRED/u);
    assert.match(text, /Executive signature required before issue/u);
    assert.doesNotMatch(text, /SIGNED -|Approval reference|typed signature|electronic signature|\/s\//iu);
    await assert.rejects(
      renderJ5QuoteVoucherRequestDraftPdf({ ...j5(), signature: { mode: 'signed' } } as J5QuoteVoucherRequestFacts),
      /drafts only/u,
    );
  });

  it('uses frozen facts to produce repeatable bytes without wall-clock input', async () => {
    const input = j5();
    const first = await renderJ5QuoteVoucherRequestDraftPdf(input);
    const second = await renderJ5QuoteVoucherRequestDraftPdf(input);
    assert.deepEqual(first, second);
    assert.equal((await PDFDocument.load(first)).getCreationDate()?.toISOString(), '2026-09-27T18:30:00.000Z');
  });

  it('snapshots the caller logo and text at invocation, before pdf-lib awaits', async () => {
    const ownedLogo = new Uint8Array(logoPng);
    const input = j5({ letterhead: { ...j5().letterhead, logoPng: ownedLogo } });
    const pending = renderJ5QuoteVoucherRequestDraftPdf(input);
    ownedLogo.fill(0);
    (input.student as { name: string }).name = 'Changed After Invocation';
    const text = (await extract(await pending)).text;
    assert.match(text, /Jordan Example/u);
    assert.doesNotMatch(text, /Changed After Invocation/u);
  });

  it('fits the approved syllabus title for every canonical program', async () => {
    for (const syllabus of Object.values(PROGRAM_SYLLABI)) {
      const bytes = await renderJ5QuoteVoucherRequestDraftPdf(j5({
        programSlug: syllabus.slug,
        className: syllabus.title,
        classHours: syllabus.totalHours as 160 | 200,
      }));
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1, syllabus.slug);
    }
  });

  it('renders the approved IBM software program at 200 hours as an unsigned J6 draft', async () => {
    const bytes = await renderJ6InvoiceVoucherCoverLetterDraftPdf(j6({
      programSlug: 'software-developer-professional-certificate-ibm',
      className: 'AI and Software Developer Professional Certificate (IBM)',
      classHours: 200,
    }));
    const { text } = await extract(bytes);
    assert.match(text, /AI and Software Developer/u);
    assert.match(text, /200 hours/u);
    assert.match(text, /DRAFT - SIGNATURE REQUIRED/u);
  });

  it('keeps every text item within the letter page and outside the footer collision zone', async () => {
    for (const bytes of [await renderJ5QuoteVoucherRequestDraftPdf(j5()), await renderJ6InvoiceVoucherCoverLetterDraftPdf(j6())]) {
      const { positions } = await extract(bytes);
      assert.ok(positions.length > 25);
      for (const position of positions) {
        assert.ok(position.x >= 24, `text x=${position.x} escaped left margin`);
        assert.ok(position.x + position.width <= 590, `text escaped right edge`);
        assert.ok(position.y >= 25 && position.y <= 775, `text y=${position.y} escaped page`);
      }
    }
  });

  it('rejects altered price, dates, missing logo, missing voucher proof and long layout fields', async () => {
    await assert.rejects(renderJ5QuoteVoucherRequestDraftPdf(j5({ tuitionCents: 700_000 as 750_000 })), /\$7,500/u);
    await assert.rejects(renderJ5QuoteVoucherRequestDraftPdf(j5({ classEndDate: '2027-03-01' })), /five calendar months/u);
    await assert.rejects(renderJ5QuoteVoucherRequestDraftPdf(j5({ letterhead: { ...j5().letterhead, logoPng: new Uint8Array() } })), /logo PNG/u);
    await assert.rejects(renderJ6InvoiceVoucherCoverLetterDraftPdf(j6({ signedVoucher: { ...j6().signedVoucher, sha256: '' } })), /SHA-256/u);
    await assert.rejects(renderJ6InvoiceVoucherCoverLetterDraftPdf(j6({ signedVoucher: { ...j6().signedVoucher, authorizedAmountCents: 700_000 } })), /authorized amount.*\$7,500/u);
    await assert.rejects(renderJ6InvoiceVoucherCoverLetterDraftPdf(j6({ classStartedAt: '2026-10-02' })), /class start/u);
    await assert.rejects(renderJ6InvoiceVoucherCoverLetterDraftPdf(j6({ classStartedAt: '2026-09-29' })), /confirmed class start/u);
    await assert.rejects(renderJ5QuoteVoucherRequestDraftPdf(j5({ counselor: { ...j5().counselor, email: `${'x'.repeat(170)}@example.test` } })), /does not fit/u);
  });

  it('rejects mismatched IBM and non-IBM hours, unknown slugs, aliases and title switches', async () => {
    const ibm = {
      programSlug: 'software-developer-professional-certificate-ibm',
      className: 'AI and Software Developer Professional Certificate (IBM)',
    } as const;
    await assert.rejects(renderJ5QuoteVoucherRequestDraftPdf(j5({ ...ibm, classHours: 160 })), /approved 200-hour syllabus/u);
    await assert.rejects(renderJ5QuoteVoucherRequestDraftPdf(j5({ classHours: 200 })), /approved 160-hour syllabus/u);
    await assert.rejects(renderJ5QuoteVoucherRequestDraftPdf(j5({ programSlug: 'ai-software' })), /approved program syllabus/u);
    await assert.rejects(renderJ5QuoteVoucherRequestDraftPdf(j5({ ...ibm, programSlug: 'ai-and-software-development-professional-certificate-ibm', classHours: 200 })), /Canonical program slug/u);
    await assert.rejects(renderJ5QuoteVoucherRequestDraftPdf(j5({ className: ibm.className })), /Class name must match/u);
  });

  it('refuses a runtime stage switch through either stage-specific wrapper', () => {
    assert.throws(() => renderJ5QuoteVoucherRequestDraftPdf(j6() as unknown as J5QuoteVoucherRequestFacts), /J5 renderer requires J5/u);
    assert.throws(() => renderJ6InvoiceVoucherCoverLetterDraftPdf(j5() as unknown as J6InvoiceVoucherCoverLetterFacts), /J6 renderer requires J6/u);
  });
});
