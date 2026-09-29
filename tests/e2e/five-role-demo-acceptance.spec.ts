/**
 * WAP-6 five-role DEMO action and persistence acceptance. Each of the five
 * per-run synthetic users made by scripts/five-role-demo-fixture.ts signs in
 * on the exact-SHA DEMO Preview, makes ONE write and reads it back through the
 * app:
 *   member     POST /api/member/goals                  -> GET /api/member/goals
 *   counselor  POST /api/counselor/members/:id/notes   -> GET same route
 *   admin      POST /api/admin/members/:id/notes       -> GET same route
 *   employer   PATCH /api/employer/onboarding-profile  -> /employer/jobs/new #company-name
 *   partner    PATCH /api/partner/onboarding-profile   -> GET /api/partner/dashboard
 * Runbook: docs/FIVE-ROLE-DEMO-ACCEPTANCE.md. Only the trusted workflow
 * `.github/workflows/five-role-demo-acceptance.yml` runs it, after its SHA,
 * DEMO project and key gates. It is inert unless every FIVE_ROLE_* input is set
 * (scripts/lib/five-role-acceptance.mjs acceptanceRefusal), never retries and
 * sends each write once.
 *
 * The receipt records only statuses, booleans, the synthetic users' IDs and
 * example.com emails, and the written rows' IDs. No error text is recorded,
 * because it can contain the Preview origin (a secret).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test, expect, type APIResponse, type Page } from '@playwright/test';
import {
  ACCEPTANCE_KIND,
  acceptanceRefusal,
  FIVE_ROLES,
  ROLE_ACTIONS,
  writtenValueFor,
} from '../../scripts/lib/five-role-acceptance.mjs';
import { sessionIdentityFromCookies } from '../fixtures/resumeDemoAcceptance';

type Role = 'member' | 'counselor' | 'admin' | 'employer' | 'partner';
interface RoleEntry {
  userId: string;
  email: string;
  identityVerified: boolean;
  action: { method: string; path: string; status: number | null; ok: boolean };
  recordId: string | null;
  appReadback: { status: number | null; matched: boolean };
  failedAt?: string;
}

const env = process.env;
const refusal = acceptanceRefusal(env);
const workflowMode = env.FIVE_ROLE_ACCEPTANCE_MODE === 'workflow';
const output = env.FIVE_ROLE_ACCEPTANCE_OUTPUT?.trim() || 'test-results/five-role-demo-acceptance.json';
const runId = env.FIVE_ROLE_QA_RUN_ID?.trim() ?? '';

const receipt: Record<string, unknown> & { roles: Partial<Record<Role, RoleEntry>> } = {
  kind: ACCEPTANCE_KIND,
  runId,
  startedAt: new Date().toISOString(),
  attempts: 1,
  pass: false,
  outcome: refusal ? 'refused' : 'failed',
  ...(refusal ? { refusal } : {}),
  roles: {},
};

function account(role: Role) {
  const upper = role.toUpperCase();
  return {
    email: env[`FIVE_ROLE_QA_${upper}_EMAIL`]!.trim().toLowerCase(),
    userId: env[`FIVE_ROLE_QA_${upper}_ID`]!.trim(),
    password: env[`FIVE_ROLE_QA_${upper}_PASSWORD`]!.replace(/\r$/, ''),
  };
}

async function jsonOf(response: APIResponse): Promise<unknown> {
  return response.json().catch(() => null);
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login?redirectTo=%2F', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /decline/i }).click().catch(() => {});
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login([?#]|$)/, { timeout: 60_000 });
}

const once = { maxRetries: 0, timeout: 60_000 } as const;
const memberId = () => account('member').userId;

/** One write and one app readback per role. Each write is sent exactly once. */
const STEPS: Record<Role, (page: Page, entry: RoleEntry) => Promise<void>> = {
  async member(page, entry) {
    const title = writtenValueFor(runId, 'member');
    const created = await page.request.post('/api/member/goals', { ...once, data: { goalType: 'wap6_qa', title } });
    entry.action.status = created.status();
    const goal = ((await jsonOf(created)) as { goal?: { id?: unknown } } | null)?.goal;
    entry.action.ok = created.ok() && typeof goal?.id === 'string';
    entry.recordId = typeof goal?.id === 'string' ? goal.id : null;
    if (!entry.action.ok) return;
    const read = await page.request.get('/api/member/goals', once);
    entry.appReadback.status = read.status();
    const goals = ((await jsonOf(read)) as { goals?: Array<{ id?: unknown; title?: unknown }> } | null)?.goals ?? [];
    entry.appReadback.matched = read.ok() && goals.some((g) => g.id === entry.recordId && g.title === title);
  },
  async counselor(page, entry) {
    await writeNote(page, entry, 'counselor', `/api/counselor/members/${memberId()}/notes`);
  },
  async admin(page, entry) {
    await writeNote(page, entry, 'admin', `/api/admin/members/${memberId()}/notes`);
  },
  async employer(page, entry) {
    const companyName = writtenValueFor(runId, 'employer');
    const updated = await page.request.patch('/api/employer/onboarding-profile', { ...once, data: { companyName } });
    entry.action.status = updated.status();
    entry.action.ok = updated.ok();
    entry.recordId = env.FIVE_ROLE_QA_EMPLOYER_RECORD_ID!.trim();
    if (!entry.action.ok) return;
    const read = await page.goto('/employer/jobs/new', { waitUntil: 'domcontentloaded' });
    entry.appReadback.status = read?.status() ?? null;
    const field = page.locator('#company-name');
    const shown = (await field.count()) === 1 ? await field.inputValue() : null;
    entry.appReadback.matched = Boolean(read?.ok()) && shown === companyName;
  },
  async partner(page, entry) {
    const name = writtenValueFor(runId, 'partner');
    const updated = await page.request.patch('/api/partner/onboarding-profile', { ...once, data: { name } });
    entry.action.status = updated.status();
    entry.action.ok = updated.ok();
    entry.recordId = env.FIVE_ROLE_QA_PARTNER_RECORD_ID!.trim();
    if (!entry.action.ok) return;
    const read = await page.request.get('/api/partner/dashboard', once);
    entry.appReadback.status = read.status();
    const body = (await jsonOf(read)) as { partnerId?: unknown; partnerName?: unknown } | null;
    entry.appReadback.matched = read.ok() && body?.partnerId === entry.recordId && body?.partnerName === name;
  },
};

async function writeNote(page: Page, entry: RoleEntry, role: 'counselor' | 'admin', path: string) {
  const content = writtenValueFor(runId, role);
  const created = await page.request.post(path, { ...once, data: { content } });
  entry.action.status = created.status();
  const note = (await jsonOf(created)) as { id?: unknown } | null;
  entry.action.ok = created.ok() && typeof note?.id === 'string';
  entry.recordId = typeof note?.id === 'string' ? note.id : null;
  if (!entry.action.ok) return;
  const read = await page.request.get(path, once);
  entry.appReadback.status = read.status();
  const notes = (await jsonOf(read)) as Array<{ id?: unknown; content?: unknown; authorId?: unknown }> | null;
  entry.appReadback.matched = read.ok() && Array.isArray(notes)
    && notes.some((n) => n.id === entry.recordId && n.content === content && n.authorId === entry.userId);
}

function writeReceipt() {
  receipt.finishedAt = new Date().toISOString();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
}

test.describe.configure({ mode: 'serial', retries: 0 });

test.describe('WAP-6 five-role DEMO acceptance', () => {
  // Outside the workflow a refusal skips (inert locally); in workflow mode it fails.
  test.skip(!workflowMode && refusal !== null, `five-role acceptance is inert: ${refusal}`);

  test.afterAll(() => {
    if (workflowMode || refusal === null) writeReceipt();
  });

  test('each synthetic role writes once and reads the write back through the app', async ({ browser, baseURL }) => {
    test.setTimeout(10 * 60_000);
    expect(refusal, 'acceptance inputs').toBeNull();
    for (const role of FIVE_ROLES as readonly Role[]) {
      const { email, userId, password } = account(role);
      const { method, path } = ROLE_ACTIONS[role];
      const entry: RoleEntry = {
        userId, email, identityVerified: false,
        action: { method, path, status: null, ok: false }, recordId: null,
        appReadback: { status: null, matched: false },
      };
      receipt.roles[role] = entry;
      const context = await browser.newContext({ baseURL });
      try {
        const page = await context.newPage();
        entry.failedAt = 'login';
        await login(page, email, password);
        const identity = sessionIdentityFromCookies(await context.cookies());
        entry.identityVerified = identity?.userId === userId && identity?.sub === userId;
        if (!entry.identityVerified) {
          entry.failedAt = 'identity';
          continue;
        }
        entry.failedAt = 'action';
        await STEPS[role](page, entry);
        if (entry.action.ok && entry.appReadback.matched) delete entry.failedAt;
        else if (entry.action.ok) entry.failedAt = 'app-readback';
      } catch {
        // Recorded as the stage only; error text can contain the Preview origin.
      } finally {
        await context.close();
      }
    }
    const passed = (FIVE_ROLES as readonly Role[]).every((role) => {
      const entry = receipt.roles[role];
      return Boolean(entry?.identityVerified && entry.action.ok && entry.recordId && entry.appReadback.matched);
    });
    receipt.pass = passed;
    receipt.outcome = passed ? 'success' : 'failed';
    const summary = Object.fromEntries((FIVE_ROLES as readonly Role[]).map((role) => [role, receipt.roles[role]?.failedAt ?? 'ok']));
    expect(passed, `per-role result: ${JSON.stringify(summary)}`).toBe(true);
  });
});
