import { PDFDocument, PDFName, PDFRawStream, PngEmbedder, decodePDFRawStream } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { digest, DRAFT_RULE, TEMPLATE_VERSION, REPORTING_TIMEZONE, periodDates, summarize, type SheetKind } from './evidence';
import { renderAttendancePdf, type AttendanceSnapshot } from './pdf';

const LEFT = 36;

// Compare decoded PDF image pixels with the canonical PNG, not a filename or a drawn badge.
test('weekly and yearly embed the authentic WorkforceAP raster', async () => {
  const asset = await readFile(fileURLToPath(new URL('../../public/images/logo-tight.png', import.meta.url)));
  const source = await PngEmbedder.for(asset);
  const sourceImage = source as unknown as { width: number; height: number; image: { rgbChannel: Uint8Array } };
  const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
  const expected = hash(sourceImage.image.rgbChannel);
  for (const kind of ['weekly', 'yearly'] as const) {
    const document = await PDFDocument.load(await renderAttendancePdf(snapshot(kind)));
    const resources = document.getPage(0).node.Resources();
    assert.ok(resources, `${kind}: page resources exist`);
    const xobjects = resources.lookup(PDFName.of('XObject'));
    assert.ok(xobjects, `${kind}: image XObject exists`);
    const images = [...document.context.enumerateIndirectObjects()].map(([, object]) => object)
      .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');
    assert.ok(images.length > 0, `${kind}: embedded image, not hand-drawn logo`);
    assert.ok(images.some(image => image.dict.get(PDFName.of('ColorSpace'))?.toString() === '/DeviceRGB'
      && image.dict.get(PDFName.of('Width'))?.toString() === String(sourceImage.width)
      && image.dict.get(PDFName.of('Height'))?.toString() === String(sourceImage.height)
      && hash(decodePDFRawStream(image).decode()) === expected), `${kind}: canonical PNG RGB pixels`);
  }
});

async function pageWidth(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPage(0).getWidth();
}

function snapshot(kind: SheetKind, over: Partial<AttendanceSnapshot> = {}): AttendanceSnapshot {
  const rows: never[] = [];
  return {
    schemaVersion: 1, kind, academicLabel: '2026-2027',
    provenance: { evidenceDigest: digest(rows), evidenceRevision: digest(rows), ruleVersion: DRAFT_RULE.version, pMinimumMinutes: 240,
      ruleApproved: false, reportingTimezone: REPORTING_TIMEZONE, templateVersion: TEMPLATE_VERSION },
    profile: { name: 'Synthetic Participant', email: null, phone: null },
    enrollment: { program: 'Synthetic', twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null },
    days: summarize(periodDates(kind, '2026-11-09', 8), rows),
    ...over,
  };
}

async function textBoxes(bytes: Uint8Array) {
  const loaded = await getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: true }).promise;
  try {
    const pages: Array<Array<{ str: string; x: number; right: number; y: number }>> = [];
    for (let index = 1; index <= loaded.numPages; index++) {
      const content = await (await loaded.getPage(index)).getTextContent();
      pages.push(content.items.flatMap(item => 'str' in item && item.str.trim()
        ? [{ str: item.str, x: item.transform[4] as number, right: (item.transform[4] as number) + item.width, y: item.transform[5] as number }] : []));
    }
    return pages;
  } finally { await loaded.destroy(); }
}

// 64 capital Ws is the widest label the 64-character bound allows. Unwrapped it ran past the page edge.
for (const kind of ['monthly'] as SheetKind[]) {
  test(`${kind}: widest bounded academic label wraps inside both margins on every page`, async () => {
    const bytes = await renderAttendancePdf(snapshot(kind, { academicLabel: 'W'.repeat(64) }));
    const right = await pageWidth(bytes) - LEFT;
    const pages = await textBoxes(bytes);
    assert.ok(pages.length >= 1);
    pages.forEach((boxes, pageIndex) => {
      const header = boxes.filter(box => /Academic label|^W+$/.test(box.str));
      assert.ok(header.length >= 1, `page ${pageIndex + 1} shows the academic label`);
      for (const box of boxes) {
        assert.ok(box.x >= LEFT - 0.5, `left edge ${box.x} "${box.str.slice(0, 30)}"`);
        assert.ok(box.right <= right + 0.5, `right edge ${box.right.toFixed(1)} "${box.str.slice(0, 30)}"`);
      }
    });
  });
}

test('wrapped header lines never overlap each other or the body', async () => {
  const [first] = await textBoxes(await renderAttendancePdf(snapshot('monthly', { academicLabel: 'W'.repeat(64) })));
  const baselines = [...new Set(first.map(box => Math.round(box.y * 10) / 10))].sort((a, b) => b - a);
  for (let index = 1; index < baselines.length; index++) {
    assert.ok(baselines[index - 1] - baselines[index] >= 5.9, `baselines ${baselines[index - 1]} / ${baselines[index]} collide`);
  }
});

test('footer hash and page notice stay inside the margins on a long-name sheet', async () => {
  const bytes = await renderAttendancePdf(snapshot('yearly', {
    academicLabel: 'W'.repeat(64), profile: { name: 'Synthetic Participant With A Rather Long Name', email: null, phone: null } }));
  const right = await pageWidth(bytes) - LEFT;
  const pages = await textBoxes(bytes);
  assert.ok(pages.length >= 1);
  for (const boxes of pages) {
    assert.ok(boxes.some(box => box.str.includes('Snapshot SHA-256')));
    for (const box of boxes) assert.ok(box.right <= right + 0.5 && box.x >= LEFT - 0.5, `${box.str.slice(0, 30)} ${box.right}`);
  }
});

test('label bound and unsupported configuration are still rejected', async () => {
  await assert.rejects(renderAttendancePdf(snapshot('weekly', { academicLabel: 'W'.repeat(65) })), /INVALID_ACADEMIC_LABEL/);
  await assert.rejects(renderAttendancePdf(snapshot('weekly', { academicLabel: '   ' })), /INVALID_ACADEMIC_LABEL/);
});
