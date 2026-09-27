import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  letterheadLayout,
  isValidDrawnSignaturePng,
  packetDocumentFilename,
  parsePacketDownloadKind,
  renderJ5InvoicePdf,
  renderJ6CoverLetterPdf,
  renderPacketBundlePdf,
  sanitizePdfText,
  wrapTextWithinWidth,
  type PacketDocumentInput,
} from './packetPdf';
import { getTrainingProviderIdentity } from './providerIdentity';
import { buildJ6Facts, defaultCoverLetterNarrative } from './packetText';
import { extractTextFromResumeBuffer } from '@/lib/resume/extractTextFromResumeBuffer';

// 1x1 RGBA PNG with a visible pixel.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function input(overrides: Partial<PacketDocumentInput> = {}): PacketDocumentInput {
  return {
    packetNumber: 'WAP-2026-0001',
    invoiceDate: '2026-09-04',
    dueDate: '2026-10-04',
    billToName: 'Workforce Solutions Capital Area',
    billToAttention: 'Accounts Payable',
    billToAddress: '123 Main St\nAustin, TX 78701',
    billToEmail: 'ap@example.org',
    referenceNumber: 'ITA-2026-1',
    lineItems: [
      { description: 'IT Support Foundations', hours: 10, amount: 1250 },
      { description: 'A class with a deliberately long name that must wrap onto a second line inside the invoice table without overlapping the amount column', hours: 12.5, amount: 1250 },
      { description: 'Certification exam voucher(s)', hours: null, amount: 300 },
    ],
    totalAmount: 2800,
    coverLetterBody: 'Please find enclosed the invoice.\n\nThank you.',
    j6Facts: ['Billed to: Workforce Solutions Capital Area', '1. IT Support Foundations (10 contact hours): $1,250.00', 'Total due: $2,800.00'],
    signerName: 'Michael A. Brown, PMP, ChE',
    signerTitle: 'Executive Director',
    signatureImage: null,
    signedAt: new Date('2026-09-04T01:00:00Z'),
    member: { fullName: 'Tarrance Hopkins', email: 'tarrance@example.com' },
    programTitle: 'IT Support and Entry-level Cybersecurity Certificate',
    provider: getTrainingProviderIdentity(),
    logoPng: null,
    ...overrides,
  };
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

type PdfText = { str: string; x: number; y: number; width: number };

async function positionedText(bytes: Uint8Array): Promise<PdfText[][]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: bytes, useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const pages: PdfText[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      pages.push(content.items.filter((item) => 'str' in item).map((item) => ({
        str: item.str, x: item.transform[4], y: item.transform[5], width: item.width,
      })));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

function assertInsideLetterPage(pages: PdfText[][]) {
  for (const [pageIndex, page] of pages.entries()) {
    for (const item of page) {
      if (!item.str.trim()) continue;
      // pdf.js substitutes the standard fonts in Node; allow a few points for
      // its width estimate while still catching text that escapes the margin.
      assert.ok(item.x >= 53.5 && item.x + item.width <= 562, `page ${pageIndex + 1}: ${item.str} at x=${item.x}, width=${item.width}`);
      assert.ok(item.y >= 26 && item.y <= 770, `page ${pageIndex + 1}: ${item.str} at y=${item.y}`);
    }
  }
}

function compactText(pages: PdfText[][]): string {
  return pages.flat().map((item) => item.str).join('').replace(/\s/g, '');
}

describe('J5 / J6 PDF renderers', () => {
  it('renders a one-page J5 and J6 with a typed signature', async () => {
    const j5 = await renderJ5InvoicePdf(input());
    const j6 = await renderJ6CoverLetterPdf(input());
    assert.equal(Buffer.from(j5.slice(0, 5)).toString(), '%PDF-');
    assert.equal(Buffer.from(j6.slice(0, 5)).toString(), '%PDF-');
    assert.equal(await pageCount(j5), 1);
    assert.equal(await pageCount(j6), 1);
  });

  it('embeds a drawn PNG signature', async () => {
    assert.equal(await isValidDrawnSignaturePng(TINY_PNG), true);
    const j5 = await renderJ5InvoicePdf(input({ signatureImage: TINY_PNG }));
    assert.equal(await pageCount(j5), 1);
  });

  it('rejects a corrupt drawn signature instead of substituting an unacknowledged typed one', async () => {
    const corrupt = 'data:image/png;base64,AAAA';
    assert.equal(await isValidDrawnSignaturePng(corrupt), false);
    await assert.rejects(renderJ5InvoicePdf(input({ signatureImage: corrupt })), /drawn signature image is invalid/);
    await assert.rejects(renderJ6CoverLetterPdf(input({ signatureImage: corrupt })), /drawn signature image is invalid/);
  });

  it('keeps a full 10-class program to one page per document', async () => {
    // Regression guard: the 10-class Project Management program used to spill a
    // near-empty second page carrying only the signature block.
    const classes = [
      ['Project Management Fundamentals', 16],
      ['Team Building and Leadership in Project Management', 14],
      ['Project Manager Engagement with Stakeholders', 12],
      ['Process Groups and Processes in Project Management', 15],
      ['PMP Formulas', 16],
      ['Project Management Principles', 14],
      ['PM4R Agile: Agile Mindset in Development Projects', 21],
      ['PM4R Agile: 5 Steps for Hybrid Management of Projects', 19],
      ['Project Management Performance Domains', 14],
      ['PMP Application Process and Practice Exam', 19],
    ] as const;
    const lineItems = classes.map(([description, hours]) => ({ description, hours, amount: 750 }));
    const packet = input({
      lineItems,
      totalAmount: 7500,
      coverLetterBody: defaultCoverLetterNarrative('Workforce Advancement Project'),
      j6Facts: buildJ6Facts({
        invoiceDate: '2026-09-04',
        dueDate: '2026-10-04',
        billToName: 'Workforce Solutions Capital Area',
        referenceNumber: 'ITA-2026-4471',
        lineItems,
        funding: { fundingType: 'wioa_ita', approvedAmount: 7500, reference: 'TEST-ITA-1' },
      }),
      programTitle: 'Project Management Professional Certificate (Microsoft)',
    });
    assert.equal(await pageCount(await renderJ5InvoicePdf(packet)), 1);
    assert.equal(await pageCount(await renderJ6CoverLetterPdf(packet)), 1);
  });

  it('flows a long invoice and a long letter onto extra pages instead of running off the sheet', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ description: `Class ${i + 1}`, hours: 4, amount: 100 }));
    const j5 = await renderJ5InvoicePdf(input({ lineItems: many, totalAmount: 4500 }));
    assert.ok((await pageCount(j5)) >= 2);
    const longLetter = Array.from({ length: 30 }, () => 'A paragraph of cover letter text that repeats to force pagination in the renderer.').join('\n\n');
    const j6 = await renderJ6CoverLetterPdf(input({ coverLetterBody: longLetter }));
    assert.ok((await pageCount(j6)) >= 2);
  });

  it('preserves max-length bill-to text without clipping J5 or J6', async () => {
    const billToName = `BILLTOSTART ${'Regional Funding Partner '.repeat(10)}`.slice(0, 190) + ' BILLTOEND';
    const billToAttention = `ATTNSTART ${'Accounts Payable Department '.repeat(10)}`.slice(0, 191) + ' ATTNEND';
    const billToAddress = `ADDRESSSTART ${'Long Funding Office Address Lane '.repeat(20)}`.slice(0, 589) + ' ADDRESSEND';
    const billToEmail = `billing@${'x'.repeat(40)}.${'y'.repeat(40)}.${'z'.repeat(40)}.${'w'.repeat(40)}.${'q'.repeat(23)}.test`;
    assert.equal(billToName.length, 200);
    assert.equal(billToAttention.length, 199);
    assert.equal(billToAddress.length, 600);
    assert.equal(billToEmail.length, 200);

    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    for (const [value, size, width] of [
      [billToName, 10, 240],
      [billToAttention, 10, 240],
      [billToAddress, 10, 240],
      [billToEmail, 10, 240],
      [billToAddress, 10.5, 504],
      [billToEmail, 10.5, 504],
    ] as const) {
      const lines = wrapTextWithinWidth(value, font, size, width);
      assert.ok(lines.length > 1);
      assert.ok(lines.every((line) => font.widthOfTextAtSize(line, size) <= width), value);
      assert.equal(lines.join('').replace(/\s/g, ''), value.replace(/\s/g, ''));
    }

    const packet = input({ billToName, billToAttention, billToAddress, billToEmail });
    for (const pdf of [await renderJ5InvoicePdf(packet), await renderJ6CoverLetterPdf(packet)]) {
      assert.ok((await pageCount(pdf)) >= 1);
      const text = await extractTextFromResumeBuffer(Buffer.from(pdf), 'pdf');
      for (const marker of ['BILLTOSTART', 'BILLTOEND', 'ATTNSTART', 'ATTNEND', 'ADDRESSSTART', 'ADDRESSEND', 'q'.repeat(10)]) {
        assert.ok(text.includes(marker), `missing ${marker}`);
      }
    }
  });

  it('keeps long unbroken signed facts visible and inside both PDF pages', async () => {
    const reference = `REFSTART${'W'.repeat(105)}REFEND`;
    const description = `ROWSTART${'W'.repeat(186)}ROWEND`;
    const signerName = `SIGNERSTART${'W'.repeat(100)}SIGNEREND`;
    const signerTitle = `TITLESTART${'W'.repeat(98)}TITLEEND`;
    const legalName = `LEGALSTART${'W'.repeat(95)}LEGALEND`;
    const programTitle = `PROGRAMSTART${'W'.repeat(100)}PROGRAMEND`;
    const narrative = `NARRATIVESTART${'W'.repeat(280)}NARRATIVEEND`;
    const packet = input({
      referenceNumber: reference,
      lineItems: [{ description, hours: 10, amount: 1100 }],
      totalAmount: 1100,
      signerName,
      signerTitle,
      programTitle,
      coverLetterBody: narrative,
      j6Facts: [`Board / ITA / voucher reference: ${reference}`, `1. ${description}: $1,100.00`],
      provider: { ...getTrainingProviderIdentity(), legalName },
    });
    const [j5, j6] = await Promise.all([renderJ5InvoicePdf(packet), renderJ6CoverLetterPdf(packet)]);
    const [j5Pages, j6Pages] = await Promise.all([positionedText(j5), positionedText(j6)]);
    for (const pages of [j5Pages, j6Pages]) assertInsideLetterPage(pages);
    const j5Text = compactText(j5Pages);
    const j6Text = compactText(j6Pages);
    for (const value of [reference, description, signerName, signerTitle, legalName]) {
      assert.ok(j5Text.includes(value), `J5 lost ${value.slice(0, 16)}`);
      assert.ok(j6Text.includes(value), `J6 lost ${value.slice(0, 16)}`);
    }
    // J5 draws the bill-to and participant columns in parallel, so their
    // extracted text may interleave even though each participant line is intact.
    assert.ok(j5Text.includes('PROGRAMSTART') && j5Text.includes('PROGRAMEND'));
    assert.ok(j6Text.includes(programTitle));
    assert.ok(j6Text.includes(narrative), 'J6 lost unbroken narrative text');
  });

  it('never leaves a J5 table header behind when the first row moves to another page', async () => {
    const firstRow = `ROWSTART${'W'.repeat(186)}ROWEND`;
    for (let addressLines = 28; addressLines <= 44; addressLines++) {
      const packet = input({
        billToAddress: Array.from({ length: addressLines }, (_, i) => `Line ${i + 1}`).join('\n'),
        lineItems: [{ description: firstRow, hours: 10, amount: 1100 }],
        totalAmount: 1100,
      });
      const pages = await positionedText(await renderJ5InvoicePdf(packet));
      for (const [pageIndex, page] of pages.entries()) {
        const headerAt = page.findIndex((item) => item.str === 'CLASS / ITEM');
        if (headerAt < 0) continue;
        assert.ok(page.slice(headerAt + 1).some((item) => item.str === '1'), `orphan table header with ${addressLines} address lines on page ${pageIndex + 1}`);
      }
    }
  });

  it('survives characters the standard fonts cannot encode', async () => {
    const j6 = await renderJ6CoverLetterPdf(input({ member: { fullName: 'Zoë Ñuñez 🎓', email: 'z@example.com' }, coverLetterBody: 'Emoji 🎓 and CJK 漢字 get replaced, accents stay: café.' }));
    assert.equal(await pageCount(j6), 1);
    assert.equal(sanitizePdfText('café 🎓 漢'), 'café ? ?');
  });

  it('merges the cover letter and invoice into one downloadable file', async () => {
    const [j5, j6, bundle] = await Promise.all([
      renderJ5InvoicePdf(input()),
      renderJ6CoverLetterPdf(input()),
      renderPacketBundlePdf(input()),
    ]);
    const [j5Pages, j6Pages, bundlePages] = await Promise.all([pageCount(j5), pageCount(j6), pageCount(bundle)]);
    assert.equal(bundlePages, j5Pages + j6Pages);
    assert.equal(Buffer.from(bundle.slice(0, 5)).toString(), '%PDF-');
  });

  it('parses the doc query parameter, defaulting to the invoice', () => {
    assert.equal(parsePacketDownloadKind('j6'), 'j6');
    assert.equal(parsePacketDownloadKind('both'), 'both');
    assert.equal(parsePacketDownloadKind('j5'), 'j5');
    assert.equal(parsePacketDownloadKind(null), 'j5');
    assert.equal(parsePacketDownloadKind('nonsense'), 'j5');
  });

  it('fits the default letterhead in the standard band with nothing cut off', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const measure = (t: string, size: number) => font.widthOfTextAtSize(t, size);
    const provider = getTrainingProviderIdentity();
    const layout = letterheadLayout(provider, measure, 316);
    assert.equal(layout.headerH, 78);
    assert.ok(layout.contactLines.every((l) => !l.includes('…') && measure(l, layout.contactSize) <= 316));
    const joined = layout.contactLines.join('  |  ');
    for (const part of [...provider.addressLines, provider.phone, provider.website, provider.entityLine, `EIN ${provider.ein}`]) {
      assert.ok(joined.includes(part), part);
    }
    assert.equal(layout.contactLines[layout.contactLines.length - 1], `${provider.entityLine}  |  EIN ${provider.ein}`);
  });

  it('never truncates the legal entity or EIN, even with three long address lines', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    const measure = (t: string, size: number) => font.widthOfTextAtSize(t, size);
    // Synthetic long address; not a real value.
    const provider = {
      ...getTrainingProviderIdentity(),
      addressLines: [
        'Building 12, Innovation and Workforce Training Campus, 1234 Example Parkway North',
        'Suite 5000, Attention: Training Provider Accounts Receivable Department',
        'Example City, Texas 78000-1234, United States of America',
      ],
    };
    const layout = letterheadLayout(provider, measure, 316);
    const text = [...layout.nameLines, ...layout.contactLines].join('\n');
    assert.ok(text.includes(provider.entityLine), 'entity line intact');
    assert.ok(text.includes(`EIN ${provider.ein}`), 'EIN intact');
    for (const line of provider.addressLines) assert.ok(text.replace(/\n/g, ' ').includes(line), line);
    assert.ok(layout.contactSize >= 6);
    assert.ok(layout.contactLines.every((l) => measure(l, layout.contactSize) <= 316));
    // The PDF still renders on one page with the taller band.
    const bytes = await renderJ6CoverLetterPdf(input({ provider }));
    assert.equal(await pageCount(bytes), 1);
  });

  it('prints the generated facts block before the narrative on the J6', async () => {
    const bytes = await renderJ6CoverLetterPdf(input({ coverLetterBody: 'NARRATIVE-MARKER paragraph.' }));
    const text = await extractTextFromResumeBuffer(Buffer.from(bytes), 'pdf');
    const facts = text.indexOf('Invoice facts');
    const narrative = text.indexOf('NARRATIVE-MARKER');
    assert.ok(facts >= 0 && narrative > facts, `facts at ${facts}, narrative at ${narrative}`);
  });

  it('builds safe filenames', () => {
    assert.equal(packetDocumentFilename('j5', 'WAP-2026-0001', "Tarrance O'Hopkins"), 'J5-training-invoice-WAP-2026-0001-tarrance-o-hopkins.pdf');
    assert.equal(packetDocumentFilename('j6', 'WAP-2026-0001', '   '), 'J6-cover-letter-WAP-2026-0001-participant.pdf');
    assert.equal(packetDocumentFilename('both', 'WAP-2026-0001', 'Tarrance Hopkins'), 'J5-J6-invoice-packet-WAP-2026-0001-tarrance-hopkins.pdf');
  });
});
