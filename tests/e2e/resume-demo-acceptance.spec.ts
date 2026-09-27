/**
 * DEMO Resume Build acceptance: upload a synthetic two-page PDF and run a real,
 * provider-backed Build as a DEDICATED, DISPOSABLE DEMO member, then check the
 * saved draft. Runbook and prerequisites: docs/RESUME-DEMO-ACCEPTANCE.md.
 *
 * This spec MUTATES the member's resume (upload replaces the original and
 * clears the enhanced draft; Build writes a new draft) and spends provider
 * quota; it makes exactly ONE Build request and never retries (the Preview
 * Groq key shares production quota, DEMO_SETUP.md:65). It is inert unless
 * every RESUME_ACCEPTANCE_* input below is set, and
 * it accepts only a per-run synthetic `resume-qa-<run>-<attempt>@example.com`
 * member created by scripts/resume-demo-member.ts. Only the trusted
 * workflow_dispatch workflow `.github/workflows/resume-demo-acceptance.yml`
 * should run it, after that workflow's Preview SHA and DEMO project gates.
 *
 * The evidence never contains resume text: only statuses, latencies, lengths,
 * SHA-256 digests, fact-presence booleans and factuality issue kinds.
 *
 *   PLAYWRIGHT_BASE_URL                trusted DEMO Preview origin
 *   RESUME_ACCEPTANCE_MEMBER_EMAIL     the per-run synthetic member
 *   RESUME_ACCEPTANCE_MEMBER_PASSWORD
 *   RESUME_ACCEPTANCE_SHARED_EMAILS    comma-separated shared accounts to refuse
 *   RESUME_ACCEPTANCE_CONFIRMED        "1" only after the workflow's gates passed
 *   RESUME_ACCEPTANCE_OUTPUT           receipt JSON path (default below)
 *   RESUME_ACCEPTANCE_MODE             "workflow" (set only by the workflow): any
 *                                      refusal FAILS instead of skipping, and a
 *                                      receipt with pass:false is always written
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test, expect, type APIResponse, type Page } from '@playwright/test';
import { findUnsupportedResumeClaims } from '../../lib/resume/validateGeneratedResume';
import { hostnameOf, isProductionHost } from '../../scripts/lib/resume-acceptance-receipt.mjs';
import {
  buildSyntheticResumePdf,
  classifyBuild,
  containsFact,
  initialAcceptanceReceipt,
  PAGE_TWO_FACTS,
  singleBuildBudget,
  SYNTHETIC_RESUME_FILE_NAME,
  SYNTHETIC_RESUME_SOURCE_TEXT,
} from '../fixtures/resumeDemoAcceptance';

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() ?? '';
const email = process.env.RESUME_ACCEPTANCE_MEMBER_EMAIL?.trim().toLowerCase() ?? '';
const password = process.env.RESUME_ACCEPTANCE_MEMBER_PASSWORD?.replace(/\r$/, '') ?? '';
const confirmed = process.env.RESUME_ACCEPTANCE_CONFIRMED === '1';
const output = process.env.RESUME_ACCEPTANCE_OUTPUT?.trim() || 'test-results/resume-demo-acceptance.json';
const workflowMode = process.env.RESUME_ACCEPTANCE_MODE === 'workflow';

/** Only the per-run synthetic member (scripts/resume-demo-member.ts) may be mutated. */
const SYNTHETIC_MEMBER = /^resume-qa-\d{1,20}-\d{1,4}@example\.com$/;

function refusal(): string | null {
  if (!baseURL || !email || !password || !confirmed) return 'RESUME_ACCEPTANCE_* inputs are not set';
  const host = hostnameOf(baseURL);
  if (!host) return 'PLAYWRIGHT_BASE_URL is not an http(s) URL';
  // Same exact-hostname rule as the workflow gate (scripts/lib/resume-acceptance-receipt.mjs).
  if (isProductionHost(host)) return 'refusing a production host';
  const shared = (process.env.RESUME_ACCEPTANCE_SHARED_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!SYNTHETIC_MEMBER.test(email) || shared.includes(email)) return 'refusing a non-synthetic or shared account';
  return null;
}

/** Evidence keys only; no cookies, tokens, emails or passwords are recorded. */
type Evidence = Record<string, unknown>;
const evidence: Evidence = initialAcceptanceReceipt(new Date().toISOString());

/** Resume text is never recorded: only its length and SHA-256 digest. */
function digest(text: string | null) {
  return text === null ? null : { length: text.length, sha256: createHash('sha256').update(text).digest('hex') };
}

function writeEvidence() {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function login(page: Page) {
  await page.goto('/login?redirectTo=%2Fdashboard', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /decline/i }).click().catch(() => {});
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login([?#]|$)/, { timeout: 60_000 });
}

async function jsonOf(response: APIResponse): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

async function resumeStatus(page: Page) {
  const response = await page.request.get('/api/member/resume');
  expect(response.status(), 'GET /api/member/resume').toBe(200);
  const body = await jsonOf(response);
  return {
    hasOriginal: Boolean(body.hasOriginal),
    hasEnhanced: Boolean(body.hasEnhanced),
    enhancedUnavailable: Boolean(body.enhancedUnavailable),
    enhancedText: typeof body.enhancedText === 'string' ? body.enhancedText : null,
  };
}

/** The only Build request this spec may make (see singleBuildBudget). */
const buildBudget = singleBuildBudget();

async function build(page: Page) {
  return buildBudget.run(async () => {
    const started = Date.now();
    try {
      const response = await page.request.post('/api/member/resume/generate', { data: {}, timeout: 120_000, maxRetries: 0 });
      const body = await jsonOf(response);
      return {
        status: response.status(),
        latencyMs: Date.now() - started,
        resume: typeof body.resume === 'string' ? body.resume : null,
        error: typeof body.error === 'string' ? body.error : null,
      };
    } catch {
      // Timeout or network failure: recorded, not retried.
      return { status: 0, latencyMs: Date.now() - started, resume: null, error: 'request failed or timed out' };
    }
  });
}

function review(draft: string) {
  const issues = findUnsupportedResumeClaims(SYNTHETIC_RESUME_SOURCE_TEXT, draft);
  return {
    pageTwoFacts: Object.fromEntries(
      Object.entries(PAGE_TWO_FACTS).map(([key, fact]) => [key, containsFact(draft, fact)]),
    ),
    // Contact values come from the member's profile, which the harness does
    // not know, so they are recorded but not asserted.
    unsupportedClaimKindsFlagged: issues.filter((issue) => issue !== 'unsupported_contact'),
    contactKindFlaggedNotAsserted: issues.includes('unsupported_contact'),
  };
}

test.describe('DEMO Resume Build acceptance (real provider)', () => {
  // Every attempt spends provider quota and rewrites the member's resume.
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.setTimeout(600_000);

  test.beforeEach(() => {
    const reason = refusal();
    if (reason !== null && workflowMode) {
      // In the workflow a refusal is a failed run, never a green skip.
      evidence.outcome = 'refused';
      evidence.refusal = reason;
      throw new Error(`Acceptance refused: ${reason}`);
    }
    test.skip(reason !== null, reason ?? '');
  });

  test.afterAll(() => {
    if (workflowMode || refusal() === null) writeEvidence();
  });

  test('one real Build from a two-page PDF retains page-two facts with no claim kinds flagged', async ({ page }) => {
    await login(page);
    evidence.before = await resumeStatus(page).then(({ enhancedText, ...rest }) => ({
      ...rest,
      hasEnhancedText: Boolean(enhancedText),
    }));

    // 1. Upload. Replaces the original and retires the previous draft objects.
    const pdf = Buffer.from(await buildSyntheticResumePdf());
    const upload = await page.request.post('/api/member/resume/upload', {
      multipart: { file: { name: SYNTHETIC_RESUME_FILE_NAME, mimeType: 'application/pdf', buffer: pdf } },
    });
    const uploadBody = await jsonOf(upload);
    evidence.upload = {
      status: upload.status(),
      extractionWarning: uploadBody.extractionWarning ?? null,
      error: uploadBody.error ?? null,
    };
    if (upload.status() !== 200) evidence.outcome = 'upload_failed';
    expect(upload.status(), 'upload of the synthetic PDF').toBe(200);

    // 2. The one Build request of this dispatch.
    const first = await build(page);
    evidence.buildRequestsMade = buildBudget.used ? 1 : 0;
    const firstOutcome = classifyBuild(first.status, first.error);
    evidence.outcome = firstOutcome;
    evidence.firstBuild = { status: first.status, outcome: firstOutcome, latencyMs: first.latencyMs, error: first.error, draft: digest(first.resume) };
    if (firstOutcome === 'provider_unconfigured') evidence.prerequisiteMissing = 'Preview provider not configured (ANTHROPIC_API_KEY / GROQ_API_KEY)';
    if (firstOutcome === 'provider_error_or_empty_output') evidence.prerequisiteMissing = 'Provider returned nothing usable (auth, quota or outage on every configured provider)';
    if (firstOutcome.startsWith('guard_')) {
      // The rejection kinds are logged server-side only
      // ("draft rejected by factuality check: <kinds>"), never in the response.
      evidence.possibleFalseRejection = { outcome: firstOutcome, error: first.error, kinds: 'server log only' };
    }
    // A failed Build is recorded and the run ends here; nothing is retried.
    expect(firstOutcome, `first Build outcome (${first.status}): ${first.error ?? ''}`).toBe('success');
    const firstDraft = first.resume ?? '';
    const firstReview = review(firstDraft);
    evidence.firstBuildReview = firstReview;

    // 3. The saved draft is the returned draft, page-two facts are retained,
    //    and findUnsupportedResumeClaims flags no claim kinds (narrow
    //    fail-closed validator; prose claims are not assessed).
    const saved = await resumeStatus(page);
    expect(saved.enhancedText?.trim(), 'saved draft equals the returned draft').toBe(firstDraft.trim());
    evidence.savedDraftMatchesResponse = true;
    for (const [key, present] of Object.entries(firstReview.pageTwoFacts)) {
      expect(present, `page-two fact "${key}" retained in the saved draft`).toBe(true);
    }
    expect(firstReview.unsupportedClaimKindsFlagged, 'claim kinds flagged by findUnsupportedResumeClaims').toEqual([]);

    // Pass = Build success + page-two facts retained + no claim kinds flagged.
    // Guarded-422 preservation is proven only by the mocked route test
    // tests/api/resume-generate-pdf-factuality.spec.ts:297-318; the live
    // provider is never called a second time.
    evidence.pass = true;
    evidence.finishedAt = new Date().toISOString();
  });
});
