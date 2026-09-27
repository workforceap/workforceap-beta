/**
 * Synthetic two-page resume for the DEMO Resume Build acceptance lane
 * (docs/RESUME-DEMO-ACCEPTANCE.md). Every name, employer, school, phone number
 * and date is invented. The facts the lane checks for sit on PAGE 2, so a
 * build that only read page 1 cannot pass.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';

export const SYNTHETIC_RESUME_FILE_NAME = 'synthetic-two-page-resume.pdf';

const PAGE_ONE = [
  'Rowan Tessaly-Brook',
  'Phone: 555-0147 | rowan.tessaly-brook@example.test',
  'Summary',
  'Maintenance planner who schedules preventive work and keeps technicians supplied.',
  'Experience',
  'Kestrel Valley Grocers - Stock Associate, 2014-2017',
  '- Received and rotated perishable stock for the overnight crew',
];

const PAGE_TWO = [
  'Experience (continued)',
  'Brightwater Turbine Services - Maintenance Planner, June 2017 - August 2024',
  '- Scheduled preventive maintenance for 38 wind turbines',
  '- Built weekly parts kits for field technicians',
  'Education',
  'Harrowgate Technical College - A.A.S. Wind Energy Technology, 2016',
  'Certifications',
  'OSHA 30',
];

/** The text the PDF carries, page by page, as the extractor should return it. */
export const SYNTHETIC_RESUME_SOURCE_TEXT = [...PAGE_ONE, ...PAGE_TWO].join('\n');

/** Distinctive facts that exist only on page 2. */
export const PAGE_TWO_FACTS = {
  employer: 'Brightwater Turbine Services',
  title: 'Maintenance Planner',
  school: 'Harrowgate Technical College',
  program: 'Wind Energy Technology',
} as const;

export async function buildSyntheticResumePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const lines of [PAGE_ONE, PAGE_TWO]) {
    const page = document.addPage([612, 792]);
    lines.forEach((line, index) => {
      page.drawText(line, { x: 48, y: 740 - index * 20, size: index === 0 ? 14 : 11, font });
    });
  }
  return document.save();
}

/** Case-, punctuation- and dash-insensitive containment for fact checks. */
export function containsFact(text: string, fact: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return ` ${normalize(text)} `.includes(` ${normalize(fact)} `);
}

/**
 * Outcome classes for one Build, from the route's status and member message
 * (app/api/member/resume/generate/route.ts). The route exposes neither the
 * provider nor the model, and claudeChat returns null when every configured
 * provider fails (auth, quota, outage), which the route answers as 422
 * "not readable"; that case is reported as a provider error, never as a guard.
 */
export type BuildOutcome =
  | 'success'
  | 'request_failed'
  | 'provider_unconfigured'
  | 'provider_error_or_empty_output'
  | 'provider_threw'
  | 'app_rate_limited'
  | 'guard_factuality_422'
  | 'guard_missing_section_422'
  | 'source_unreadable_422'
  | 'other_failure';

export function classifyBuild(status: number, error: string | null): BuildOutcome {
  const message = error ?? '';
  if (status === 0) return 'request_failed';
  if (status === 200) return 'success';
  if (status === 503) return 'provider_unconfigured';
  if (status === 502) return 'provider_threw';
  if (status === 429) return 'app_rate_limited';
  if (status === 422 && /not readable/i.test(message)) return 'provider_error_or_empty_output';
  if (status === 422 && /details that are not in your resume or profile/i.test(message)) return 'guard_factuality_422';
  if (status === 422 && /did not preserve details/i.test(message)) return 'guard_missing_section_422';
  if (status === 422 && /could not read enough text/i.test(message)) return 'source_unreadable_422';
  return 'other_failure';
}

/**
 * Hard limit of ONE Build request per dispatch: the Preview's Groq key shares
 * production quota (DEMO_SETUP.md:65). A second call throws before any
 * request is made; failures are recorded, never retried.
 */
export function singleBuildBudget() {
  let used = false;
  return {
    get used() { return used; },
    async run<T>(call: () => Promise<T>): Promise<T> {
      if (used) throw new Error('Build budget exhausted: exactly one Build request is allowed per dispatch.');
      used = true;
      return call();
    },
  };
}

/** Static disclosure; what was actually attempted is `buildRequestsMade` (0 or 1). */
export const GROQ_QUOTA_DISCLOSURE =
  'Preview GROQ_API_KEY shares production quota (DEMO_SETUP.md:65); a Build request may consume it';

/** The receipt as it stands before anything runs: not passed, zero Build requests. */
export function initialAcceptanceReceipt(startedAt: string): Record<string, unknown> {
  return {
    fixture: SYNTHETIC_RESUME_FILE_NAME,
    startedAt,
    // Vercel metadata (2026-09-27): GROQ_API_KEY is set for all environments and
    // ANTHROPIC_API_KEY is not set, so Build is served by the Groq fallback in
    // lib/ai/anthropicChat.ts. The route does not report the provider or model.
    providerPath: 'Groq fallback; Anthropic not configured on Preview (expected, not reported by the route)',
    groqQuota: GROQ_QUOTA_DISCLOSURE,
    buildRequestLimit: 1,
    model: 'not exposed by the route',
    validatorScope: 'findUnsupportedResumeClaims is a narrow fail-closed validator; prose claims are not assessed',
    buildRequestsMade: 0,
    pass: false,
    outcome: 'not_run',
  };
}
