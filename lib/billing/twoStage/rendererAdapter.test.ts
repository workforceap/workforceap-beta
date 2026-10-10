import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Attestation } from './attestations';
import { sha256Hex } from './canonical';
import { buildJ5Content, buildJ6Content, type J5Content, type J6Content } from './content';
import { WAP_LOGO_PUBLIC_PATH } from './letterhead';
import { syntheticPng } from '../../../tests/fixtures/billing/syntheticPng';
import { formatUsdCents } from './lineItem';
import {
  FIXED_PRINTED_TEXT,
  fixedPrintedText,
  printableIssues,
  printedContentFields,
  printedLongDate,
  RendererAdapterError,
  renderDraftFromContent,
  renderMockJ5FromContent,
  renderSignedFromContent,
  toRendererFacts,
  VOUCHER_REFERENCE_MAX,
  type TwoStageContent,
} from './rendererAdapter';

const logoPng = new Uint8Array(readFileSync(join(process.cwd(), WAP_LOGO_PUBLIC_PATH)));
const logoSha256 = sha256Hex(logoPng);
const SLUG = 'data-analytics-professional-certificate-google';
const NOW = new Date('2026-10-01T18:00:00.000Z');
/** A generated stand-in for the designated signer's approved image. No real signature is used or committed. */
const signaturePng = new Uint8Array(syntheticPng(360, 90));
const signatureAsset = { assetId: 'sig-asset-synthetic', assetSha256: sha256Hex(signaturePng) };

function attestation(overrides: Partial<Attestation>): Attestation {
  return {
    id: 'att-0000',
    kind: 'j5_readiness',
    statement: 'synthetic',
    evidenceReference: 'synthetic evidence',
    classStartDate: null,
    classEndDate: null,
    artifactId: null,
    voucherReference: null,
    authorizedAmountCents: null,
    authorizedStartDate: null,
    authorizedEndDate: null,
    receivedOn: null,
    receivingSignaturePresent: null,
    externalReference: null,
    externalQuoteDate: null,
    quotedProgramSlug: null,
    quotedClassName: null,
    authorizedProgramSlug: null,
    authorizedClassName: null,
    studentReadyConfirmed: null,
    counselorRequestedBy: null,
    counselorRequestedOn: null,
    counselorRequestReference: null,
    attestedBySubjectId: '00000000-0000-4000-8000-000000000001',
    attestedAt: '2026-09-20T15:00:00.000Z',
    ...overrides,
  };
}

const contacts = {
  student: { name: 'Jordan Éxample', email: 'jordan@example.test' },
  counselor: { name: 'Casey O’Counselor', email: 'casey@example.test', phone: '(555) 010-0201' },
  boardName: 'Workforce Solutions Capital Area',
};

function j5(overrides: Partial<Parameters<typeof buildJ5Content>[0]> = {}): J5Content {
  const built = buildJ5Content({
    documentNumber: 'WAP-Q-2026-0001',
    logoSha256,
    issueDate: '2026-09-21',
    ...contacts,
    signatureAsset,
    programSlug: SLUG,
    readiness: attestation({
      id: 'att-ready',
      kind: 'j5_readiness',
      classStartDate: '2026-09-30',
      studentReadyConfirmed: true,
      counselorRequestedBy: 'Casey O’Counselor',
      counselorRequestedOn: '2026-09-19',
      counselorRequestReference: 'Email 2026-09-19',
    }),
    ...overrides,
  });
  assert.ok(built.ok, built.ok ? '' : built.errors.join('; '));
  return built.content;
}

function j6(
  overrides: { voucherReference?: string; authorizedEndDate?: string; student?: { name: string; email: string }; counselor?: { name: string; email: string; phone: string }; boardName?: string; finance?: { name: string; email: string } } = {},
): J6Content {
  const quote = j5();
  const className = quote.training.className;
  const built = buildJ6Content({
    now: NOW,
    hasOpenJ6: false,
    programSlug: SLUG,
    priorJ5: { source: 'system', j5: { recordId: 'rec-j5', status: 'sent', content: quote, contentSha256: 'b'.repeat(64) } },
    classStarted: attestation({ id: 'att-start', kind: 'class_started', classStartDate: '2026-09-30', classEndDate: '2027-03-30' }),
    voucher: { id: 'art-voucher', kind: 'board_signed_voucher', fileName: 'voucher.pdf', mimeType: 'application/pdf', byteLength: 1234, sha256: 'c'.repeat(64) },
    voucherAttestation: attestation({
      id: 'att-voucher',
      kind: 'voucher_board_signed',
      artifactId: 'art-voucher',
      voucherReference: overrides.voucherReference ?? 'PO–44871-A',
      authorizedAmountCents: 750_000,
      authorizedProgramSlug: SLUG,
      authorizedClassName: className,
      authorizedStartDate: '2026-09-30',
      authorizedEndDate: overrides.authorizedEndDate ?? '2027-03-30',
      receivedOn: '2026-09-29',
      receivingSignaturePresent: true,
    }),
    boardInvoice: null,
    documentNumber: 'WAP-I-2026-0001',
    logoSha256,
    signatureAsset,
    issueDate: '2026-10-01',
    student: overrides.student ?? contacts.student,
    counselor: overrides.counselor ?? contacts.counselor,
    boardName: overrides.boardName ?? contacts.boardName,
    finance: overrides.finance ?? { name: 'Morgan Finance', email: 'finance@example.test' },
  });
  assert.ok(built.ok, built.ok ? '' : built.errors.join('; '));
  return built.content;
}

/**
 * Page text in reading order (top to bottom, then left to right). Text items
 * are joined with one space and never collapsed inside, so a bound value
 * whose spacing the renderer changed would not be found verbatim.
 */
async function pageText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true }).promise;
  try {
    assert.equal(pdf.numPages, 1);
    const content = await (await pdf.getPage(1)).getTextContent();
    const items = content.items.flatMap((item) => ('str' in item && item.str.trim() ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }] : []));
    // Items within 3 pt vertically are one visual row (a label and its value, the price row).
    items.sort((a, b) => (Math.abs(a.y - b.y) <= 3 ? a.x - b.x : b.y - a.y));
    return items
      .map((item) => item.str.trim())
      .join(' ')
      .trim();
  } finally {
    await pdf.destroy();
  }
}

const collapse = (s: string) => s.replace(/\s+/gu, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Every value the page may print that comes from content (fields plus derived forms). */
function contentSourcedStrings(content: TwoStageContent): string[] {
  const values = printedContentFields(content).map((f) => f.value);
  values.push(
    printedLongDate(content.issueDate),
    printedLongDate(content.training.classStartDate),
    printedLongDate(content.training.classEndDate),
    `${content.training.contactHours} hours`,
    formatUsdCents(content.totalCents),
    content.kind === 'j5_quote_voucher_request' ? 'J5' : 'J6',
  );
  return values;
}

/** Remove the fixed sentences, then content values, then fixed labels; return what is left. */
function unsourcedRemainder(text: string, content: TwoStageContent, opts: { receiptPending?: boolean } = {}): string {
  let rest = ` ${text} `;
  for (const sentence of fixedPrintedText(content, opts).map(collapse).sort((a, b) => b.length - a.length)) {
    assert.ok(rest.includes(sentence), `fixed sentence not printed: ${sentence}`);
    rest = rest.split(sentence).join(' ');
  }
  // Bound values are matched exactly as frozen, never collapsed.
  for (const value of contentSourcedStrings(content).sort((a, b) => b.length - a.length)) rest = rest.split(value).join(' ');
  for (const label of [...FIXED_PRINTED_TEXT.labels].sort((a, b) => b.length - a.length)) {
    rest = rest.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(label)}(?![\\p{L}\\p{N}])`, 'gu'), ' ');
  }
  return collapse(rest);
}

describe('two-stage renderer adapter: every printed field comes from frozen content', () => {
  it('mocks the exact saved J5, ignores frozen signature metadata, and preserves legacy dates', async () => {
    for (const version of [1, 2] as const) {
      const content: J5Content = { ...j5(), contentVersion: version };
      content.training = { ...content.training, classEndDate: version === 1 ? '2027-02-28' : '2027-03-30' };
      const before = JSON.stringify(content);
      const bytes = await renderMockJ5FromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z' });
      const text = await pageText(new Uint8Array(bytes));
      assert.match(text, /MOCK - REVIEW ONLY - NOT SIGNED/u);
      assert.ok(text.includes(printedLongDate(content.training.classEndDate)));
      for (const { field, value } of printedContentFields(content)) assert.ok(text.includes(value), field);
      assert.equal((await placedImages(bytes)).length, 1, 'only the logo, despite the saved signature asset id');
      assert.equal(JSON.stringify(content), before);
    }
    await assert.rejects(renderMockJ5FromContent(j6(), { logoPng, frozenAt: '2026-10-01T18:30:00.000Z' }), /only for a saved J5/u);
  });

  it('previews historical V1 snapshots without changing their dates or hashes', async () => {
    const content: J5Content = { ...j5(), contentVersion: 1 };
    content.training = { ...content.training, classEndDate: '2027-02-28' };
    const before = JSON.stringify(content);
    const text = await pageText(await renderDraftFromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z' }));
    assert.ok(text.includes('February 28, 2027'));
    assert.equal(JSON.stringify(content), before);
    await assert.rejects(renderDraftFromContent({ ...content, contentVersion: 2 }, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z' }));
  });

  for (const [name, build] of [
    ['J5', () => j5()],
    ['J6', () => j6()],
  ] as const) {
    it(`${name}: every printed content field appears exactly as frozen`, async () => {
      const content: TwoStageContent = build();
      const text = await pageText(await renderDraftFromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' }));
      for (const { field, value } of printedContentFields(content)) {
        assert.ok(text.includes(value), `${field} (${value}) is not printed verbatim`);
      }
      // The M1 constants reach the page unchanged (dashes, spacing, punctuation).
      assert.ok(text.includes(content.title));
      assert.ok(text.includes(`${content.signer.name} ${content.signer.title}, ${content.letterhead.headerLines[0]}`));
      assert.ok(text.includes(`${content.letterhead.footer.website} | ${content.letterhead.footer.phone}`));
      assert.ok(text.includes(content.letterhead.footer.addressLines.join(' | ')));
      if (content.kind === 'j6_invoice_cover_letter') assert.ok(text.includes(content.paymentFollowUp.wording));
    });

    it(`${name}: nothing is printed that is not content or reviewed fixed wording`, async () => {
      const content: TwoStageContent = build();
      const text = await pageText(await renderDraftFromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' }));
      assert.match(unsourcedRemainder(text, content), /^[\s|;,]*$/u);
    });
  }

  it('changing any bound letterhead, title, signer or payment string changes the PDF text', async () => {
    const base = j6();
    const variants: Array<[string, J6Content]> = [
      ['header', { ...base, letterhead: { ...base.letterhead, headerLines: ['Synthetic Org', 'www.synthetic.test'] } }],
      ['footer', { ...base, letterhead: { ...base.letterhead, footer: { website: 'www.synthetic.test', phone: '(555) 000-1111', address: '1 Synthetic Way, Austin, TX 78701', addressLines: ['1 Synthetic Way', 'Austin, TX 78701'] } } }],
      ['title', { ...base, title: 'Synthetic Cover Letter' }],
      ['signer', { ...base, signer: { name: 'Synthetic Signer', title: 'Director', line: 'Synthetic Signer — Director' } }],
      ['one-line address', { ...base, letterhead: { ...base.letterhead, footer: { ...base.letterhead.footer, addressLines: ['207 Settlers Valley Suite C, Pflugerville, TX 78660'] } } }],
      ['payment', { ...base, paymentFollowUp: { ...base.paymentFollowUp, instruction: 'Synthetic instruction.', wording: 'Synthetic follow-up wording.' } }],
    ];
    for (const [label, content] of variants) {
      const text = await pageText(await renderDraftFromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' }));
      for (const { field, value } of printedContentFields(content)) assert.ok(text.includes(value), `${label}: ${field}`);
      assert.match(unsourcedRemainder(text, content), /^[\s|;,]*$/u, label);
    }
  });

  it('matches the approved J5 and J6 layout references line for line (synthetic fixture)', async () => {
    const ref = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/billing/two-stage-layout-reference.json'), 'utf8')) as {
      contacts: { student: { name: string; email: string }; counselor: { name: string; email: string; phone: string }; finance: { name: string; email: string }; boardName: string; voucherReference: string };
      approvedFrozenStrings: { titleJ5: string; titleJ6: string; organizationName: string; website: string; phone: string; addressLines: string[]; signerName: string; signerTitle: string; paymentFollowUp: string };
      j5: string[];
      j6: string[];
    };
    const a = ref.approvedFrozenStrings;
    // M1 now freezes exactly the approved strings (checked below), so the content is used as built.
    const refContacts = { student: ref.contacts.student, counselor: ref.contacts.counselor, boardName: ref.contacts.boardName };
    const quote = j5({ ...refContacts, issueDate: '2026-09-27' });
    const letter = j6({ voucherReference: ref.contacts.voucherReference, ...refContacts, finance: ref.contacts.finance });
    for (const [content, lines] of [[quote, ref.j5], [letter, ref.j6]] as const) {
      const expected = collapse(lines.map((line) => line.replace('{className}', content.training.className).replace('{classDescription}', content.training.classDescription ?? '')).join(' '));
      const text = await pageText(await renderDraftFromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' }));
      assert.equal(text, expected, content.kind);
    }
    // Sep 30 start -> Mar 30 end: exactly six calendar months.
    assert.equal(quote.training.classStartDate, '2026-09-30');
    assert.equal(quote.training.classEndDate, '2027-03-30');
    assert.equal(a.phone, '(512) 825-2896');
  });

  it('M1 frozen constants equal the approved reference strings', () => {
    const ref = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/billing/two-stage-layout-reference.json'), 'utf8')) as { approvedFrozenStrings: Record<string, unknown> };
    const a = ref.approvedFrozenStrings;
    const quote = j5();
    const letter = j6();
    assert.equal(quote.title, a.titleJ5);
    assert.equal(letter.title, a.titleJ6);
    assert.equal(quote.letterhead.headerLines[0], a.organizationName);
    assert.equal(quote.letterhead.footer.phone, a.phone);
    assert.deepEqual(quote.letterhead.footer.addressLines, a.addressLines);
    assert.equal(quote.letterhead.footer.website, a.website);
    assert.equal(quote.signer.name, a.signerName);
    assert.equal(quote.signer.title, a.signerTitle);
    assert.equal(letter.paymentFollowUp.wording, a.paymentFollowUp);
    assert.equal(letter.paymentFollowUp.instruction, a.paymentInstruction);
  });

  it('refuses logo bytes that differ from the frozen hash (LOGO_CHANGED)', () => {
    const other = new Uint8Array(logoPng);
    other[other.length - 1] ^= 0xff;
    assert.throws(() => toRendererFacts(j5(), { logoPng: other, frozenAt: '2026-10-01T18:30:00.000Z' }), (e: unknown) => e instanceof RendererAdapterError && e.code === 'LOGO_CHANGED');
  });

  it('renders a held J6 DRAFT for review with the on-hold badge (open holds never block a preview)', async () => {
    const held = j6({ authorizedEndDate: '2027-01-31' });
    assert.deepEqual(held.reviewReasons, ['voucher_period_conflict']);
    const text = await pageText(await renderDraftFromContent(held, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' }));
    assert.ok(text.startsWith('DRAFT - ON HOLD - NOT SIGNABLE'));
    assert.doesNotMatch(text, /DRAFT - SIGNATURE REQUIRED/u);
    assert.match(unsourcedRemainder(text, held), /^[\s|;,]*$/u);
  });

  it('flags a voucher reference over 80 characters and unprintable glyphs with the field', () => {
    assert.equal(VOUCHER_REFERENCE_MAX, 80);
    const long = j6({ voucherReference: 'P'.repeat(81) });
    assert.deepEqual(printableIssues(long).map((i) => [i.code, i.field]), [['VOUCHER_REFERENCE_TOO_LONG', 'voucher.reference']]);
    const glyph = { ...j5(), student: { name: 'Nguyễn Văn', email: 'jordan@example.test' } };
    assert.deepEqual(printableIssues(glyph).map((i) => [i.code, i.field]), [['TEXT_NOT_PRINTABLE', 'student.name']]);
    assert.throws(() => toRendererFacts(glyph, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' }), (e: unknown) => e instanceof RendererAdapterError && e.field === 'student.name');
  });

  it('refuses spacing the page would not print as typed (double space, NBSP, thin space), before rendering', async () => {
    for (const reference of ['PO  44871', 'PO\u00a044871', 'PO\u200944871']) {
      const content = j6({ voucherReference: reference });
      assert.deepEqual(printableIssues(content).map((i) => [i.code, i.field]), [['TEXT_NOT_PRINTABLE', 'voucher.reference']], JSON.stringify(reference));
      await assert.rejects(renderDraftFromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' }), (e: unknown) => e instanceof RendererAdapterError && e.code === 'TEXT_NOT_PRINTABLE');
    }
    const board = { ...j5(), boardName: 'Capital  Area Workforce Board' };
    assert.deepEqual(printableIssues(board).map((i) => i.field), ['boardName']);
  });

  it('maps a layout refusal from the renderer to TEXT_NOT_PRINTABLE', async () => {
    const wide = { ...j5(), boardName: 'W'.repeat(100) };
    assert.deepEqual(printableIssues(wide), []);
    await assert.rejects(renderDraftFromContent(wide, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' }), (e: unknown) => e instanceof RendererAdapterError && e.code === 'TEXT_NOT_PRINTABLE');
  });

  it('J6 DRAFT without the designated signer receipt attestation prints the pending enclosure line', async () => {
    const content = j6();
    const pendingFacts = toRendererFacts(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z' });
    assert.ok(pendingFacts.stage === 'j6' && pendingFacts.signedVoucher.receivingSignatureAttestationId === null);
    const text = await pageText(await renderDraftFromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: null }));
    assert.ok(text.includes(`Enclosure for issued packet: received, signed training voucher ${content.voucher.reference} (receiving signature not yet attested)`));
    assert.match(unsourcedRemainder(text, content, { receiptPending: true }), /^[\s|;,]*$/u);
    // With the attestation the pending note is gone, and the staff voucher attestation id is never used in its place.
    const facts = toRendererFacts(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' });
    assert.ok(facts.stage === 'j6' && facts.signedVoucher.receivingSignatureAttestationId === 'rsig-0001');
    assert.notEqual(content.voucher.attestationId, 'rsig-0001');
    const signedText = await pageText(await renderDraftFromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' }));
    assert.doesNotMatch(signedText, /not yet attested/u);
  });

  it('wraps a long voucher reference on the pending enclosure line instead of overflowing', async () => {
    const content = j6({ voucherReference: 'PO-2026-WSCA-000123-ITSUPPORT-REISSUED-B' });
    const text = await pageText(await renderDraftFromContent(content, { logoPng, frozenAt: '2026-10-01T18:30:00.000Z' }));
    assert.ok(text.includes('(receiving signature not yet attested)'));
  });

  it('J5 renderer input never carries J6 voucher or finance facts', () => {
    const facts = toRendererFacts(j5(), { logoPng, frozenAt: '2026-10-01T18:30:00.000Z', receiptSignatureId: 'rsig-0001' });
    assert.equal(facts.stage, 'j5');
    assert.ok(!('signedVoucher' in facts) && !('financePerson' in facts));
  });
});

// ---------------------------------------------------------------------------
// The FINAL (signed) page.

const FROZEN_AT = '2026-10-01T18:30:00.000Z';
const DRAFT_ONLY_TEXT = ['DRAFT - SIGNATURE REQUIRED', 'Executive signature required before issue'];

/** Images placed on the page in draw order, with the transform each is painted under (pdfjs operator list). */
async function placedImages(bytes: Uint8Array): Promise<Array<{ width: number; height: number; x: number; y: number }>> {
  const pdf = await getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true }).promise;
  try {
    const list = await (await pdf.getPage(1)).getOperatorList();
    type M = [number, number, number, number, number, number];
    const mul = (m: M, n: M): M => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
    let ctm: M = [1, 0, 0, 1, 0, 0];
    const stack: M[] = [];
    const out: Array<{ width: number; height: number; x: number; y: number }> = [];
    list.fnArray.forEach((fn, i) => {
      const args = list.argsArray[i] as unknown;
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
      else if (fn === OPS.transform) ctm = mul(ctm, args as M);
      else if (fn === OPS.paintImageXObject) out.push({ width: ctm[0], height: ctm[3], x: ctm[4], y: ctm[5] });
    });
    return out;
  } finally {
    await pdf.destroy();
  }
}

describe('two-stage renderer adapter: the signed page', () => {
  for (const [name, build] of [
    ['J5', () => j5()],
    ['J6', () => j6()],
  ] as const) {
    it(`${name}: the approved layout with exactly two differences - no draft markers, and the frozen signature image`, async () => {
      const content: TwoStageContent = build();
      const opts = { logoPng, frozenAt: FROZEN_AT, receiptSignatureId: 'rsig-0001' };
      const draft = await renderDraftFromContent(content, opts);
      const signed = await renderSignedFromContent(content, { ...opts, signaturePng });

      // Text: the draft page minus the two draft-only strings, nothing added.
      // pdfjs takes ownership of the buffer it is given, so every read gets its own copy.
      let expected = await pageText(Uint8Array.from(draft));
      for (const marker of DRAFT_ONLY_TEXT) {
        assert.ok(expected.includes(marker), `draft prints ${marker}`);
        expected = expected.replace(marker, ' ');
      }
      const signedText = await pageText(Uint8Array.from(signed));
      assert.equal(collapse(signedText), collapse(expected));
      for (const marker of DRAFT_ONLY_TEXT) assert.ok(!signedText.includes(marker), `signed page must not print ${marker}`);
      assert.doesNotMatch(signedText, /DRAFT|not yet attested/iu);

      // Images: the draft carries the logo; the signed page carries the logo plus the signature.
      const draftImages = await placedImages(Uint8Array.from(draft));
      const signedImages = await placedImages(Uint8Array.from(signed));
      assert.equal(draftImages.length, 1);
      assert.equal(signedImages.length, 2);
      const sig = signedImages[1];
      assert.ok(sig.width <= 240 + 0.01 && sig.height <= 26 + 0.01, `signature ${sig.width}x${sig.height} fits its box`);
      assert.ok(Math.abs(sig.width / sig.height - 4) < 0.01, 'the image keeps its aspect ratio');
      assert.ok(sig.x >= 54 && sig.x + sig.width <= 54 + 245, 'the image sits over the signature rule');
    });

    it(`${name}: signed bytes are deterministic for the same inputs`, async () => {
      const content: TwoStageContent = build();
      const opts = { logoPng, signaturePng, frozenAt: FROZEN_AT, receiptSignatureId: 'rsig-0001' };
      const a = await renderSignedFromContent(content, opts);
      const b = await renderSignedFromContent(content, opts);
      assert.equal(sha256Hex(a), sha256Hex(b));
    });
  }

  it('refuses an image that is not the one the content froze, or a content that froze none', async () => {
    const other = new Uint8Array(syntheticPng(361, 90));
    const opts = { logoPng, frozenAt: FROZEN_AT, receiptSignatureId: 'rsig-0001' };
    const code = (e: unknown) => e instanceof RendererAdapterError && e.code === 'SIGNATURE_IMAGE_MISMATCH';
    await assert.rejects(renderSignedFromContent(j5(), { ...opts, signaturePng: other }), code);
    await assert.rejects(renderSignedFromContent(j6(), { ...opts, signaturePng: other }), code);
    await assert.rejects(renderSignedFromContent({ ...j5(), signature: null }, { ...opts, signaturePng }), code);
    await assert.rejects(renderSignedFromContent({ ...j6(), signature: null }, { ...opts, signaturePng }), code);
  });

  it('refuses a J6 that is on hold or lacks the designated signer receiving-signature attestation', async () => {
    const base = { logoPng, signaturePng, frozenAt: FROZEN_AT };
    const held = j6({ authorizedEndDate: '2027-01-31' });
    assert.deepEqual(held.reviewReasons, ['voucher_period_conflict']);
    await assert.rejects(renderSignedFromContent(held, { ...base, receiptSignatureId: 'rsig-0001' }), (e: unknown) => e instanceof RendererAdapterError && e.code === 'CONTENT_NOT_RENDERABLE');
    for (const missing of [null, undefined, '', '  ']) {
      await assert.rejects(renderSignedFromContent(j6(), { ...base, receiptSignatureId: missing }), (e: unknown) => e instanceof RendererAdapterError && e.code === 'CONTENT_NOT_RENDERABLE', JSON.stringify(missing));
    }
    // A J5 has no receipt to attest.
    await assert.doesNotReject(renderSignedFromContent(j5(), { ...base, receiptSignatureId: null }));
  });

  it('still refuses a letterhead logo that differs from the frozen hash', async () => {
    const changed = new Uint8Array([...logoPng, 0]);
    await assert.rejects(
      renderSignedFromContent(j5(), { logoPng: changed, signaturePng, frozenAt: FROZEN_AT, receiptSignatureId: null }),
      (e: unknown) => e instanceof RendererAdapterError && e.code === 'LOGO_CHANGED',
    );
  });
});
