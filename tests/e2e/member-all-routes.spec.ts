/**
 * Visits every canonical member dashboard path and asserts we are not stuck on /login.
 * Run with: PLAYWRIGHT_MEMBER_EMAIL, PLAYWRIGHT_PORTAL_PASSWORD
 * Optional: PLAYWRIGHT_BASE_URL (default http://localhost:3000)
 */
import { test, expect, type Page } from '@playwright/test';

const PASSWORD = process.env.PLAYWRIGHT_PORTAL_PASSWORD ?? '';
const EMAIL = process.env.PLAYWRIGHT_MEMBER_EMAIL ?? '';

const MEMBER_PATHS = [
  '/dashboard',
  '/dashboard/account',
  '/dashboard/ai-tools',
  '/dashboard/ai-tools/career-business-coach',
  '/dashboard/ai-tools/cover-letter',
  '/dashboard/ai-tools/elevator-pitch',
  '/dashboard/ai-tools/gap-analyzer',
  '/dashboard/ai-tools/history',
  '/dashboard/ai-tools/interview-coach',
  '/dashboard/ai-tools/interview-practice',
  '/dashboard/ai-tools/job-match-scorer',
  '/dashboard/ai-tools/linkedin-about',
  '/dashboard/ai-tools/linkedin-headline',
  '/dashboard/ai-tools/resume-studio?view=score',
  '/dashboard/ai-tools/resume-studio?view=coach',
  '/dashboard/ai-tools/resume-studio?view=rewrite',
  '/dashboard/ai-tools/benefits-cliff',
  '/dashboard/ai-tools/interview-prep',
  '/dashboard/ai-tools/salary-negotiation',
  '/dashboard/ai-tools/skill-checkpoints',
  '/dashboard/ai-tools/skill-mapper',
  '/dashboard/ai-tools/studio?tab=session&agent=readiness',
  '/dashboard/ai-tools/training-bridge',
  '/dashboard/ai-tools/voice-interview',
  '/dashboard/assessment',
  '/dashboard/career-brief',
  '/dashboard/career-brief/dev-placeholder',
  '/dashboard/career-library',
  '/dashboard/career-library/dev-placeholder',
  '/dashboard/certifications',
  '/dashboard/counselor',
  '/dashboard/counselor/dev-placeholder',
  '/dashboard/documents',
  '/dashboard/eligibility',
  '/dashboard/guide',
  '/dashboard/help',
  '/dashboard/job-applications',
  '/dashboard/jobs',
  '/dashboard/jobs/dev-placeholder',
  '/dashboard/learning',
  '/dashboard/learning/find-your-career',
  '/dashboard/learning/interest-profiler',
  '/dashboard/learning/labs/dev-placeholder',
  '/dashboard/learning/modules/dev-placeholder',
  '/dashboard/learning/wioa-qualification',
  '/dashboard/mentor',
  '/dashboard/mentors',
  '/dashboard/mentors/dev-placeholder',
  '/dashboard/messages',
  '/dashboard/missions',
  '/dashboard/points',
  '/dashboard/profile',
  '/dashboard/program',
  '/dashboard/program/coursera-enrollment',
  '/dashboard/program/employer-screening',
  '/dashboard/program/start',
  '/dashboard/readiness',
  '/dashboard/referrals',
  '/dashboard/resources',
  '/dashboard/resume',
  '/dashboard/survey',
  '/dashboard/weekly-recap',
  '/dashboard/assessments',
  '/dashboard/skills-assessment',
  '/dashboard/ai-tools/application-tracker',
  '/dashboard/ai-tools/resume-analysis',
  '/dashboard/ai-tools/resume-coach',
  '/dashboard/ai-tools/resume-rewriter',
  '/dashboard/toolkit',
  '/dashboard/settings',
  '/dashboard/program/change',
  '/dashboard/coursera',
  '/dashboard/training',
  '/account',
  '/applications',
  '/certifications',
] as const;

async function login(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/login?redirectTo=${encodeURIComponent('/dashboard')}`);
  await page.getByLabel(/institutional id/i).fill(EMAIL);
  await page.getByLabel(/access key/i).fill(PASSWORD);
  await page.getByRole('button', { name: /authenticate access/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
}

test.describe('member routes — auth and load', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set PLAYWRIGHT_MEMBER_EMAIL and PLAYWRIGHT_PORTAL_PASSWORD');

  test('every canonical member path leaves login', async ({ page, baseURL }) => {
    const origin = baseURL ?? 'http://localhost:3000';
    await login(page, origin);

    const rows: { path: string; finalUrl: string; title: string }[] = [];

    for (const path of MEMBER_PATHS) {
      await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
      const finalUrl = page.url();
      const title = await page.title();
      rows.push({ path, finalUrl, title });
    }

    console.log(JSON.stringify(rows, null, 2));
  });
});
