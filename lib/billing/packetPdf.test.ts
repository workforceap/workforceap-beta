import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  letterheadLayout,
  packetDocumentFilename,
  parsePacketDownloadKind,
  renderJ5InvoicePdf,
  renderJ6CoverLetterPdf,
  renderPacketBundlePdf,
  sanitizePdfText,
  type PacketDocumentInput,
} from './packetPdf';
import { getTrainingProviderIdentity } from './providerIdentity';
import { buildJ6Facts, defaultCoverLetterNarrative } from './packetText';

// 1x1 transparent PNG.
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
    const j5 = await renderJ5InvoicePdf(input({ signatureImage: TINY_PNG }));
    assert.equal(await pageCount(j5), 1);
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

  it('builds safe filenames', () => {
    assert.equal(packetDocumentFilename('j5', 'WAP-2026-0001', "Tarrance O'Hopkins"), 'J5-training-invoice-WAP-2026-0001-tarrance-o-hopkins.pdf');
    assert.equal(packetDocumentFilename('j6', 'WAP-2026-0001', '   '), 'J6-cover-letter-WAP-2026-0001-participant.pdf');
    assert.equal(packetDocumentFilename('both', 'WAP-2026-0001', 'Tarrance Hopkins'), 'J5-J6-invoice-packet-WAP-2026-0001-tarrance-hopkins.pdf');
  });
});
