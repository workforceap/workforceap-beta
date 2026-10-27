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
import { test, expect, type APIResponse, type Page, type Response } from '@playwright/test';
import {
  ACCEPTANCE_KIND,
  acceptanceRefusal,
  FIVE_ROLES,
  ROLE_ACTIONS,
  writtenValueFor,
} from '../../scripts/lib/five-role-acceptance.mjs';
import { sessionIdentityFromCookies } from '../fixtures/resumeDemoAcceptance';
import { runAcceptanceAction, main as fixtureCommand } from '../../scripts/lib/demo-acceptance-cli';
import { identityFromEnvironment } from '../../scripts/lib/demo-acceptance-lifecycle.mjs';
import { evaluateHealthPayload } from '../../scripts/lib/portal-audit-health-gate.mjs';

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
  identity: refusal ? null : identityFromEnvironment(env),
  memberScenarios: {},
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

const requestHeaders: Record<string, string> = env.DEMO_QA_VERCEL_BYPASS_SECRET ? { 'x-vercel-protection-bypass': env.DEMO_QA_VERCEL_BYPASS_SECRET } : {};
const once = { maxRetries: 0, maxRedirects: 0, timeout: 60_000, headers: requestHeaders } as const;
const memberId = () => account('member').userId;

/** One write and one app readback per role. Each write is sent exactly once. */
type ObserveResponse = (evidence: { status: number }) => Promise<void>;
const STEPS: Record<Role, (page: Page, entry: RoleEntry, observeResponse: ObserveResponse, beforeSend: () => Promise<void>) => Promise<void>> = {
  async member(page, entry, observeResponse, beforeSend) {
    const title = writtenValueFor(runId, 'member');
    await beforeSend();
    const created = await page.request.post('/api/member/goals', { ...once, data: { goalType: 'wap6_qa', title } });
    await observeResponse({ status: created.status() });
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
  async counselor(page, entry, observeResponse, beforeSend) {
    await writeNote(page, entry, 'counselor', `/api/counselor/members/${memberId()}/notes`, observeResponse, beforeSend);
  },
  async admin(page, entry, observeResponse, beforeSend) {
    await writeNote(page, entry, 'admin', `/api/admin/members/${memberId()}/notes`, observeResponse, beforeSend);
  },
  async employer(page, entry, observeResponse, beforeSend) {
    const companyName = writtenValueFor(runId, 'employer');
    await beforeSend();
    const updated = await page.request.patch('/api/employer/onboarding-profile', { ...once, data: { companyName } });
    await observeResponse({ status: updated.status() });
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
  async partner(page, entry, observeResponse, beforeSend) {
    const name = writtenValueFor(runId, 'partner');
    await beforeSend();
    const updated = await page.request.patch('/api/partner/onboarding-profile', { ...once, data: { name } });
    await observeResponse({ status: updated.status() });
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

async function writeNote(page: Page, entry: RoleEntry, role: 'counselor' | 'admin', path: string, observeResponse: ObserveResponse, beforeSend: () => Promise<void>) {
  const content = writtenValueFor(runId, role);
  await beforeSend();
  const created = await page.request.post(path, { ...once, data: { content } });
  await observeResponse({ status: created.status() });
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
    // Recheck the exact application and DEMO datasource immediately before credentials.
    const health = await fetch(`${baseURL}/api/health`, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: once.headers });
    expect(evaluateHealthPayload({ status: health.status, body: await health.text(), trustedSha: env.DEMO_QA_APP_SHA, mode: 'isolated_preview' }).ok).toBe(true);
    const operationFor = { member: 'member-goal', counselor: 'counselor-note', admin: 'admin-note', employer: 'employer-profile', partner: 'partner-profile' } as const;
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
        const origin = new URL(baseURL!).origin;
        let beforeLoginSend: (() => Promise<void>) | undefined;
        let loginSent = false;
        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          const loginRequest = url.origin === origin && url.pathname === '/api/auth/login' && request.method() === 'POST' && !entry.identityVerified;
          if (url.origin !== origin || (!loginRequest && !['GET', 'HEAD'].includes(request.method()))) return route.abort('blockedbyclient');
          if (loginRequest) {
            if (!beforeLoginSend || loginSent) return route.abort('blockedbyclient');
            loginSent = true;
            try { await beforeLoginSend(); } catch { return route.abort('blockedbyclient'); }
          }
          const headers = { ...request.headers(), ...once.headers };
          return route.continue({ headers });
        });
        const page = await context.newPage();
        entry.failedAt = 'login';
        await runAcceptanceAction(env, `login:${role}`, async (observeResponse, beforeSend) => {
          beforeLoginSend = beforeSend;
          let responseReceipt: Promise<void> | undefined;
          const received = (response: Response) => {
            if (response.request().method() === 'POST' && response.url() === `${origin}/api/auth/login`) {
              responseReceipt = observeResponse({ status: response.status() });
              void responseReceipt.catch(() => {}); // Awaited below; avoid an unhandled rejection while UI settles.
            }
          };
          page.on('response', received);
          try { await login(page, email, password); }
          finally { beforeLoginSend = undefined; page.off('response', received); await responseReceipt; }
          if (/\/(?:setup-mfa|verify-mfa)(?:[/?#]|$)/.test(page.url())) throw new Error('Staff MFA requires a separately approved fixture; acceptance is held.');
          const identity = sessionIdentityFromCookies(await context.cookies());
          entry.identityVerified = identity?.userId === userId && identity?.sub === userId;
          return { recordId: userId, matched: entry.identityVerified };
        }, result => result.matched, { expectedUserId: userId });
        if (!entry.identityVerified) {
          entry.failedAt = 'identity';
          continue;
        }
        if (role === 'member') {
          await page.goto('/dashboard/jobs', { waitUntil: 'domcontentloaded' });
          await expect(page).toHaveURL(/\/dashboard\/assessment(?:\?|$)/);
          await expect(page.getByTestId('preassessment-required-notice')).toBeVisible();
          (receipt.memberScenarios as Record<string, unknown>)['member-preassessment-incomplete'] = { passed: true, fixtureSetupOnly: true };
          await fixtureCommand('complete-preassessment', env);
          await page.goto('/dashboard/jobs', { waitUntil: 'domcontentloaded' });
          await expect(page).toHaveURL(/\/dashboard\/jobs(?:[?#]|$)/);
          await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
          (receipt.memberScenarios as Record<string, unknown>)['member-preassessment-completed'] = { passed: true, fixtureSetupOnly: true };
        }
        entry.failedAt = 'action';
        const evidence = await runAcceptanceAction(env, operationFor[role], async (observeResponse, beforeSend) => {
          await STEPS[role](page, entry, observeResponse, beforeSend);
          return { recordId: entry.recordId, matched: entry.action.ok && entry.appReadback.matched };
        }, result => result.matched);
        receipt.journalDigest = evidence.journalDigest;
        if (role === 'member') {
          const location = await runAcceptanceAction(env, 'member-location', async (observeResponse, beforeSend) => {
            await beforeSend();
            const response = await page.request.patch('/api/member/profile', { ...once, data: { city: 'QA City', state: 'GA', zip: '30301' } });
            await observeResponse({ status: response.status() });
            const readback = await page.request.get('/api/member/profile', once);
            const body = await readback.json();
            await page.goto('/dashboard/profile', { waitUntil: 'domcontentloaded' });
            await expect(page.getByLabel('Location', { exact: true })).toHaveValue('QA City');
            await expect(page.getByLabel('State', { exact: true })).toHaveValue('GA');
            await expect(page.getByLabel('ZIP', { exact: true })).toHaveValue('30301');
            return { matched: response.ok() && readback.ok() && body.profile?.city === 'QA City' && body.profile?.state === 'GA' && body.profile?.zip === '30301' };
          }, result => result.matched);
          const preferences = await runAcceptanceAction(env, 'member-notifications', async (observeResponse, beforeSend) => {
            await beforeSend();
            const response = await page.request.patch('/api/member/settings', { ...once, data: { notificationsUpdates: false, notificationsReminders: false } });
            await observeResponse({ status: response.status() });
            await page.reload({ waitUntil: 'domcontentloaded' });
            const updates = page.getByRole('checkbox', { name: 'Updates from WorkforceAP' });
            const reminders = page.getByRole('checkbox', { name: 'Training reminders' });
            await expect(updates).not.toBeChecked();
            await expect(reminders).not.toBeChecked();
            return { matched: response.ok() };
          }, result => result.matched);
          const message = await runAcceptanceAction(env, 'member-message-read', async (observeResponse, beforeSend) => {
            await beforeSend();
            const response = await page.request.patch('/api/member/messages', once);
            await observeResponse({ status: response.status() });
            const body = await response.json();
            const readback = await page.request.get('/api/member/messages', once);
            const readBody = await readback.json();
            return { matched: response.ok() && readback.ok() && typeof body.memberLastReadAt === 'string' && readBody.thread?.memberLastReadAt === body.memberLastReadAt, timestamp: body.memberLastReadAt };
          }, result => result.matched);
          for (const [scenario, result] of [['member-location', location], ['member-notifications', preferences], ['member-message-read', message]] as const) {
            (receipt.memberScenarios as Record<string, unknown>)[scenario] = { passed: true, appReadbackMatched: true, databaseMatched: true, journalDigest: result.journalDigest };
          }
          receipt.journalDigest = message.journalDigest;
        }
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
      return Boolean(entry?.identityVerified && entry.action.ok && entry.recordId && entry.appReadback.matched && !entry.failedAt);
    });
    receipt.pass = passed;
    receipt.outcome = passed ? 'success' : 'failed';
    const summary = Object.fromEntries((FIVE_ROLES as readonly Role[]).map((role) => [role, receipt.roles[role]?.failedAt ?? 'ok']));
    expect(passed, `per-role result: ${JSON.stringify(summary)}`).toBe(true);
  });
});
