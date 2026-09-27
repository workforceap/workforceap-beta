/**
 * Synthetic two-page resume for the DEMO Resume Build acceptance lane
 * (docs/RESUME-DEMO-ACCEPTANCE.md). Every name, employer, school, phone number
 * and date is invented. The facts the lane checks for sit on PAGE 2, so a
 * build that only read page 1 cannot pass.
 */
import { Buffer } from 'node:buffer';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export const SYNTHETIC_RESUME_FILE_NAME = 'synthetic-two-page-resume.pdf';

const PAGE_ONE = [
  'Rowan Tessaly-Brook',
  'Phone: 555-0147 | rowan.tessaly-brook@example.test',
  'Summary',
  'Operations scheduler who plans preventive work and keeps field crews supplied.',
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
/** Each page's text, so a test can prove every PAGE_TWO_FACTS entry is on page 2 only. */
export const SYNTHETIC_RESUME_PAGE_TEXT = { one: PAGE_ONE.join('\n'), two: PAGE_TWO.join('\n') } as const;

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

/**
 * The identity claims in the signed-in session's `sb-<ref>-auth-token` cookie,
 * as @supabase/ssr writes it (whole or chunked as `.0`, `.1`, …; `base64-`
 * prefixed or URI-encoded JSON): the session's `user.id` and the access
 * token's `sub`. Either is null when absent or unreadable; the whole result is
 * null when there is no single readable session cookie. Never logged.
 */
export function sessionIdentityFromCookies(
  cookies: ReadonlyArray<{ name: string; value: string }>,
): { userId: string | null; sub: string | null } | null {
  const pattern = /^(sb-[a-z0-9]+-auth-token)(?:\.(0|[1-9]\d*))?$/;
  const parts = new Map<string, Array<{ index: number; value: string }>>();
  for (const cookie of cookies) {
    const match = cookie.name.match(pattern);
    if (!match) continue;
    const list = parts.get(match[1]) ?? [];
    list.push({ index: match[2] === undefined ? -1 : Number(match[2]), value: cookie.value });
    parts.set(match[1], list);
  }
  if (parts.size !== 1) return null;
  const chunks = [...parts.values()][0].sort((a, b) => a.index - b.index);
  const whole = chunks.find((chunk) => chunk.index === -1);
  const numbered = chunks.filter((chunk) => chunk.index >= 0);
  if (whole && numbered.length > 0) return null;
  if (numbered.some((chunk, i) => chunk.index !== i)) return null;
  const raw = whole ? whole.value : numbered.map((chunk) => chunk.value).join('');
  let session: { user?: { id?: unknown }; access_token?: unknown } | null;
  try {
    const text = raw.startsWith('base64-')
      ? Buffer.from(raw.slice('base64-'.length), 'base64url').toString('utf8')
      : decodeURIComponent(raw);
    session = JSON.parse(text);
  } catch {
    return null;
  }
  if (!session || typeof session !== 'object') return null;
  const userId = typeof session.user?.id === 'string' ? session.user.id : null;
  let sub: string | null = null;
  if (typeof session.access_token === 'string') {
    try {
      const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1] ?? '', 'base64url').toString('utf8'));
      sub = typeof payload?.sub === 'string' ? payload.sub : null;
    } catch {
      sub = null;
    }
  }
  return { userId, sub };
}

export type IdentityCheck =
  | { ok: true }
  | { ok: false; outcome: 'identity_unproven' | 'member_mismatch'; reason: string };

/**
 * Proof, before any upload or Build, that the spec is signed in as the
 * disposable member `create` recorded. All of these must hold:
 * - the session cookie carries BOTH `user.id` and the access token's `sub`,
 *   and they are equal;
 * - both equal the created member ID;
 * - the app's own authenticated API (GET /api/member/profile, which resolves
 *   the user server-side through Supabase `auth.getUser()`, so the token is
 *   verified, not just decoded) returns that same ID and the member's email.
 * Anything missing or malformed is `identity_unproven`; anything present but
 * different is `member_mismatch`.
 */
export function checkMemberIdentity(
  observed: {
    cookie: { userId: string | null; sub: string | null } | null;
    api: { status: number; userId: string | null; email: string | null };
  },
  expected: { userId: string; email: string },
): IdentityCheck {
  const { cookie, api } = observed;
  if (!cookie || !cookie.userId || !cookie.sub) {
    return { ok: false, outcome: 'identity_unproven', reason: 'session cookie lacks user.id or access-token sub' };
  }
  if (cookie.userId !== cookie.sub) {
    return { ok: false, outcome: 'member_mismatch', reason: 'session user.id and access-token sub differ' };
  }
  if (cookie.userId !== expected.userId) {
    return { ok: false, outcome: 'member_mismatch', reason: 'session is not the created member' };
  }
  if (api.status !== 200 || !api.userId || !api.email) {
    return { ok: false, outcome: 'identity_unproven', reason: `app profile API did not confirm the user (status ${api.status})` };
  }
  if (api.userId !== expected.userId || api.email.toLowerCase() !== expected.email.toLowerCase()) {
    return { ok: false, outcome: 'member_mismatch', reason: 'app profile API returned a different member' };
  }
  return { ok: true };
}
