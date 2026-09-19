import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { clampElevenLabsDynamicVariables } from '@/lib/ai/clampElevenLabsDynamicVariables';
import { extractTextFromResumeBuffer } from './extractTextFromResumeBuffer';
import { isUnsafeResumePlainText, sanitizeResumePlainText } from './extractionQuality';
import { validateFileType } from './file-validation';

async function compressedDocx(documentXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

function forgeCentralUncompressedSize(buffer: Buffer, entryName: string, size: number): Buffer {
  const copy = Buffer.from(buffer);
  for (let cursor = 0; cursor <= copy.length - 46; cursor += 1) {
    if (copy.readUInt32LE(cursor) !== 0x02014b50) continue;
    const nameLength = copy.readUInt16LE(cursor + 28);
    const name = copy.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name === entryName) {
      copy.writeUInt32LE(size, cursor + 24);
      return copy;
    }
  }
  throw new Error(`Missing ZIP entry: ${entryName}`);
}

test('extractTextFromResumeBuffer: UTF-8 .txt', async () => {
  const buf = Buffer.from('Hello résumé\nline two', 'utf-8');
  const t = await extractTextFromResumeBuffer(buf, 'txt');
  assert.match(t, /résumé/);
});

test('extractTextFromResumeBuffer: extracts a real DOCX', async () => {
  const docx = await compressedDocx(
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:body><w:p><w:r><w:t>Jordan Test Candidate</w:t></w:r></w:p></w:body></w:document>',
  );
  const text = await extractTextFromResumeBuffer(docx, '.docx');
  assert.equal(text, 'Jordan Test Candidate');
});

test('extractTextFromResumeBuffer: malformed PDF never becomes resume text', async () => {
  const rawPdf = [
    '%PDF-1.7',
    '1 0 obj',
    '<< /Type /Catalog >>',
    'stream',
    'profile={{member_full_name}}',
    'endstream',
    'endobj',
    '%%EOF',
  ].join('\n');

  await assert.rejects(() => extractTextFromResumeBuffer(Buffer.from(rawPdf), 'pdf'));
});

test('extractTextFromResumeBuffer: malformed DOCX never becomes resume text', async () => {
  const rawDocx = Buffer.from(
    'PK\u0003\u0004 [Content_Types].xml word/document.xml {{resume_text}} not really a zip',
    'utf-8',
  );
  await assert.rejects(() => extractTextFromResumeBuffer(rawDocx, 'docx'));
});

test('extractTextFromResumeBuffer: invalid UTF-8 and binary masquerading as TXT fail closed', async () => {
  await assert.rejects(() => extractTextFromResumeBuffer(Buffer.from([0xff, 0xfe, 0xfd]), 'txt'));
  await assert.rejects(() =>
    extractTextFromResumeBuffer(Buffer.from('%PDF-1.7\n1 0 obj\nstream\nbytes\nendstream\nendobj'), 'txt'),
  );
});

test('resume text safety guard rejects containers, parser output, and agent placeholders', () => {
  const parserDiagnostic = [
    'Error: Invalid PDF structure',
    'at Object.parse (webpack:///src/pdf.js:24:23)',
  ].join('\n');
  const zipContainer = 'PK [Content_Types].xml word/document.xml';

  assert.equal(isUnsafeResumePlainText('%PDF-1.7\n1 0 obj\nendobj\n%%EOF'), true);
  assert.equal(isUnsafeResumePlainText(parserDiagnostic), true);
  assert.equal(isUnsafeResumePlainText(zipContainer), true);
  assert.equal(sanitizeResumePlainText('Candidate: {{member_full_name}}\nExperience'), '');
  assert.equal(
    sanitizeResumePlainText(
      'Given the provided information, the "base resume to improve" is a raw PDF stream that cannot be parsed for text content. Therefore, the enhanced resume will focus on contact information only.',
    ),
    '',
  );
  assert.equal(
    sanitizeResumePlainText('Jane Doe\r\nExperience\r\nStreamlined PDF workflows for staff.'),
    'Jane Doe\nExperience\nStreamlined PDF workflows for staff.',
  );
});

test('ElevenLabs boundary drops poisoned resume variables and reconciles has_resume', () => {
  const poisoned = '%PDF-1.7\n1 0 obj\nstream\n{{member_full_name}}\nendstream\nendobj\n%%EOF';
  const guarded = clampElevenLabsDynamicVariables({
    member_first_name: 'Jane',
    resume_text: poisoned,
    live_resume_draft: poisoned,
    has_resume: true,
  });

  assert.equal(guarded.member_first_name, 'Jane');
  assert.equal(guarded.resume_text, '');
  assert.equal(guarded.live_resume_draft, '');
  assert.equal(guarded.has_resume, 'false');

  const validResume = 'Jane Doe\nExperience\nDatabase administrator using SQL and PostgreSQL.';
  const valid = clampElevenLabsDynamicVariables({ resume_text: validResume, has_resume: true });
  assert.equal(valid.resume_text, validResume);
  assert.equal(valid.has_resume, 'true');

  const short = clampElevenLabsDynamicVariables({ resume_text: 'x'.repeat(39), has_resume: true });
  const boundary = clampElevenLabsDynamicVariables({ resume_text: 'x'.repeat(40), has_resume: true });
  assert.equal(short.has_resume, 'false');
  assert.equal(boundary.has_resume, 'true');
});

test('DOCX extraction hard-stops actual inflation when central sizes are forged', async () => {
  const xml = `<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>${'A'.repeat(9 * 1024 * 1024)}</w:t></w:r></w:p></w:body></w:document>`;
  const forged = forgeCentralUncompressedSize(
    await compressedDocx(xml),
    'word/document.xml',
    1024,
  );
  assert.equal(validateFileType(forged, 'application/zip', 'forged.docx'), true);
  await assert.rejects(
    () => extractTextFromResumeBuffer(forged, 'docx'),
    (error: unknown) => error instanceof Error && 'code' in error
      && (error as { code: string }).code === 'unsafe_extraction',
  );
});

test('DOCX XML token floods and unmatched text tags fail closed in bounded work', async () => {
  const flooded = await compressedDocx(
    `<w:document xmlns:w="urn:test"><w:body>${'<w:t></w:t>'.repeat(100_001)}</w:body></w:document>`,
  );
  await assert.rejects(() => extractTextFromResumeBuffer(flooded, 'docx'));

  const unmatched = await compressedDocx(
    `<w:document xmlns:w="urn:test"><w:body>${'<w:t>'.repeat(50_000)}</w:body></w:document>`,
  );
  await assert.rejects(() => extractTextFromResumeBuffer(unmatched, 'docx'));
});

test('plain-text save route rejects poisoned resume data before storage', async () => {
  const route = await readFile(
    join(process.cwd(), 'app', 'api', 'member', 'resume', 'plain-text', 'route.ts'),
    'utf-8',
  );
  const sanitizeIndex = route.indexOf('sanitizeResumePlainText(raw)');
  const rejectionIndex = route.indexOf('if (!hasSubstantiveResumeText(plainText))');
  const uploadIndex = route.indexOf('await saveEnhancedResumeText(user.id, plainText, expectedPaths)');

  assert.ok(sanitizeIndex >= 0);
  assert.ok(rejectionIndex > sanitizeIndex);
  assert.ok(uploadIndex > rejectionIndex);
  assert.match(route, /body\.resumeRevision !== currentRevision/);
  assert.match(route, /resumeOriginalPath:\s*profile\?\.resumeOriginalPath \?\? null/);
});

test('extractTextFromResumeBuffer: reads a PDF from a current-generation producer', async () => {
  // Regression for the production failures "bad XRef entry" / "Command token
  // too long" / "Illegal character": pdf-parse bundles pdf.js builds from 2018
  // and rejected files that modern producers (Word, Canva, Google Docs, macOS
  // Preview) emit routinely. pdf-lib writes the same modern structure, so this
  // fixture fails on the old parser and succeeds on pdfjs-dist.
  const { PDFDocument, StandardFonts } = require('pdf-lib') as typeof import('pdf-lib');

  for (const useObjectStreams of [true, false]) {
    const document = await PDFDocument.create();
    const page = document.addPage([612, 792]);
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText('MICHAEL A BROWN PMP', { x: 40, y: 700, size: 12, font });
    page.drawText('Executive Director, Workforce Advancement Project', {
      x: 40,
      y: 676,
      size: 11,
      font,
    });

    const pdf = Buffer.from(await document.save({ useObjectStreams }));
    const text = await extractTextFromResumeBuffer(pdf, 'pdf');

    assert.match(text, /MICHAEL A BROWN PMP/);
    assert.match(text, /Workforce Advancement Project/);
  }
});
