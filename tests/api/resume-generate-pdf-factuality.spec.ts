// @vitest-environment node
/**
 * Member Resume Build, end to end from stored PDF bytes to the saved draft.
 *
 * Unlike tests/api/resume-builder.spec.ts, resume text is NOT mocked here: the
 * route downloads a synthetic PDF from mocked storage and runs the real
 * pdfjs-dist extraction worker. Only the AI provider, storage client, database
 * and auth are mocked, so no network or model call can happen.
 *
 * Every name, employer, school and date below is fictional.
 */
import { Buffer } from 'node:buffer';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(() => Promise.resolve({ role: 'authenticated', userId: 'test-user' })),
}));

vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    profile: { findUnique: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[])),
  };
  return { prisma };
});

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: vi.fn(() => null) }));
vi.mock('@/lib/content/programTitle', () => ({ programDisplayTitle: vi.fn(() => 'AWS Cloud Practitioner') }));
vi.mock('@/lib/ai/resumeBuildProviders', () => ({
  isResumeBuildAIConfigured: vi.fn(() => true),
  generateResumeBuildText: vi.fn(),
}));
vi.mock('@/lib/ai/postProcess', () => ({
  cleanLongFormPlainText: vi.fn((text: string) => text.trim()),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: vi.fn(() => Promise.resolve({ success: true })),
}));
vi.mock('@/lib/workflows/completeCareerOsActions', () => ({
  completeCareerOsResumeActions: vi.fn(() => Promise.resolve({ completedCount: 0, actionIds: [] })),
}));
vi.mock('@/lib/resume/resumeProfileStorage', () => ({
  saveEnhancedResumeText: vi.fn(),
  isResumeProfileConflict: vi.fn(() => false),
}));
type ResumeProfileStorage = typeof import('@/lib/resume/resumeProfileStorage');
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(() => Promise.resolve()) }));

import { POST as generateResume } from '@/app/api/member/resume/generate/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateResumeBuildText } from '@/lib/ai/resumeBuildProviders';
import { saveEnhancedResumeText } from '@/lib/resume/resumeProfileStorage';

const USER_ID = '550e8400-e29b-41d4-a716-4466554400aa';
const ORIGINAL_PATH = `${USER_ID}/resume-original-synthetic.pdf`;

/** Page 1: experience. Page 2: education. Written with a real PDF producer. */
async function syntheticTwoPageResumePdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const first = document.addPage([612, 792]);
  first.drawText('Avery Quillfeather', { x: 40, y: 740, size: 16, font });
  first.drawText('Experience', { x: 40, y: 710, size: 13, font });
  first.drawText('Riverbend Logistics - Warehouse Lead, 2019-2023', { x: 40, y: 690, size: 11, font });
  first.drawText('- Coordinated inbound receiving for a two-shift crew', { x: 40, y: 672, size: 11, font });
  first.drawText('- Trained new associates on scanner and pallet-jack safety', { x: 40, y: 656, size: 11, font });
  first.drawText('- Reconciled a $1,000 petty-cash float each week', { x: 40, y: 640, size: 11, font });
  const second = document.addPage([612, 792]);
  second.drawText('Education', { x: 40, y: 740, size: 13, font });
  second.drawText('Lakeshore Community College - A.A.S. Industrial Maintenance, 2018', {
    x: 40,
    y: 720,
    size: 11,
    font,
  });
  return Buffer.from(await document.save());
}

/** A file named .pdf whose bytes are an unparseable raw PDF body. */
const RAW_PDF_STREAM = Buffer.from([
  '%PDF-1.7',
  '1 0 obj',
  '<< /Length 44 >>',
  'stream',
  'BT /F1 12 Tf 72 712 Td (Riverbend) Tj ET',
  'endstream',
  'endobj',
  '%%EOF',
].join('\n'));

/** A valid PDF with no text layer, the same shape as a scanned image-only resume. */
async function textlessPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return Buffer.from(await document.save());
}

let twoPagePdf: Buffer;

/** Mocked member-resumes bucket; returns the object map so a test can prove it is untouched. */
function storeOriginal(bytes: Buffer, extra: Record<string, Buffer> = {}) {
  const objects = new Map<string, Buffer>([[ORIGINAL_PATH, bytes], ...Object.entries(extra)]);
  const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const storage = {
    download: vi.fn(async (path: string) => {
      const object = objects.get(path);
      return object ? { data: { arrayBuffer: async () => toArrayBuffer(object) }, error: null } : { data: null, error: { message: 'not found' } };
    }),
    upload: vi.fn(async () => ({ data: null, error: null })),
    remove: vi.fn(async () => ({ data: null, error: null })),
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ storage: { from: () => storage } } as never);
  return { storage, objects };
}

function memberWithOriginal(overrides: { enrolledProgram?: string | null; resumeEnhancedPath?: string | null } = {}) {
  const profile = {
    userId: USER_ID,
    profilePhone: null,
    profileAddress: null,
    address: null,
    profileLinkedin: null,
    profileBio: null,
    employmentStatus: null,
    educationLevel: null,
    resumeOriginalPath: ORIGINAL_PATH,
    resumeEnhancedPath: overrides.resumeEnhancedPath ?? null,
  };
  vi.mocked(getUser).mockResolvedValue({ id: USER_ID } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: USER_ID,
    email: 'avery.quillfeather@example.test',
    fullName: 'Avery Quillfeather',
    phone: null,
    enrolledProgram: overrides.enrolledProgram ?? null,
    profile,
  } as never);
  vi.mocked(prisma.profile.findUnique).mockResolvedValue(profile as never);
}

function generate() {
  return generateResume(new Request('http://localhost/api/member/resume/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }));
}

const FAITHFUL_DRAFT = `# Avery Quillfeather

## Professional Summary
Warehouse lead with experience coordinating inbound receiving and training new associates on equipment safety.

## Experience
**Warehouse Lead** — Riverbend Logistics, 2019–2023
- Coordinated inbound receiving for a two-shift crew
- Trained new associates on scanner and pallet-jack safety
- Reconciled a $1,000 petty-cash float each week

## Education
A.A.S. Industrial Maintenance — Lakeshore Community College, 2018`;

beforeAll(async () => {
  twoPagePdf = await syntheticTwoPageResumePdf();
});

beforeEach(() => {
  vi.clearAllMocks();
  memberWithOriginal();
  vi.mocked(saveEnhancedResumeText).mockResolvedValue(`${USER_ID}/resume-enhanced-synthetic.txt`);
});

describe('Resume Build reads both pages of a real PDF', () => {
  it('sends page 1 experience and page 2 education, and no PDF syntax, to the provider', async () => {
    storeOriginal(twoPagePdf);
    vi.mocked(generateResumeBuildText).mockResolvedValue(FAITHFUL_DRAFT);

    const res = await generate();

    expect(res.status).toBe(200);
    expect(generateResumeBuildText).toHaveBeenCalledTimes(1);
    const [, userContent] = vi.mocked(generateResumeBuildText).mock.calls[0];
    const resumeData = userContent.match(/<resume_data>\n([\s\S]*?)\n<\/resume_data>/)?.[1] ?? '';
    expect(resumeData).toContain('Riverbend Logistics - Warehouse Lead, 2019-2023');
    expect(resumeData).toContain('Lakeshore Community College - A.A.S. Industrial Maintenance, 2018');
    expect(resumeData).not.toMatch(/%PDF|\bendobj\b|\bendstream\b|\bstream\b/);
    expect(saveEnhancedResumeText).toHaveBeenCalledWith(USER_ID, FAITHFUL_DRAFT, {
      resumeOriginalPath: ORIGINAL_PATH,
      resumeEnhancedPath: null,
    });
  }, 30_000);
});

describe('Resume Build fails closed on a PDF without readable text', () => {
  it.each([
    ['a raw PDF stream', async () => RAW_PDF_STREAM],
    ['a PDF with no text layer', textlessPdf],
  ])('returns 422 for %s and never calls the provider', async (_label, bytes) => {
    storeOriginal(await bytes());

    const res = await generate();

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/could not read enough text from your uploaded resume/i);
    expect(generateResumeBuildText).not.toHaveBeenCalled();
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  }, 30_000);
});

describe('Resume Build keeps the draft to facts in the source', () => {
  it('tells the provider not to invent history or write filler for missing sections', async () => {
    storeOriginal(twoPagePdf);
    vi.mocked(generateResumeBuildText).mockResolvedValue(FAITHFUL_DRAFT);

    await generate();

    const [systemPrompt] = vi.mocked(generateResumeBuildText).mock.calls[0];
    expect(systemPrompt).toMatch(/NEVER invent employers, roles, dates, education/);
    expect(systemPrompt).toMatch(/Omit missing Experience, Skills, Education, or Certifications sections/);
    expect(systemPrompt).toMatch(/Never write filler such as "No work history provided"/);
    expect(systemPrompt).toMatch(/Do not add generic responsibilities, accomplishments, or strengths/);
    expect(systemPrompt).toMatch(/The target program and category are goals/);
  }, 30_000);

  it.each([
    ['an invented employer without a corporate suffix', FAITHFUL_DRAFT.replace('Riverbend Logistics, 2019', 'Harborview Freight, 2019')],
    ['an invented suffixed employer', FAITHFUL_DRAFT.replace('## Education', '**Shift Supervisor** — Harborview Freight Inc., 2019–2023\n\n## Education')],
    ['"Manager at Amazon" in the summary', FAITHFUL_DRAFT.replace('equipment safety.', 'equipment safety. Previously Manager at Amazon.')],
    ['an inflated job title', FAITHFUL_DRAFT.replace('**Warehouse Lead** —', '**Vice President** —')],
    ['an invented school', FAITHFUL_DRAFT.replace('Lakeshore Community College', 'Northgate Technical Institute')],
    ['an altered degree', FAITHFUL_DRAFT.replace('A.A.S. Industrial Maintenance', 'B.S. Industrial Maintenance')],
    ['an invented year', FAITHFUL_DRAFT.replace('2019–2023', '2016–2023')],
    ['a new month on an existing year', FAITHFUL_DRAFT.replace('2019–2023', 'March 2019–2023')],
    ['an invented headcount', FAITHFUL_DRAFT.replace('for a two-shift crew', 'for a two-shift crew and managed 25 staff')],
    ['an invented metric', FAITHFUL_DRAFT.replace('- Coordinated inbound receiving for a two-shift crew', '- Coordinated inbound receiving, improving throughput by 35%')],
    ['the target program claimed as an earned credential', `${FAITHFUL_DRAFT}\n\n## Certifications\n- AWS Certified Cloud Practitioner`],
    ['a filler section for missing data', `${FAITHFUL_DRAFT}\n\n## Certifications\nNo certifications were provided.`],
    ['a filler skills section', `${FAITHFUL_DRAFT}\n\n## Skills\nNot provided`],
    ['a bracketed placeholder', FAITHFUL_DRAFT.replace('Riverbend Logistics', '[Company Name]')],
  ])('rejects %s without saving', async (_label, draft) => {
    memberWithOriginal({ enrolledProgram: 'aws-cloud-practitioner' });
    storeOriginal(twoPagePdf);
    vi.mocked(generateResumeBuildText).mockResolvedValue(draft);

    const res = await generate();

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/details that are not in your resume or profile/i);
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
  }, 30_000);

  it.each([
    ['as written', FAITHFUL_DRAFT],
    ['with "$1,000" written as "$1000"', FAITHFUL_DRAFT.replace('$1,000', '$1000')],
    ['with the degree spelled out', FAITHFUL_DRAFT.replace('A.A.S. Industrial Maintenance', 'Associate of Applied Science, Industrial Maintenance')],
    ['with "Attended <school>" prose', FAITHFUL_DRAFT.replace('## Education', '## Education\nAttended Lakeshore Community College')],
    ['with the target program phrased as a goal', FAITHFUL_DRAFT.replace('equipment safety.', 'equipment safety. Pursuing the AWS Cloud Practitioner program.')],
  ])('saves a faithful draft %s', async (_label, draft) => {
    memberWithOriginal({ enrolledProgram: 'aws-cloud-practitioner' });
    storeOriginal(twoPagePdf);
    vi.mocked(generateResumeBuildText).mockResolvedValue(draft);

    const res = await generate();

    expect(res.status).toBe(200);
    expect(saveEnhancedResumeText).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('keeps the prior good draft untouched when a new draft is rejected', async () => {
    const priorPath = `${USER_ID}/resume-enhanced-prior.txt`;
    const priorDraft = Buffer.from(FAITHFUL_DRAFT, 'utf8');
    memberWithOriginal({ resumeEnhancedPath: priorPath });
    const { storage, objects } = storeOriginal(twoPagePdf, { [priorPath]: priorDraft });
    // The real storage writer, so a save attempt would reach the mocked bucket.
    const actual = await vi.importActual<ResumeProfileStorage>('@/lib/resume/resumeProfileStorage');
    vi.mocked(saveEnhancedResumeText).mockImplementation(actual.saveEnhancedResumeText);
    vi.mocked(generateResumeBuildText).mockResolvedValue(
      FAITHFUL_DRAFT.replace('Riverbend Logistics, 2019', 'Harborview Freight, 2019'),
    );

    const res = await generate();

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/existing resume was kept/);
    expect(saveEnhancedResumeText).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(objects.get(priorPath)?.equals(priorDraft)).toBe(true);
    expect([...objects.keys()].sort()).toEqual([ORIGINAL_PATH, priorPath].sort());
  }, 30_000);

  it('saves a draft that omits sections the source does not have', async () => {
    storeOriginal(twoPagePdf);
    // No Skills or Certifications section: the source has neither.
    vi.mocked(generateResumeBuildText).mockResolvedValue(FAITHFUL_DRAFT);

    const res = await generate();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resume).not.toMatch(/##\s*(?:Skills|Certifications)/);
    expect(body.resume).not.toMatch(/not provided|no history/i);
    expect(saveEnhancedResumeText).toHaveBeenCalledTimes(1);
  }, 30_000);
});
