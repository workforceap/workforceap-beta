import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { test, expect, type BrowserContext, type Page, type Browser, type TestInfo, type Response } from '@playwright/test';
import { createPortalBrowserPlan, validateBrowserPhaseInput } from '../../scripts/lib/portal-browser-plan.mjs';
import { acceptanceCredentials, verifyLocalFixtureHealth } from '../../scripts/lib/portal-browser-targets.mjs';
import { LANE_SCHEMA_VERSION } from '../../scripts/lib/portal-acceptance-lanes.mjs';
import { evaluateHealthPayload } from '../../scripts/lib/portal-audit-health-gate.mjs';
import { installReadOnlyAuditCookie } from '../../scripts/lib/portal-audit-cookie.mjs';
import { classifyReadOnlyAuditRequest, redirectTargetMatches } from '../../scripts/lib/portal-audit-actions.mjs';
import { inspectPortalPage } from '../../scripts/lib/portal-audit-browser.mjs';
import { auditPortalRouteInventory } from '../../scripts/lib/portal-audit-inventory.mjs';
import { STATIC_PATHS, DYNAMIC_PATHS, REDIRECT_ONLY_PATHS } from '../../scripts/lib/portal-audit-paths.mjs';
import { beginStaffDataReadiness, navigateMemberInventoryRoute } from '../../scripts/lib/portal-c-browser-readiness.mjs';
import { verifyLocalOwnershipEnvironment } from '../../scripts/lib/portal-local-ownership.mjs';

type Case = { id: string; lane: string; role: string; path?: string; expectedPath?: string; width?: number; theme?: string; state?: string; missing?: string };
type CaseResult = { id: string; status: string; reason?: string };
type Target = { origin: string; sha: string };
type TargetKind = 'candidate' | 'baseline';
type Guard = { login: boolean; loginUsed: boolean; blocked: number };


const inputPath = process.env.PORTAL_ACCEPTANCE_INPUT;
const outputPath = process.env.PORTAL_ACCEPTANCE_OUTPUT;
// This suite must only run through the exact-deployment-gated entry point.
if (!inputPath || !outputPath) throw new Error('Use scripts/portal-browser-acceptance.mjs with explicit input and output');
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
validateBrowserPhaseInput(input, { localFixturesOnly: Boolean(input.localFixturesOnly), phasesEnabled: process.env.DEMO_QA_PHASES_ENABLED === 'true' });
let plan: ReturnType<typeof createPortalBrowserPlan>;
const results = new Map<string, CaseResult>();
const startedAt = new Date().toISOString();
const patterns = Object.values(DYNAMIC_PATHS).flat();

function checkpoint() {
  const receipts = Object.entries(plan.expectedCases).map(([lane, ids]) => {
    const cases = (ids as string[]).map(id => results.get(id) ?? { id, status: 'pending' });
    const status = cases.some(item => item.status === 'failed') ? 'failed'
      : cases.some(item => item.status === 'error') ? 'error'
        : cases.every(item => item.status === 'passed') ? 'passed' : 'incomplete';
    return { schemaVersion: LANE_SCHEMA_VERSION, identity: plan.identity, ...(plan.phase ? { phase: plan.phase } : {}), lane, status, startedAt, completedAt: new Date().toISOString(), cases };
  });
  mkdirSync(dirname(outputPath!), { recursive: true });
  const localIsolation = input.localFixturesOnly ? verifyLocalOwnershipEnvironment(process.env, plan.identity.controlSha, input.targets.candidate.origin) : undefined;
  writeFileSync(`${outputPath}.tmp`, JSON.stringify({ schemaVersion: LANE_SCHEMA_VERSION, kind: input.localFixturesOnly ? 'local-fixture-companion' : 'hosted-browser', identity: plan.identity, ...(localIsolation ? { localIsolation } : {}), ...(plan.phase ? { phase: plan.phase } : {}), expectedCases: plan.expectedCases, receipts }, null, 2));
  renameSync(`${outputPath}.tmp`, outputPath!);
}

async function health(target: Target) {
  const response = await fetch(`${target.origin}/api/health`, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: {
    ...(!input.localFixturesOnly && process.env.DEMO_QA_VERCEL_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.DEMO_QA_VERCEL_BYPASS_SECRET } : {}),
  } });
  const health = { status: response.status, body: await response.text() };
  if (input.localFixturesOnly) { verifyLocalOwnershipEnvironment(process.env, plan.identity.controlSha, target.origin); verifyLocalFixtureHealth(plan.identity, target.origin, health, { ownedDisconnectedServer: true }); return; }
  const result = evaluateHealthPayload({ ...health, trustedSha: target.sha, mode: 'isolated_preview' });
  if (!result.ok) throw new Error('Exact deployment health changed before browser use');
}

async function guardedContext(browser: Browser, target: Target, kind: TargetKind, role: string): Promise<{ context: BrowserContext; page: Page; guard: Guard }> {
  try { await health(target); } catch { throw new Error('browser_context_health_failed'); } // No credentials before this proof.
  if (input.localFixturesOnly && role !== 'anonymous') throw new Error('Local fixture companion cannot log in');
  const token = input.localFixturesOnly ? process.env.PORTAL_ACCEPTANCE_LOCAL_AUDIT_TOKEN : process.env.DEMO_QA_READ_ONLY_TOKEN;
  if (!token || token.length < 32) throw new Error('Explicit DEMO read-only capability required');
  const context = await browser.newContext({ baseURL: target.origin, serviceWorkers: 'block' });
  const guard = { login: false, loginUsed: false, blocked: 0 };
  let beforeLoginSend: (() => Promise<void>) | undefined;
  let loginDispatchError: unknown;
  let contextStage = 'cookie';
  try {
    await installReadOnlyAuditCookie(context, target.origin, token);
    contextStage = 'request_guards';
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== target.origin) { guard.blocked++; await route.abort('blockedbyclient'); return; }
      const headers = { ...request.headers(), 'x-vercel-skip-toolbar': '1',
        ...(!input.localFixturesOnly && process.env.DEMO_QA_VERCEL_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.DEMO_QA_VERCEL_BYPASS_SECRET } : {}),
      };
      // One explicit login submission; every later request uses the existing audit policy.
      if (guard.login && !guard.loginUsed && request.method() === 'POST' && url.pathname === '/api/auth/login') {
        guard.loginUsed = true; // Reserve the singleton before awaiting the durable dispatch marker.
        try {
          if (!beforeLoginSend) throw new Error('Login dispatch boundary is missing');
          await beforeLoginSend();
          await route.continue({ headers });
        } catch (error) {
          loginDispatchError = error;
          guard.blocked++;
          await route.abort('blockedbyclient');
        }
        return;
      }
      const disposition = classifyReadOnlyAuditRequest(request.method(), request.url(), target.origin);
      if (disposition === 'suppress_telemetry') { await route.fulfill({ status: 204, body: '' }); return; }
      if (disposition === 'suppress_side_effect_get') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mfaEnforcement: false, mfaRequired: false, currentAal: 'aal2', nextAal: 'aal2', auditSuppressed: true }) }); return;
      }
      if (disposition !== 'continue') { guard.blocked++; await route.abort('blockedbyclient'); return; }
      await route.continue({ headers });
    });
    await context.routeWebSocket('**/*', socket => { guard.blocked++; socket.close(); });
    await context.addInitScript(() => { if (!localStorage.getItem('wap-theme')) localStorage.setItem('wap-theme', 'light'); });
    contextStage = 'new_page';
    const page = await context.newPage();
    contextStage = 'login';
    if (role !== 'anonymous') {
      // Shared accounts cannot be journal-owned; even sign-in can write MemberEvent rows.
      if (!process.env[`FIVE_ROLE_QA_${role.toUpperCase()}_EMAIL`]) throw new Error('Hosted login requires a run-owned FIVE_ROLE_QA identity');
      const credentials = acceptanceCredentials(role, process.env, plan.identity.runId);
      // Keep the journal and its credential-bearing runtime out of the local anonymous path.
      // Playwright's CommonJS TS hook loads the CLI; native .mts imports retain ESM audit guards.
      const { runAcceptanceAction } = createRequire(import.meta.url)('../../scripts/lib/demo-acceptance-cli') as typeof import('../../scripts/lib/demo-acceptance-cli');
      const operation = plan.phase ? `browser-login:${plan.phase.name}:${kind}:${role}` : `browser-login:${kind}:${role}`;
      const evidence = await runAcceptanceAction(process.env, operation, async (observeResponse, beforeSend) => {
        beforeLoginSend = beforeSend;
        let observedResponse: Promise<unknown> | undefined;
        const captureLoginResponse = (response: Response) => {
          const url = new URL(response.url());
          if (observedResponse || response.request().method() !== 'POST' || url.origin !== target.origin || url.pathname !== '/api/auth/login') return;
          observedResponse = observeResponse({ status: response.status() });
          // The finally block awaits this same promise; avoid an early unhandled rejection.
          void observedResponse.catch(() => {});
        };
        page.on('response', captureLoginResponse);
        try {
          await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
          const decline = page.getByRole('button', { name: /decline/i });
          if (await decline.count()) await decline.click();
          await page.locator('#email').fill(credentials.email);
          await page.locator('#password').fill(credentials.password);
          // The durable intent and expected fixture actor check precede this only sign-in.
          guard.login = true;
          await page.getByRole('button', { name: /sign in/i }).click();
          await page.waitForURL(url => url.origin === target.origin && !/^\/(?:[a-z]{2}\/)?login\/?$/.test(url.pathname), { timeout: 60_000 });
          guard.login = false;
          if (!observedResponse) throw new Error('Login completed without a durable HTTP response observation');
          await observedResponse;
          if (/^\/(?:[a-z]{2}\/)?(?:setup|verify)-mfa(?:\/|$)/.test(new URL(page.url()).pathname)) throw new Error('MFA setup or verification remains an explicit held gate');
          const actor = await page.evaluate(async () => {
            const profile = await fetch('/api/member/profile', { redirect: 'error' });
            const claims = await fetch('/api/auth/me', { redirect: 'error' });
            if (!profile.ok || !claims.ok) throw new Error('Identity readback failed');
            return { profile: await profile.json(), claims: await claims.json() };
          });
          if (actor.profile.user?.id !== credentials.userId || actor.profile.user?.email?.toLowerCase() !== credentials.email || actor.claims.role !== role || actor.claims.superAdmin !== false || !actor.claims.availablePortals?.some((portal: { role: string }) => portal.role === role)) throw new Error('Server identity or role differs from the approved synthetic fixture');
          return { recordId: credentials.userId, matched: true };
        } finally {
          guard.login = false;
          beforeLoginSend = undefined;
          page.off('response', captureLoginResponse);
          // Preserve a known HTTP outcome even if navigation, MFA or identity assertions fail.
          if (observedResponse) await observedResponse;
          if (loginDispatchError) throw loginDispatchError;
        }
      }, result => result.matched === true, { expectedUserId: credentials.userId, ...(plan.phase ? { expectedPhase: plan.phase } : {}) });
      if (!evidence.result.matched) throw new Error('Journaled browser identity did not match');
    } else if (input.localFixturesOnly) {
      contextStage = 'local_fixture_start';
      const firstFixture = plan.cases.find(item => item.lane === 'fixture-render-matrix' && item.path)?.path;
      if (!firstFixture) throw new Error('Current local registry is empty');
      await page.goto(firstFixture, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    } else await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    guard.login = false;
    return { context, page, guard };
  } catch { await context.close(); throw new Error(`browser_context_${contextStage}_failed`); }
}

async function settle(page: Page, item: Case, origin: string) {
  await page.setViewportSize({ width: item.width ?? 1440, height: item.width === 390 ? 844 : 900 });
  await page.evaluate(theme => localStorage.setItem('wap-theme', theme), item.theme ?? 'light');
  const ready = beginStaffDataReadiness(page, item.expectedPath ?? item.path!, origin);
  try {
    try { await navigateMemberInventoryRoute(page, item.path!, { trustedOrigin: origin, expectedPath: item.expectedPath ?? item.path!, dynamicPatterns: patterns, timeout: 45_000 }); }
    catch { throw new Error('browser_case_readiness_failed'); }
    try { await ready(); } catch { throw new Error('browser_case_staff_data_failed'); }
    const inspection = await inspectPortalPage(page, patterns);
    // Anonymous local fixtures cannot have the authenticated middleware marker.
    // Their separate capability is the positively bound, disconnected owned process.
    if (input.localFixturesOnly) verifyLocalOwnershipEnvironment(process.env, plan.identity.controlSha, origin);
    if (!input.localFixturesOnly && !inspection.readOnlyCapabilityActive) throw new Error('browser_case_capability_failed');
    if (!inspection.appReady || inspection.errorFallbackDetected) throw new Error('browser_case_content_failed');
    if (inspection.horizontalOverflowPx > 1) throw new Error('browser_case_layout_failed');
    if (/placeholder|future batch/i.test(inspection.bodyText) && item.lane === 'fixture-render-matrix') throw new Error('Fixture is a placeholder and cannot establish rendering coverage');
    // The reviewed no-mentor phase redirects to the public application, which has no workspace shell.
    if (item.role !== 'anonymous' && item.expectedPath !== '/mentor/apply') {
      const workspaceRole = item.path!.startsWith('/dashboard') ? 'member' : item.role;
      await expect(page.locator(`.workspace-shell-root[data-workspace-role="${workspaceRole}"]`)).toHaveCount(1);
      await expect(page.locator('[data-workspace-role]:not([data-workspace-role="member"])[data-member-home-compact]')).toHaveCount(0);
    }
    await page.evaluate(() => document.fonts.ready);
    if (item.state === 'drawer') {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toBeVisible();
    } else if (item.width !== 390 && ['expanded', 'collapsed'].includes(item.state ?? '')) {
      const desired = page.getByRole('button', { name: item.state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar', exact: true });
      if (!(await desired.isVisible())) await page.getByRole('button', { name: item.state === 'collapsed' ? 'Collapse sidebar' : 'Expand sidebar', exact: true }).click();
      await expect(desired).toBeVisible();
    }
  } finally { ready.dispose(); }
}

function mask(page: Page) {
  return [page.locator('time, [data-dynamic-time]'), page.getByText(/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i), page.getByText(/\b(?:just now|\d+\s*[smhd]\s*ago)\b/i)];
}

async function compare(baseline: Page, candidate: Page, item: Case, info: TestInfo, index: number) {
  await health(input.targets.baseline);
  await health(input.targets.candidate);
  await settle(baseline, item, input.targets.baseline.origin);
  await settle(candidate, item, input.targets.candidate.origin);
  const name = `${plan.identity.runId}-${index}.png`;
  const file = info.snapshotPath(name);
  mkdirSync(dirname(file), { recursive: true });
  // Baseline is freshly captured from the separately attested deployment only.
  writeFileSync(file, await baseline.screenshot({ fullPage: true, animations: 'disabled', mask: mask(baseline) }));
  await expect(candidate).toHaveScreenshot(name, { fullPage: true, animations: 'disabled', mask: mask(candidate), maxDiffPixels: 0, threshold: 0.02 });
}

test('current portal browser acceptance records every required case', async ({ browser }, info) => {
  // The trusted config imports the current TS registry; this ESM suite keeps native .mjs guards intact.
  plan = createPortalBrowserPlan({ ...input, fixtures: info.config.metadata.portalReviewFixtures });
  if (input.localFixturesOnly) {
    plan.cases = plan.cases.filter(item => item.lane === 'fixture-render-matrix' && item.missing === 'local_development_only_fixture').map(item => ({ ...item, missing: undefined }));
    if (!plan.cases.length) throw new Error('Current registry has no local-only companion cases');
    plan.expectedCases = { 'fixture-render-matrix': plan.cases.map(item => item.id) };
  }
  checkpoint();
  const pages = new Map<string, Awaited<ReturnType<typeof guardedContext>>>();
  const failedContexts = new Set<string>();
  const getPage = async (kind: TargetKind, role: string) => {
    const key = `${kind}:${role}`;
    if (failedContexts.has(key)) throw new Error('A failed browser context cannot retry sign-in');
    if (!pages.has(key)) {
      try { pages.set(key, await guardedContext(browser, input.targets[kind], kind, role)); }
      catch (error) { failedContexts.add(key); throw error; }
    }
    return pages.get(key)!;
  };
  try {
    for (const [index, item] of (plan.cases as Case[]).entries()) {
      if (item.missing) { results.set(item.id, { id: item.id, status: 'incomplete', reason: item.missing }); checkpoint(); continue; }
      try {
        if (item.lane === 'inventory-readiness') {
          const inventory = auditPortalRouteInventory({ appRoot: 'app', staticPaths: STATIC_PATHS, dynamicPaths: DYNAMIC_PATHS, redirectOnlyPaths: REDIRECT_ONLY_PATHS });
          if (!inventory.ok) throw new Error('Current route inventory drift');
        } else {
          const role = item.lane === 'logged-out-routes' ? 'anonymous' : item.role;
          const candidate = await getPage('candidate', role);
          const blockedBefore = candidate.guard.blocked;
          const errors: string[] = [];
          const pageError = () => errors.push('page_error');
          candidate.page.on('pageerror', pageError);
          try {
            if (item.lane === 'logged-out-routes') {
              await candidate.page.goto(item.path!, { waitUntil: 'domcontentloaded', timeout: 45_000 });
              await candidate.page.waitForURL(url => url.origin === input.targets.candidate.origin && /^\/(?:[a-z]{2}\/)?login\/?$/.test(url.pathname), { timeout: 15_000 });
              await expect(candidate.page.locator('#email')).toBeVisible();
            } else if (item.lane.endsWith('comparison')) {
              const baseline = await getPage('baseline', role);
              const baselineBlocked = baseline.guard.blocked;
              await compare(baseline.page, candidate.page, item, info, index);
              if (baseline.guard.blocked !== baselineBlocked) throw new Error('Baseline attempted a blocked request');
            } else await settle(candidate.page, item, input.targets.candidate.origin);
            if (errors.length) throw new Error('browser_case_page_error_failed');
            if (candidate.guard.blocked !== blockedBefore) throw new Error('browser_case_network_failed');
            if (item.expectedPath && !redirectTargetMatches(candidate.page.url(), item.expectedPath, input.targets.candidate.origin)) throw new Error('Final route changed after readiness');
          } finally { candidate.page.off('pageerror', pageError); }
        }
        results.set(item.id, { id: item.id, status: 'passed' });
      } catch (error) {
        // No private DOM text, response bodies, URL tokens or credentials in receipts.
        const code = error instanceof Error && /^browser_(?:context_(?:health|cookie|request_guards|new_page|login|local_fixture_start)|case_(?:readiness|staff_data|capability|content|layout|page_error|network))_failed$/.test(error.message) ? error.message : 'required_browser_contract_failed';
        results.set(item.id, { id: item.id, status: 'failed', reason: code });
      }
      checkpoint();
    }
  } finally {
    await Promise.all([...pages.values()].map(value => value.context.close()));
    checkpoint();
  }
  expect([...results.values()].filter(result => result.status !== 'passed'), 'All required browser cases must pass; missing fixtures remain incomplete').toEqual([]);
});
