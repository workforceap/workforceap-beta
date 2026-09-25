/**
 * Five-role authenticated portal audit.
 *
 * Security contract:
 * - validate an exact trusted origin before reading credentials or launching a browser;
 * - use one distinct account and one in-memory storage state per role;
 * - run exhaustive desktop/mobile coverage only against an isolated preview;
 * - keep production to the explicit, read-only root canary plus access probes.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATTENDED_ACTION_GATES,
  DYNAMIC_PATHS,
  PRODUCTION_CANARY_PATHS,
  PRODUCTION_CANARY_ROLES,
  REDIRECT_ONLY_PATHS,
  REQUIRED_DYNAMIC_PATHS,
  ROLE_ACCESS_ROOTS,
  ROLE_ACCESS_MATRIX,
  SAFE_ACTION_CONTRACTS,
  SECTION_LOGIN_REDIRECT,
  STATIC_PATHS,
} from './lib/portal-audit-paths.mjs';
import {
  loadPortalAuditEnvFile,
  validateDedicatedPortalCredentials,
} from './lib/portal-audit-auth.mjs';
import { canonicalPathname, classifyPortalAuditRow } from './lib/portal-audit-classify.mjs';
import {
  isAbortedReadRequest,
  isVerifiedReadOnlyDestination,
  isVercelPreviewToolbarCspError,
  requestFailureCategory,
  sanitizedRequestPath,
} from './lib/portal-audit-environment.mjs';
import {
  PORTAL_AUDIT_NAVIGATION_TIMEOUT_MS,
  PORTAL_AUDIT_VIEWPORTS,
  inspectPortalPage,
  READ_ONLY_AUDIT_ROOT_SUPPRESSION_MARKER,
  sanitizeAuditDiagnostic,
  sanitizeAuditUrl,
  waitForPortalReady,
} from './lib/portal-audit-browser.mjs';
import {
  applyBlockedWriteFailure,
  classifyReadOnlyAuditRequest,
  redirectDestinationFailureReasons,
  dataRequestQuietWindowSatisfied,
  evaluateAccessProbe,
  fixtureConditionMatches,
  isBlockedAuditTelemetryRequest,
  isAllowedReadOnlyNonGetRequest,
  navigationTargetMatches,
  missingRedirectFixtureOutcome,
  redirectTargetMatches,
  resolveRedirectAuditEntry,
  resolveDynamicRouteCandidates,
  summarizeActionCoverage,
  summarizeRedirectCoverage,
} from './lib/portal-audit-actions.mjs';
import {
  auditPortalRouteInventory,
  formatPortalRouteInventoryDrift,
} from './lib/portal-audit-inventory.mjs';
import {
  formatPortalAuditTargetErrors,
  normalizePortalAuditMode,
  validatePortalAuditTarget,
} from './lib/portal-audit-target.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDirectory, '..');
const rawBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || 'http://localhost:3000';
const rawRequestedMode =
  process.env.PORTAL_AUDIT_MODE?.trim().toLowerCase() ||
  (rawBaseURL.startsWith('http://localhost:') || rawBaseURL.startsWith('http://127.0.0.1:')
    ? 'local'
    : '');
// Normalize before the first crash-safe artifact is written. An interrupted
// run must never leave an enum-invalid requested mode on disk.
const requestedMode = normalizePortalAuditMode(rawRequestedMode);
const sectionArg = (process.env.PORTAL_AUDIT_SECTION ?? 'all').trim().toLowerCase();
const outputPath = process.env.PORTAL_AUDIT_OUTPUT
  ? resolve(root, process.env.PORTAL_AUDIT_OUTPUT)
  : join(root, 'test-results', 'portal-audit-results.json');
const routeConcurrency = Math.min(
  12,
  Math.max(1, Number.parseInt(process.env.PORTAL_AUDIT_ROUTE_CONCURRENCY ?? '8', 10) || 8)
);
const runStartedAt = Date.now();
let deadlineAt = runStartedAt + 25 * 60_000;
let trustedOrigin = null;
let vercelToolbarCspDiagnosticCount = 0;

const READ_ONLY_AUDIT_TOKEN_HEADER_NAME = 'x-workforceap-read-only-audit-token';

const allDynamicPatterns = Object.values(DYNAMIC_PATHS).flat();

function sanitizePortalDiagnostic(value) {
  return sanitizeAuditDiagnostic(value, allDynamicPatterns);
}

function boundedDiagnosticPush(list, diagnostic) {
  if (list.length < 10) list.push(diagnostic);
}

async function installReadOnlyRequestGuard(context, options = {}) {
  const blockedByPage = new WeakMap();
  const blockedDiagnosticsByPage = new WeakMap();
  const blockedTelemetryByPage = new WeakMap();
  const suppressedSideEffectsByPage = new WeakMap();
  let unscopedBlockedCount = 0;
  const unscopedBlockedDiagnostics = [];
  let unscopedBlockedTelemetryCount = 0;
  let unscopedSuppressedSideEffectCount = 0;

  await context.route('**/*', async (route) => {
    const request = route.request();
    const disposition = classifyReadOnlyAuditRequest(
      request.method(),
      request.url(),
      trustedOrigin,
      options
    );

    if (disposition === 'suppress_telemetry') {
      try {
        const page = request.frame().page();
        blockedTelemetryByPage.set(
          page,
          (blockedTelemetryByPage.get(page) ?? 0) + 1
        );
      } catch {
        unscopedBlockedTelemetryCount += 1;
      }
      // Count expected mount telemetry but satisfy the caller locally so a
      // deliberately suppressed write does not create a false console error.
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (disposition === 'suppress_side_effect_get') {
      try {
        const page = request.frame().page();
        suppressedSideEffectsByPage.set(
          page,
          (suppressedSideEffectsByPage.get(page) ?? 0) + 1
        );
      } catch {
        unscopedSuppressedSideEffectCount += 1;
      }
      // The MFA banner only needs a non-sensitive enrolled state. Fulfilling
      // locally avoids consuming shared Upstash rate-limit capacity.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mfaEnforcement: false,
          mfaRequired: false,
          currentAal: 'aal2',
          nextAal: 'aal2',
          auditSuppressed: true,
        }),
      });
      return;
    }

    if (disposition === 'continue') {
      let isTrustedRequest = false;
      try {
        isTrustedRequest = new URL(request.url()).origin === trustedOrigin;
      } catch {
        // Safe methods may continue without receiving the audit-only header.
      }
      if (isTrustedRequest) {
        await route.continue({
          headers: {
            ...request.headers(),
            [READ_ONLY_AUDIT_TOKEN_HEADER_NAME]: process.env.PORTAL_AUDIT_READ_ONLY_TOKEN,
          },
        });
      } else {
        await route.continue();
      }
      return;
    }

    const blockedDiagnostic = {
      method: request.method().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 12) || 'UNKNOWN',
      path: sanitizedRequestPath(request.url(), allDynamicPatterns),
    };
    try {
      const page = request.frame().page();
      blockedByPage.set(page, (blockedByPage.get(page) ?? 0) + 1);
      const diagnostics = blockedDiagnosticsByPage.get(page) ?? [];
      boundedDiagnosticPush(diagnostics, blockedDiagnostic);
      blockedDiagnosticsByPage.set(page, diagnostics);
    } catch {
      unscopedBlockedCount += 1;
      boundedDiagnosticPush(unscopedBlockedDiagnostics, blockedDiagnostic);
    }
    await route.abort('blockedbyclient');
  });

  return {
    blockedWriteCount(page) {
      return (blockedByPage.get(page) ?? 0) + unscopedBlockedCount;
    },
    blockedWriteRequests(page) {
      return [...(blockedDiagnosticsByPage.get(page) ?? []), ...unscopedBlockedDiagnostics].slice(0, 10);
    },
    blockedTelemetryCount(page) {
      return (
        (blockedTelemetryByPage.get(page) ?? 0) + unscopedBlockedTelemetryCount
      );
    },
    suppressedSideEffectCount(page) {
      return (
        (suppressedSideEffectsByPage.get(page) ?? 0) + unscopedSuppressedSideEffectCount
      );
    },
  };
}

function discoveryExclusionsForRole(role) {
  return [
    ...(STATIC_PATHS[role] ?? []),
    ...(REDIRECT_ONLY_PATHS[role] ?? []).map((entry) => entry.path),
  ];
}

function emptyInventory() {
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    sections: {},
    unexpectedManifestSections: [],
    status: 'not_run',
  };
}

function emptySummary() {
  return {
    totalStaticChecks: 0,
    passedStaticChecks: 0,
    failedStaticChecks: 0,
    failedRoles: 0,
    totalAccessProbes: 0,
    failedAccessProbes: 0,
    totalDynamicChecks: 0,
    passedDynamicChecks: 0,
    failedDynamicChecks: 0,
    notApplicableDynamicRoutes: 0,
    totalRedirectChecks: 0,
    passedRedirectChecks: 0,
    failedRedirectChecks: 0,
    notApplicableRedirectChecks: 0,
    totalRequiredActions: 0,
    satisfiedRequiredActions: 0,
    failedRequiredActions: 0,
    vercelToolbarCspDiagnosticCount: 0,
    abortedDataRequestCount: 0,
  };
}

const artifact = {
  $schema: '../docs/portal-audit-results.schema.json',
  schemaVersion: '3.3.0',
  // A run starts failed/incomplete. Only a complete green run changes this to passed,
  // so a killed process can never leave a stale success artifact behind.
  status: 'failed',
  baseURL: null,
  generatedAt: new Date(runStartedAt).toISOString(),
  completedAt: null,
  requestedSections: [],
  viewports: [],
  targetValidation: {
    ok: false,
    mode: requestedMode || null,
    targetClass: null,
    errors: ['not_validated'],
  },
  inventory: emptyInventory(),
  credentialValidation: {
    ok: false,
    errors: [],
    sources: {},
    authenticatedIdentitiesDistinct: null,
  },
  executionPolicy: {
    mode: requestedMode || null,
    evidenceScope: null,
    mutations: 'authentication_login_only',
    authState: 'in_memory_per_role',
    dynamicRoutes: requestedMode === 'production_canary'
      ? 'root_access_only'
      : 'safe_visible_link_discovery',
    actions: requestedMode === 'production_canary'
      ? 'root_access_only'
      : 'internal_read_only_anchor_navigation',
    routeConcurrency,
    deadlineMs: null,
  },
  attendedGates: ATTENDED_ACTION_GATES,
  accessMatrix: {
    policy: ROLE_ACCESS_MATRIX,
    probes: [],
    summary: { total: 0, passed: 0, failed: 0 },
  },
  roles: {},
  summary: emptySummary(),
  fatalError: 'audit_did_not_complete',
};

function writeArtifact() {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

function sectionsToRun(mode) {
  const roles = Object.keys(STATIC_PATHS);
  if (mode === 'production_canary') {
    if (sectionArg !== 'all') {
      throw new Error('Production canary uses its fixed non-staff role matrix');
    }
    return [...PRODUCTION_CANARY_ROLES];
  }
  if (mode === 'isolated_preview' && sectionArg !== 'all') {
    throw new Error('Trusted preview audits must run the complete five-role matrix');
  }
  if (sectionArg === 'all') return roles;
  if (roles.includes(sectionArg)) return [sectionArg];
  throw new Error(`PORTAL_AUDIT_SECTION must be one of: all, ${roles.join(', ')}`);
}

function routesForRole(role, mode) {
  return mode === 'production_canary' ? PRODUCTION_CANARY_PATHS[role] : STATIC_PATHS[role];
}

function viewportsForMode(mode) {
  return mode === 'production_canary' ? [PORTAL_AUDIT_VIEWPORTS[0]] : PORTAL_AUDIT_VIEWPORTS;
}

function routeURL(path) {
  return new URL(path, `${trustedOrigin}/`).toString();
}

function queryVariantMatches(requestedPath, finalUrl) {
  const requested = new URL(requestedPath, `${trustedOrigin}/`);
  if (!requested.search) return true;
  const final = new URL(finalUrl);
  const normalize = (params) => [...params.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  return JSON.stringify(normalize(requested.searchParams))
    === JSON.stringify(normalize(final.searchParams));
}

function pathIsInRole(url, role) {
  let parsed;
  try {
    parsed = new URL(url, `${trustedOrigin}/`);
  } catch {
    return false;
  }
  if (parsed.origin !== trustedOrigin) return false;
  const pathname = canonicalPathname(parsed.pathname);
  const rootPath = SECTION_LOGIN_REDIRECT[role];
  return pathname === rootPath || pathname.startsWith(`${rootPath}/`);
}

function remainingTimeout(maximum = PORTAL_AUDIT_NAVIGATION_TIMEOUT_MS) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error('portal_audit_deadline_exceeded');
  return Math.max(1_000, Math.min(maximum, remaining));
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const drain = () => {
    while (active < limit && queue.length > 0) {
      const next = queue.shift();
      active += 1;
      Promise.resolve()
        .then(next.task)
        .then(next.resolve, next.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };
  return (task) =>
    new Promise((resolvePromise, rejectPromise) => {
      queue.push({ task, resolve: resolvePromise, reject: rejectPromise });
      drain();
    });
}

async function dismissCookieBanner(page) {
  await page.getByRole('button', { name: /decline/i }).click().catch(() => {});
}

async function captureRoleStorageState(browser, role, credential) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const guardOptions = { allowAuthentication: true };
  const readOnlyGuard = await installReadOnlyRequestGuard(context, guardOptions);
  const page = await context.newPage();

  try {
    const entry = SECTION_LOGIN_REDIRECT[role];
    await page.goto(routeURL(`/login?redirectTo=${encodeURIComponent(entry)}`), {
      waitUntil: 'domcontentloaded',
      timeout: remainingTimeout(),
    });
    await waitForPortalReady(page, remainingTimeout(5_000));
    await dismissCookieBanner(page);
    await page.locator('#email').fill(credential.email);
    await page.locator('#password').fill(credential.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((url) => canonicalPathname(url.toString()) !== '/login', {
      timeout: remainingTimeout(45_000),
    });
    guardOptions.allowAuthentication = false;

    if (!pathIsInRole(page.url(), role)) {
      await page.goto(routeURL(entry), {
        waitUntil: 'domcontentloaded',
        timeout: remainingTimeout(),
      });
    }
    await page.waitForURL((url) => pathIsInRole(url.toString(), role), {
      waitUntil: 'domcontentloaded',
      timeout: remainingTimeout(45_000),
    });
    await waitForPortalReady(page, remainingTimeout(5_000));

    if (!pathIsInRole(page.url(), role)) {
      throw new Error(
        `Dedicated ${role} login landed on ${canonicalPathname(page.url())}, outside ${entry}`
      );
    }

    const capabilityInspection = await inspectPortalPage(page, allDynamicPatterns);
    if (!pathIsInRole(page.url(), role)) {
      throw new Error(`Dedicated ${role} login left ${entry} during page inspection`);
    }
    if (!capabilityInspection.readOnlyCapabilityActive) {
      throw new Error(
        `read_only_audit_capability_not_active_for_${role}: expected ${READ_ONLY_AUDIT_ROOT_SUPPRESSION_MARKER}`
      );
    }

    const identityResponse = await page.request.get(routeURL('/api/member/profile'), {
      timeout: remainingTimeout(10_000),
      failOnStatusCode: false,
    });
    const identityBody = await identityResponse.json().catch(() => null);
    const identityId = identityBody?.user?.id;
    if (!identityResponse.ok() || typeof identityId !== 'string' || !identityId) {
      throw new Error(`Unable to verify the authenticated ${role} identity`);
    }

    let fixtureClaims = null;
    if (artifact.targetValidation.mode !== 'production_canary' && (role === 'admin' || role === 'member')) {
      fixtureClaims = await page.evaluate(async () => {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) return null;
        const body = await response.json();
        return { role: body?.role, superAdmin: body?.superAdmin };
      });
      if (
        typeof fixtureClaims?.role !== 'string' ||
        typeof fixtureClaims?.superAdmin !== 'boolean'
      ) {
        throw new Error(`Unable to verify the authenticated ${role} fixture claims`);
      }
    }

    return {
      storageState: await context.storageState(),
      finalPathname: canonicalPathname(sanitizeAuditUrl(page.url(), allDynamicPatterns)),
      identityId,
      fixtureClaims,
      blockedPostLoginWriteRequestCount: readOnlyGuard.blockedWriteCount(page),
      blockedPostLoginTelemetryRequestCount: readOnlyGuard.blockedTelemetryCount(page),
      suppressedPostLoginSideEffectRequestCount: readOnlyGuard.suppressedSideEffectCount(page),
    };
  } finally {
    await context.close();
  }
}

function uniqueDiagnostics(values) {
  return [...new Set(values.map(sanitizePortalDiagnostic).filter(Boolean))].slice(0, 20);
}

function recordConsoleError(message, applicationErrors) {
  if (message.type() !== 'error') return false;
  if (isVercelPreviewToolbarCspError(message.text(), {
    mode: artifact.targetValidation.mode,
    trustedOrigin,
  })) {
    vercelToolbarCspDiagnosticCount += 1;
    return true;
  }
  applicationErrors.push(message.text());
  return false;
}

function failedSameOriginDataResponse(response) {
  const type = response.request().resourceType();
  if (type !== 'fetch' && type !== 'xhr') return null;
  if (response.status() < 400) return null;
  try {
    if (new URL(response.url()).origin !== trustedOrigin) return null;
  } catch {
    return `Same-origin data request returned HTTP ${response.status()}`;
  }
  return `Same-origin data request returned HTTP ${response.status()} at ${sanitizeAuditUrl(
    response.url(),
    allDynamicPatterns
  )}`;
}

function isSameOriginDataRequest(request) {
  const type = request.resourceType();
  if (type !== 'fetch' && type !== 'xhr') return false;
  try {
    return new URL(request.url()).origin === trustedOrigin;
  } catch {
    return false;
  }
}

function failedSameOriginDataRequest(request) {
  if (!isSameOriginDataRequest(request)) return null;
  let pathname = '/';
  try {
    pathname = new URL(request.url()).pathname;
  } catch {
    // The same-origin predicate already rejected unparseable URLs.
  }
  const method = request.method().toUpperCase();
  if (isBlockedAuditTelemetryRequest(method, pathname)) return null;
  if (
    method !== 'GET' &&
    method !== 'HEAD' &&
    method !== 'OPTIONS' &&
    !isAllowedReadOnlyNonGetRequest(method, pathname)
  ) {
    // The read-only request guard records and gates intentionally blocked
    // writes. Avoid duplicating the same evidence as a network failure.
    return null;
  }
  const category = requestFailureCategory(request.failure()?.errorText);
  const resourceType = request.resourceType();
  const headers = request.headers();
  let hasRscQuery = false;
  try {
    hasRscQuery = new URL(request.url()).searchParams.has('_rsc');
  } catch {
    // The same-origin predicate already rejected unparseable URLs.
  }
  return {
    message: `Same-origin data request failed (${category}) at ${sanitizeAuditUrl(
      request.url(),
      allDynamicPatterns
    )}`,
    category,
    method,
    resourceType,
    path: sanitizedRequestPath(request.url(), allDynamicPatterns),
    prefetch: 'next-router-prefetch' in headers ||
      /\bprefetch\b/i.test(headers.purpose ?? '') ||
      /\bprefetch\b/i.test(headers['sec-purpose'] ?? ''),
    rsc: headers.rsc === '1' || hasRscQuery,
  };
}

function trackSameOriginDataRequests(page) {
  const inFlight = new Set();
  const errors = [];
  const abortedErrors = [];
  const abortedDataRequests = [];
  let abortedDataRequestCount = 0;
  let lastActivityAt = Date.now();

  const handleRequest = (request) => {
    if (!isSameOriginDataRequest(request)) return;
    inFlight.add(request);
    lastActivityAt = Date.now();
  };
  const handleResponse = (response) => {
    const error = failedSameOriginDataResponse(response);
    if (error) errors.push(error);
  };
  const handleRequestFinished = (request) => {
    if (!inFlight.delete(request)) return;
    lastActivityAt = Date.now();
  };
  const handleRequestFailed = (request) => {
    if (inFlight.delete(request)) lastActivityAt = Date.now();
    const failure = failedSameOriginDataRequest(request);
    if (!failure) return;
    if (isAbortedReadRequest(failure)) {
      abortedDataRequestCount += 1;
      boundedDiagnosticPush(abortedErrors, failure.message);
      boundedDiagnosticPush(abortedDataRequests, {
        method: failure.method,
        path: failure.path,
        resourceType: failure.resourceType,
        prefetch: failure.prefetch,
        rsc: failure.rsc,
      });
    } else {
      errors.push(failure.message);
    }
  };

  page.on('request', handleRequest);
  page.on('response', handleResponse);
  page.on('requestfinished', handleRequestFinished);
  page.on('requestfailed', handleRequestFailed);

  return {
    errors,
    abortedErrors,
    abortedDataRequests,
    get abortedDataRequestCount() {
      return abortedDataRequestCount;
    },
    async waitForSettlement(timeoutMs) {
      const boundedTimeout = Math.max(1, Math.min(timeoutMs, 5_000));
      const waitStartedAt = Date.now();
      const settleDeadline = Date.now() + boundedTimeout;
      const quietWindowMs = 300;
      while (Date.now() < settleDeadline) {
        if (
          dataRequestQuietWindowSatisfied({
            inFlightCount: inFlight.size,
            lastActivityAt,
            waitStartedAt,
            now: Date.now(),
            quietWindowMs,
          })
        ) {
          return;
        }
        await page.waitForTimeout(Math.min(50, Math.max(1, settleDeadline - Date.now())));
      }
      if (inFlight.size > 0) {
        errors.push(
          `Same-origin data requests did not settle within ${boundedTimeout}ms (${inFlight.size} pending)`
        );
      }
    },
    detach() {
      page.off('request', handleRequest);
      page.off('response', handleResponse);
      page.off('requestfinished', handleRequestFinished);
      page.off('requestfailed', handleRequestFailed);
    },
  };
}

async function auditRoute(
  context,
  role,
  viewportName,
  requestPath,
  artifactPath = requestPath,
  readOnlyGuard = null,
  options = {}
) {
  const page = await context.newPage();
  const startedAt = Date.now();
  const consoleErrors = [];
  let environmentalConsoleErrorCount = 0;
  const pageErrors = [];
  const documentResponses = [];
  const dataRequests = trackSameOriginDataRequests(page);
  const handleConsole = (message) => {
    if (recordConsoleError(message, consoleErrors)) environmentalConsoleErrorCount += 1;
  };
  const handlePageError = (error) => pageErrors.push(error?.message ?? String(error));
  const handleResponse = (response) => {
    if (response.request().resourceType() === 'document') {
      documentResponses.push({ status: response.status(), url: response.url() });
    }
  };

  page.on('console', handleConsole);
  page.on('pageerror', handlePageError);
  page.on('response', handleResponse);

  try {
    try {
      await page.goto(routeURL(requestPath), {
        waitUntil: 'domcontentloaded',
        timeout: remainingTimeout(),
      });
      await waitForPortalReady(page, remainingTimeout(5_000));
    } catch (error) {
      const message = error?.message ?? String(error);
      const recoverable =
        message.includes('net::ERR_ABORTED') || message.includes('interrupted by another navigation');
      if (!recoverable) pageErrors.push(`Navigation failed: ${message}`);
      await waitForPortalReady(page, remainingTimeout(3_000)).catch(() => {});
    }

    // Wait for mount-time same-origin XHR/fetch work to complete. A bounded
    // quiet window catches slow API failures without allowing a hung endpoint
    // to stall the release gate indefinitely. DOM inspection must happen after
    // this settlement window so an async error boundary cannot appear after a
    // stale, healthy-looking snapshot has already been captured.
    await dataRequests.waitForSettlement(remainingTimeout(5_000));

    if (options.accessProbe && !documentResponses.some(({ status }) => status === 401 || status === 403)) {
      // A denied nested layout may stream a generic shell before its server
      // redirect reaches the browser. The shell has links but no heading, so
      // the ordinary readiness check can return before the denial resolves.
      // Give a real destination heading a bounded chance to appear. A blank
      // target still fails below; this never counts absence of content as a
      // successful denial.
      await page.locator('h1:visible').first().waitFor({
        state: 'visible',
        timeout: remainingTimeout(7_500),
      }).catch(() => {});
      await dataRequests.waitForSettlement(remainingTimeout(5_000));
    }

    let inspection;
    try {
      inspection = await inspectPortalPage(page, allDynamicPatterns);
    } catch (error) {
      pageErrors.push(`Page inspection failed: ${error?.message ?? String(error)}`);
      inspection = {
        bodyText: '',
        appReady: false,
        errorFallbackDetected: false,
        errorFallbackStates: [],
        auditSuppressedStates: [],
        readOnlyCapabilityActive: false,
        h1Count: 0,
        horizontalOverflowPx: 0,
        interactiveControlCount: 0,
        unnamedInteractiveControlCount: 0,
        unnamedInteractiveControls: [],
        hrefPaths: [],
      };
    }

    const blockedWriteRequestCount = readOnlyGuard?.blockedWriteCount(page) ?? 0;
    if (blockedWriteRequestCount > 0) {
      pageErrors.push('Read-only audit policy blocked a non-GET request');
    }

    const finalUrl = page.url();
    const finalDocument =
      [...documentResponses].reverse().find((response) => response.url === finalUrl) ??
      documentResponses.at(-1) ??
      null;

    const rowInput = {
      role,
      viewport: viewportName,
      path: artifactPath,
      expectedPath: artifactPath.includes('[')
        ? new URL(sanitizeAuditUrl(routeURL(requestPath), allDynamicPatterns)).pathname
        : requestPath,
      comparisonExpectedPath: requestPath,
      sectionRoot: SECTION_LOGIN_REDIRECT[role],
      finalUrl: sanitizeAuditUrl(finalUrl, allDynamicPatterns),
      comparisonFinalUrl: finalUrl,
      originMatched: new URL(finalUrl).origin === trustedOrigin,
      queryVariantMatched: queryVariantMatches(requestPath, finalUrl),
      title: sanitizePortalDiagnostic(await page.title().catch(() => '')),
      bodyText: inspection.bodyText,
      appReady: inspection.appReady,
      errorFallbackDetected: inspection.errorFallbackDetected,
      errorFallbackStates: inspection.errorFallbackStates,
      auditSuppressedStates: inspection.auditSuppressedStates,
      readOnlyCapabilityActive: inspection.readOnlyCapabilityActive,
      documentStatus: finalDocument?.status ?? null,
      consoleErrors: uniqueDiagnostics(consoleErrors),
      vercelToolbarCspDiagnosticCount: environmentalConsoleErrorCount,
      pageErrors: uniqueDiagnostics([...pageErrors, ...dataRequests.errors]),
      abortedDataRequestCount: dataRequests.abortedDataRequestCount,
      abortedDataRequests: dataRequests.abortedDataRequests,
      h1Count: inspection.h1Count,
      horizontalOverflowPx: inspection.horizontalOverflowPx,
      blockedWriteRequestCount,
      blockedTelemetryRequestCount:
        readOnlyGuard?.blockedTelemetryCount(page) ?? 0,
      blockedWriteRequests: readOnlyGuard?.blockedWriteRequests(page) ?? [],
      suppressedSideEffectRequestCount:
        readOnlyGuard?.suppressedSideEffectCount(page) ?? 0,
      interactiveControlCount: inspection.interactiveControlCount,
      unnamedInteractiveControlCount: inspection.unnamedInteractiveControlCount,
      unnamedInteractiveControls: inspection.unnamedInteractiveControls,
      durationMs: Date.now() - startedAt,
    };
    const candidateRow = classifyPortalAuditRow(rowInput);
    const abortsAreDiagnostic = isVerifiedReadOnlyDestination({
      exactExpectedPath: !candidateRow.unexpectedRedirect && !candidateRow.queryVariantMismatch,
      sameOrigin: candidateRow.originMatched,
      documentStatus: candidateRow.documentStatus,
      appReady: candidateRow.appReady,
      h1Count: candidateRow.h1Count,
      readOnlyCapabilityActive: candidateRow.readOnlyCapabilityActive,
      errorFallbackDetected: candidateRow.routeErrorFallback || candidateRow.notFoundFallback,
      consoleErrorCount: candidateRow.consoleErrorCount,
      pageErrorCount: candidateRow.pageErrorCount,
      otherFailureCount: candidateRow.failureReasons.length,
    });
    const row = dataRequests.abortedDataRequestCount === 0 || abortsAreDiagnostic
      ? candidateRow
      : classifyPortalAuditRow({
          ...rowInput,
          pageErrors: uniqueDiagnostics([...rowInput.pageErrors, ...dataRequests.abortedErrors]),
        });
    const discoveredRoutes = row.ok
      ? resolveDynamicRouteCandidates({
          hrefPaths: inspection.hrefPaths,
          patterns: DYNAMIC_PATHS[role],
          excludedPaths: discoveryExclusionsForRole(role),
          sourcePath: requestPath,
          sourceArtifactPath: artifactPath,
        })
      : [];
    return { row, discoveredRoutes };
  } finally {
    page.off('console', handleConsole);
    page.off('pageerror', handlePageError);
    page.off('response', handleResponse);
    dataRequests.detach();
    await page.close();
  }
}

async function auditViewport(browser, role, storageState, viewport, paths, limit) {
  const context = await browser.newContext({
    storageState,
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: 'block',
  });
  const readOnlyGuard = await installReadOnlyRequestGuard(context);
  try {
    const audits = await Promise.all(
      paths.map((path) =>
        limit(() => auditRoute(context, role, viewport.name, path, path, readOnlyGuard))
      )
    );
    const rows = audits.map((audit) => audit.row);
    const failed = rows.filter((row) => !row.ok).length;
    return {
      result: {
        viewport,
        summary: { total: rows.length, passed: rows.length - failed, failed },
        rows,
      },
      discoveredRoutes: audits.flatMap((audit) => audit.discoveredRoutes),
    };
  } finally {
    await context.close();
  }
}

function addFirstResolvedCandidate(candidatesByPattern, candidates) {
  for (const candidate of candidates ?? []) {
    if (!candidatesByPattern.has(candidate.pattern)) {
      candidatesByPattern.set(candidate.pattern, candidate);
    }
  }
}

function dynamicRouteRequirement(role, pattern) {
  return (REQUIRED_DYNAMIC_PATHS[role] ?? []).includes(pattern)
    ? 'required'
    : 'when_discoverable';
}

function redirectFixtureRequirement(role, entry) {
  return (DYNAMIC_PATHS[role] ?? []).includes(entry.target)
    ? dynamicRouteRequirement(role, entry.target)
    : 'required';
}

async function auditDynamicRoutes(browser, role, storageState, initialCandidates, mode) {
  if (mode === 'production_canary') {
    return {
      results: (DYNAMIC_PATHS[role] ?? []).map((pattern) => ({
        pattern,
        requirement: dynamicRouteRequirement(role, pattern),
        status: 'not_applicable',
        reason: 'production_canary_root_only_policy',
        discoveredFrom: null,
        routeCheck: null,
      })),
      resolvedPaths: new Map(),
    };
  }

  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const readOnlyGuard = await installReadOnlyRequestGuard(context);
  const candidatesByPattern = new Map();
  const coverageByPattern = new Map();
  const resolvedPaths = new Map();
  addFirstResolvedCandidate(candidatesByPattern, initialCandidates);

  try {
    while (true) {
      const next = [...candidatesByPattern.values()].find(
        (candidate) => !coverageByPattern.has(candidate.pattern)
      );
      if (!next) break;
      const audit = await auditRoute(
        context,
        role,
        'desktop',
        next.path,
        next.pattern,
        readOnlyGuard
      );
      const status = audit.row.ok ? 'passed' : 'failed';
      coverageByPattern.set(next.pattern, {
        pattern: next.pattern,
        requirement: dynamicRouteRequirement(role, next.pattern),
        status,
        reason: status === 'passed' ? 'safe_visible_fixture_audited' : 'discovered_route_failed',
        discoveredFrom: next.sourceArtifactPath ?? null,
        routeCheck: audit.row,
      });
      if (audit.row.ok) resolvedPaths.set(next.pattern, next.path);
      addFirstResolvedCandidate(candidatesByPattern, audit.discoveredRoutes);
    }
  } finally {
    await context.close();
  }

  const results = (DYNAMIC_PATHS[role] ?? []).map(
    (pattern) => {
      const requirement = dynamicRouteRequirement(role, pattern);
      return coverageByPattern.get(pattern) ?? {
        pattern,
        requirement,
        status: requirement === 'required' ? 'failed' : 'not_applicable',
        reason: requirement === 'required'
          ? 'required_visible_fixture_not_discovered'
          : 'no_safe_visible_fixture',
        discoveredFrom: null,
        routeCheck: null,
      };
    }
  );
  return { results, resolvedPaths };
}

async function auditRedirectOnlyRoutes(browser, role, storageState, fixtureClaims, resolvedPaths, mode) {
  const entries = REDIRECT_ONLY_PATHS[role] ?? [];
  if (mode === 'production_canary') {
    const results = entries.map((entry) => ({
      path: entry.path,
      target: entry.target,
      reason: entry.reason,
      resolvedSourcePath: null,
      resolvedTargetPath: null,
      status: 'not_applicable',
      resultReason: 'production_canary_root_only_policy',
      finalUrl: null,
      failureReasons: [],
      consoleErrors: [],
      pageErrors: [],
      blockedWriteRequestCount: 0,
      blockedWriteRequests: [],
      abortedDataRequestCount: 0,
      abortedDataRequests: [],
      blockedTelemetryRequestCount: 0,
      suppressedSideEffectRequestCount: 0,
    }));
    return { results, summary: summarizeRedirectCoverage(results) };
  }

  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const readOnlyGuard = await installReadOnlyRequestGuard(context);
  const results = [];

  try {
    for (const entry of entries) {
      const resolved = resolveRedirectAuditEntry(entry, resolvedPaths);
      const missingFixtureOutcome = resolved
        ? null
        : missingRedirectFixtureOutcome(redirectFixtureRequirement(role, entry));
      const result = {
        path: entry.path,
        target: entry.target,
        reason: entry.reason,
        // Persist checked-in templates, never concrete fixture identifiers.
        // The raw resolved values stay in memory only for the actual probe.
        resolvedSourcePath: resolved ? entry.path.replace(/\[[^\]]+\]/g, '[redacted]') : null,
        resolvedTargetPath: resolved ? entry.target.replace(/\[[^\]]+\]/g, '[redacted]') : null,
        status: resolved ? 'failed' : missingFixtureOutcome.status,
        resultReason: resolved ? 'redirect_target_mismatch' : missingFixtureOutcome.resultReason,
        finalUrl: null,
        failureReasons: resolved ? [] : missingFixtureOutcome.failureReasons,
        consoleErrors: [],
        pageErrors: [],
        blockedWriteRequestCount: 0,
        blockedWriteRequests: [],
        abortedDataRequestCount: 0,
        abortedDataRequests: [],
        blockedTelemetryRequestCount: 0,
        suppressedSideEffectRequestCount: 0,
      };
      if (!resolved) {
        results.push(result);
        continue;
      }
      if (!fixtureConditionMatches(entry.fixtureCondition, role, fixtureClaims)) {
        result.failureReasons.push('fixture_condition_mismatch');
        result.resultReason = 'fixture_condition_not_verified';
        results.push(result);
        continue;
      }

      const page = await context.newPage();
      const dataRequests = trackSameOriginDataRequests(page);
      const consoleErrors = [];
      const pageErrors = [];
      const documentResponses = [];
      const handleConsole = (message) => recordConsoleError(message, consoleErrors);
      const handlePageError = (error) => pageErrors.push(error?.message ?? String(error));
      const handleResponse = (response) => {
        if (response.request().resourceType() === 'document') {
          documentResponses.push({ status: response.status(), url: response.url() });
        }
      };
      page.on('console', handleConsole);
      page.on('pageerror', handlePageError);
      page.on('response', handleResponse);
      try {
        try {
          await page.goto(routeURL(resolved.sourcePath), {
            waitUntil: 'domcontentloaded',
            timeout: remainingTimeout(),
          });
        } catch (error) {
          const message = error?.message ?? String(error);
          if (!message.includes('net::ERR_ABORTED') && !message.includes('interrupted by another navigation')) {
            throw error;
          }
        }
        await page.waitForURL(
          (url) => redirectTargetMatches(url.toString(), resolved.targetPath, trustedOrigin),
          // A guarded source can chain through another redirect before load.
          // Wait for the final navigation to commit, then inspect its document,
          // readiness, and read-only health below instead of treating the
          // intermediate load cancellation as a failed destination.
          { waitUntil: 'commit', timeout: remainingTimeout(7_000) }
        );
        await waitForPortalReady(page, remainingTimeout(5_000));
        if (entry.fixtureCondition) {
          await page.locator('h1:visible').first().waitFor({
            state: 'visible',
            timeout: remainingTimeout(5_000),
          }).catch(() => {});
        }
        await dataRequests.waitForSettlement(remainingTimeout(5_000));
        const finalUrl = page.url();
        result.finalUrl = sanitizeAuditUrl(finalUrl, allDynamicPatterns);
        const inspection = await inspectPortalPage(page, allDynamicPatterns);
        const finalDocument =
          [...documentResponses].reverse().find((response) => response.url === finalUrl) ??
          documentResponses.at(-1) ??
          null;
        result.failureReasons.push(...redirectDestinationFailureReasons({
          finalUrl,
          expectedTarget: resolved.targetPath,
          trustedOrigin,
          documentStatus: finalDocument?.status ?? null,
          inspection,
          consoleErrorCount: consoleErrors.length,
          pageErrorCount: pageErrors.length,
          dataErrorCount: dataRequests.errors.length,
          abortedDataRequestCount: dataRequests.abortedDataRequestCount,
          blockedWriteRequestCount: readOnlyGuard.blockedWriteCount(page),
        }));
        if (result.failureReasons.length === 0) {
          result.status = 'passed';
          result.resultReason = entry.target === '/partners#partner-signup'
            ? 'public_partner_signup_redirect_verified'
            : entry.fixtureCondition
              ? 'fixture_conditional_redirect_verified'
              : 'exact_internal_redirect_verified';
        } else {
          result.resultReason = entry.fixtureCondition
            ? 'fixture_conditional_redirect_unhealthy'
            : 'redirect_target_unhealthy';
        }
      } catch (error) {
        result.finalUrl = sanitizeAuditUrl(page.url(), allDynamicPatterns);
        result.failureReasons.push(sanitizePortalDiagnostic(error?.message ?? String(error)));
        result.resultReason = 'redirect_probe_failed';
      } finally {
        page.off('console', handleConsole);
        page.off('pageerror', handlePageError);
        page.off('response', handleResponse);
        result.consoleErrors = uniqueDiagnostics(consoleErrors);
        result.pageErrors = uniqueDiagnostics(pageErrors);
        result.blockedWriteRequestCount = readOnlyGuard.blockedWriteCount(page);
        result.blockedWriteRequests = readOnlyGuard.blockedWriteRequests(page);
        result.abortedDataRequestCount = dataRequests.abortedDataRequestCount;
        result.abortedDataRequests = dataRequests.abortedDataRequests;
        result.blockedTelemetryRequestCount = readOnlyGuard.blockedTelemetryCount(page);
        result.suppressedSideEffectRequestCount = readOnlyGuard.suppressedSideEffectCount(page);
        if (result.blockedWriteRequestCount > 0) {
          result.failureReasons.push('non_get_request_blocked');
          result.status = 'failed';
          result.resultReason = 'write_request_blocked';
        }
        result.failureReasons = [...new Set(result.failureReasons)];
        dataRequests.detach();
        await page.close();
      }
      results.push(result);
    }
  } finally {
    await context.close();
  }

  return { results, summary: summarizeRedirectCoverage(results) };
}

function targetArtifactPath(contract) {
  return contract.targetPath ?? contract.targetPattern;
}

async function findVisibleActionAnchor(page, contract, resolvedDynamicPath) {
  const anchors = page.locator('a[href]');
  const count = await anchors.count();
  for (let index = 0; index < count; index += 1) {
    const anchor = anchors.nth(index);
    if (!(await anchor.isVisible().catch(() => false))) continue;
    const href = await anchor.getAttribute('href');
    if (!href) continue;
    let url;
    try {
      url = new URL(href, page.url());
    } catch {
      continue;
    }
    if (url.origin !== trustedOrigin) continue;
    const concretePath = `${url.pathname}${url.search}`;
    if (navigationTargetMatches(concretePath, contract, resolvedDynamicPath)) {
      return { anchor, concretePath };
    }
  }
  return null;
}

async function exerciseReadOnlyNavigation(
  context,
  role,
  contract,
  resolvedDynamicPath,
  readOnlyGuard
) {
  const result = {
    id: contract.id,
    kind: contract.kind,
    required: Boolean(contract.required),
    requiredWhenApplicable: Boolean(contract.requiredWhenApplicable),
    sourcePath: contract.sourcePath,
    target: targetArtifactPath(contract),
    status: 'failed',
    reason: 'action_did_not_complete',
    finalUrl: null,
    failureReasons: [],
    blockedWriteRequestCount: 0,
    blockedWriteRequests: [],
    abortedDataRequestCount: 0,
    abortedDataRequests: [],
    blockedTelemetryRequestCount: 0,
    suppressedSideEffectRequestCount: 0,
  };
  const page = await context.newPage();
  const consoleErrors = [];
  let environmentalConsoleErrorCount = 0;
  const pageErrors = [];
  const documentResponses = [];
  const dataRequests = trackSameOriginDataRequests(page);
  let verifiedDestination = false;
  const handleConsole = (message) => {
    if (recordConsoleError(message, consoleErrors)) environmentalConsoleErrorCount += 1;
  };
  const handlePageError = (error) => pageErrors.push(error?.message ?? String(error));
  const handleResponse = (response) => {
    if (response.request().resourceType() === 'document') {
      documentResponses.push({ status: response.status(), url: response.url() });
    }
  };
  page.on('console', handleConsole);
  page.on('pageerror', handlePageError);
  page.on('response', handleResponse);

  try {
    await page.goto(routeURL(contract.sourcePath), {
      waitUntil: 'domcontentloaded',
      timeout: remainingTimeout(),
    });
    await waitForPortalReady(page, remainingTimeout(5_000));
    await dataRequests.waitForSettlement(remainingTimeout(5_000));
    const sourceInspection = await inspectPortalPage(page, allDynamicPatterns);
    if (sourceInspection.errorFallbackDetected) {
      result.reason = 'source_error_fallback';
      result.failureReasons.push('source_error_fallback');
      return result;
    }
    const match = await findVisibleActionAnchor(page, contract, resolvedDynamicPath);

    if (!match) {
      if (
        contract.requiredWhenApplicable &&
        contract.emptyStateText &&
        sourceInspection.bodyText.includes(contract.emptyStateText)
      ) {
        const sourceUrl = page.url();
        const sourceDocument =
          [...documentResponses].reverse().find((response) => response.url === sourceUrl) ??
          documentResponses.at(-1) ??
          null;
        // A declared empty state satisfies a conditional action only on a
        // healthy, exact, read-only source. Canceled prefetches are diagnostic
        // after that proof, just as they are after a verified destination.
        verifiedDestination = isVerifiedReadOnlyDestination({
          exactExpectedPath: redirectTargetMatches(sourceUrl, contract.sourcePath, trustedOrigin),
          sameOrigin: new URL(sourceUrl).origin === trustedOrigin,
          documentStatus: sourceDocument?.status ?? null,
          appReady: sourceInspection.appReady,
          h1Count: sourceInspection.h1Count,
          readOnlyCapabilityActive: sourceInspection.readOnlyCapabilityActive,
          errorFallbackDetected: sourceInspection.errorFallbackDetected,
          consoleErrorCount: uniqueDiagnostics(consoleErrors).length,
          pageErrorCount: uniqueDiagnostics(pageErrors).length,
          otherFailureCount: dataRequests.errors.length +
            (readOnlyGuard.blockedWriteCount(page) > 0 ? 1 : 0),
        });
        result.status = verifiedDestination ? 'not_applicable' : 'failed';
        result.reason = verifiedDestination
          ? 'declared_empty_state_verified'
          : 'declared_empty_state_source_unhealthy';
        result.finalUrl = sanitizeAuditUrl(sourceUrl, allDynamicPatterns);
        if (!verifiedDestination) result.failureReasons.push(result.reason);
        return result;
      }
      result.reason = contract.targetPattern
        ? 'missing_visible_dynamic_anchor_or_declared_empty_state'
        : 'missing_visible_safe_anchor';
      result.failureReasons.push(result.reason);
      return result;
    }

    if (contract.kind === 'read_only_discovered_navigation') {
      // Follow the visible link target without dispatching page onClick handlers;
      // some record links emit analytics even though the destination is read-only.
      await page.goto(routeURL(match.concretePath), {
        waitUntil: 'domcontentloaded',
        timeout: remainingTimeout(),
      });
    } else {
      await match.anchor.click({ timeout: remainingTimeout() });
    }
    await page.waitForURL(
      (url) =>
        navigationTargetMatches(
          `${url.pathname}${url.search}`,
          contract,
          resolvedDynamicPath
        ),
      { timeout: remainingTimeout(20_000) }
    );
    await waitForPortalReady(page, remainingTimeout(5_000));
    await dataRequests.waitForSettlement(remainingTimeout(5_000));
    const targetInspection = await inspectPortalPage(page, allDynamicPatterns);
    const finalPath = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
    if (!navigationTargetMatches(finalPath, contract, resolvedDynamicPath)) {
      result.failureReasons.push('navigation_target_mismatch');
    }
    if (!pathIsInRole(page.url(), role)) result.failureReasons.push('wrong_role_redirect');
    if (!targetInspection.appReady) result.failureReasons.push('app_not_ready');
    if (targetInspection.errorFallbackDetected) result.failureReasons.push('route_error_fallback');
    if (!targetInspection.readOnlyCapabilityActive) {
      result.failureReasons.push('read_only_audit_capability_not_active');
    }
    if (targetInspection.h1Count !== 1) result.failureReasons.push('invalid_h1_count');
    if (targetInspection.horizontalOverflowPx > 1) {
      result.failureReasons.push('horizontal_overflow');
    }
    const finalDocument = documentResponses.at(-1) ?? null;
    if (!Number.isInteger(finalDocument?.status) || finalDocument.status < 200 || finalDocument.status >= 300) {
      result.failureReasons.push('document_error_status');
    }
    result.failureReasons.push(
      ...uniqueDiagnostics(consoleErrors).map(() => 'console_error'),
      ...uniqueDiagnostics(pageErrors).map(() => 'page_error')
    );
    result.failureReasons = [...new Set(result.failureReasons)];
    result.finalUrl = sanitizeAuditUrl(
      page.url(),
      contract.targetPattern ? allDynamicPatterns : []
    );
    verifiedDestination = isVerifiedReadOnlyDestination({
      exactExpectedPath: navigationTargetMatches(finalPath, contract, resolvedDynamicPath),
      sameOrigin: new URL(page.url()).origin === trustedOrigin,
      documentStatus: finalDocument?.status ?? null,
      appReady: targetInspection.appReady,
      h1Count: targetInspection.h1Count,
      readOnlyCapabilityActive: targetInspection.readOnlyCapabilityActive,
      errorFallbackDetected: targetInspection.errorFallbackDetected,
      consoleErrorCount: uniqueDiagnostics(consoleErrors).length,
      pageErrorCount: uniqueDiagnostics(pageErrors).length,
      otherFailureCount: result.failureReasons.length + dataRequests.errors.length +
        (readOnlyGuard.blockedWriteCount(page) > 0 ? 1 : 0),
    });
    result.status = result.failureReasons.length === 0 ? 'passed' : 'failed';
    result.reason = result.status === 'passed'
      ? contract.kind === 'read_only_discovered_navigation'
        ? 'visible_fixture_navigated_without_onclick_side_effects'
        : 'read_only_anchor_navigation_exercised'
      : 'action_checks_failed';
    return result;
  } catch (error) {
    result.failureReasons.push(sanitizePortalDiagnostic(error?.message ?? String(error)));
    result.reason = 'action_execution_failed';
    return result;
  } finally {
    applyBlockedWriteFailure(result, readOnlyGuard.blockedWriteCount(page));
    result.blockedWriteRequests = readOnlyGuard.blockedWriteRequests(page);
    result.abortedDataRequestCount = dataRequests.abortedDataRequestCount;
    result.abortedDataRequests = dataRequests.abortedDataRequests;
    result.blockedTelemetryRequestCount = readOnlyGuard.blockedTelemetryCount(page);
    result.suppressedSideEffectRequestCount = readOnlyGuard.suppressedSideEffectCount(page);
    result.vercelToolbarCspDiagnosticCount = environmentalConsoleErrorCount;
    if (uniqueDiagnostics(consoleErrors).length > 0) {
      result.failureReasons = [...new Set([...result.failureReasons, 'console_error'])];
      result.status = 'failed';
    }
    if (uniqueDiagnostics(pageErrors).length > 0) {
      result.failureReasons = [...new Set([...result.failureReasons, 'page_error'])];
      result.status = 'failed';
    }
    if (
      result.status === 'failed' &&
      (result.reason === 'read_only_anchor_navigation_exercised' ||
        result.reason === 'visible_fixture_navigated_without_onclick_side_effects')
    ) {
      result.reason = 'action_checks_failed';
    }
    verifiedDestination = verifiedDestination &&
      (result.status === 'passed' ||
        (result.status === 'not_applicable' && result.reason === 'declared_empty_state_verified')) &&
      dataRequests.errors.length === 0 &&
      result.blockedWriteRequestCount === 0;
    if (
      dataRequests.errors.length > 0 ||
      (dataRequests.abortedDataRequestCount > 0 && !verifiedDestination)
    ) {
      const previousStatus = result.status;
      result.failureReasons = [
        ...new Set([...result.failureReasons, 'same_origin_data_request_failed']),
      ];
      result.status = 'failed';
      if (previousStatus !== 'failed') result.reason = 'data_request_failed';
    }
    page.off('console', handleConsole);
    page.off('pageerror', handlePageError);
    page.off('response', handleResponse);
    dataRequests.detach();
    await page.close();
  }
}

async function auditRoleActions(browser, role, storageState, resolvedPaths, mode) {
  const contracts = SAFE_ACTION_CONTRACTS[role] ?? [];
  if (mode === 'production_canary') {
    const results = contracts.map((contract) => ({
      id: contract.id,
      kind: contract.kind,
      required: false,
      requiredWhenApplicable: false,
      sourcePath: contract.sourcePath,
      target: targetArtifactPath(contract),
      status: 'not_applicable',
      reason: 'production_canary_root_only_policy',
      finalUrl: null,
      failureReasons: [],
      blockedWriteRequestCount: 0,
      blockedWriteRequests: [],
      abortedDataRequestCount: 0,
      abortedDataRequests: [],
      blockedTelemetryRequestCount: 0,
      suppressedSideEffectRequestCount: 0,
    }));
    return { results, summary: summarizeActionCoverage(results) };
  }

  const context = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  const readOnlyGuard = await installReadOnlyRequestGuard(context);

  try {
    const results = [];
    for (const contract of contracts) {
      const resolvedDynamicPath = contract.targetPattern
        ? resolvedPaths.get(contract.targetPattern) ?? null
        : null;
      results.push(
        await exerciseReadOnlyNavigation(
          context,
          role,
          contract,
          resolvedDynamicPath,
          readOnlyGuard
        )
      );
    }
    return { results, summary: summarizeActionCoverage(results) };
  } finally {
    await context.close();
  }
}

async function probeRoleAccess(browser, sourceRole, storageState, targetRole, expectation, limit) {
  return limit(async () => {
    const context = await browser.newContext({
      storageState,
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    const readOnlyGuard = await installReadOnlyRequestGuard(context);
    try {
      const targetRoot = ROLE_ACCESS_ROOTS[targetRole];
      const audit = await auditRoute(
        context,
        targetRole,
        'desktop',
        targetRoot,
        targetRoot,
        readOnlyGuard,
        { accessProbe: true }
      );
      const outcome = evaluateAccessProbe(audit.row, expectation);
      return {
        sourceRole,
        targetRole,
        expectation,
        requestedPath: targetRoot,
        finalPathname: audit.row.finalPathname,
        documentStatus: audit.row.documentStatus,
        appReady: audit.row.appReady,
        h1Count: audit.row.h1Count,
        routeErrorFallback: audit.row.routeErrorFallback,
        notFoundFallback: audit.row.notFoundFallback,
        readOnlyCapabilityActive: audit.row.readOnlyCapabilityActive,
        consoleErrorCount: audit.row.consoleErrorCount,
        pageErrorCount: audit.row.pageErrorCount,
        durationMs: audit.row.durationMs,
        targetUsable: outcome.targetUsable,
        denialEvidence: outcome.denialEvidence,
        failureReasons: audit.row.failureReasons,
        abortedDataRequestCount: audit.row.abortedDataRequestCount,
        abortedDataRequests: audit.row.abortedDataRequests,
        ok: outcome.ok,
      };
    } catch (error) {
      return {
        sourceRole,
        targetRole,
        expectation,
        requestedPath: ROLE_ACCESS_ROOTS[targetRole],
        finalPathname: null,
        documentStatus: null,
        appReady: false,
        h1Count: 0,
        routeErrorFallback: false,
        notFoundFallback: false,
        readOnlyCapabilityActive: false,
        consoleErrorCount: 0,
        pageErrorCount: 0,
        durationMs: null,
        targetUsable: false,
        denialEvidence: null,
        failureReasons: ['access_probe_execution_failed'],
        abortedDataRequestCount: 0,
        abortedDataRequests: [],
        ok: false,
        error: sanitizePortalDiagnostic(error?.message ?? String(error)),
      };
    } finally {
      await context.close();
    }
  });
}

function summarize() {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let failedRoles = 0;
  let totalDynamicChecks = 0;
  let passedDynamicChecks = 0;
  let failedDynamicChecks = 0;
  let notApplicableDynamicRoutes = 0;
  let totalRedirectChecks = 0;
  let passedRedirectChecks = 0;
  let failedRedirectChecks = 0;
  let notApplicableRedirectChecks = 0;
  let totalRequiredActions = 0;
  let satisfiedRequiredActions = 0;
  let failedRequiredActions = 0;
  let abortedDataRequestCount = 0;
  for (const role of Object.values(artifact.roles)) {
    if (role.status !== 'passed') failedRoles += 1;
    for (const viewport of Object.values(role.viewports ?? {})) {
      total += viewport.summary.total;
      passed += viewport.summary.passed;
      failed += viewport.summary.failed;
    }
    totalDynamicChecks += role.dynamicRoutes?.length ?? 0;
    passedDynamicChecks += role.dynamicRoutes?.filter((route) => route.status === 'passed').length ?? 0;
    failedDynamicChecks += role.dynamicRoutes?.filter((route) => route.status === 'failed').length ?? 0;
    notApplicableDynamicRoutes +=
      role.dynamicRoutes?.filter((route) => route.status === 'not_applicable').length ?? 0;
    totalRedirectChecks += role.redirectCoverage?.summary.total ?? 0;
    passedRedirectChecks += role.redirectCoverage?.summary.passed ?? 0;
    failedRedirectChecks += role.redirectCoverage?.summary.failed ?? 0;
    notApplicableRedirectChecks += role.redirectCoverage?.summary.notApplicable ?? 0;
    totalRequiredActions += role.actionCoverage?.summary.required ?? 0;
    satisfiedRequiredActions += role.actionCoverage?.summary.satisfiedRequired ?? 0;
    failedRequiredActions += role.actionCoverage?.summary.failedRequired ?? 0;
    for (const viewport of Object.values(role.viewports ?? {})) {
      for (const row of viewport.rows ?? []) {
        abortedDataRequestCount += row.abortedDataRequestCount ?? 0;
      }
    }
    for (const route of role.dynamicRoutes ?? []) {
      abortedDataRequestCount += route.routeCheck?.abortedDataRequestCount ?? 0;
    }
    for (const action of role.actionCoverage?.results ?? []) {
      abortedDataRequestCount += action.abortedDataRequestCount ?? 0;
    }
    for (const redirect of role.redirectCoverage?.results ?? []) {
      abortedDataRequestCount += redirect.abortedDataRequestCount ?? 0;
    }
  }
  for (const probe of artifact.accessMatrix.probes ?? []) {
    abortedDataRequestCount += probe.abortedDataRequestCount ?? 0;
  }
  return {
    totalStaticChecks: total,
    passedStaticChecks: passed,
    failedStaticChecks: failed,
    failedRoles,
    totalAccessProbes: artifact.accessMatrix.summary.total,
    failedAccessProbes: artifact.accessMatrix.summary.failed,
    totalDynamicChecks,
    passedDynamicChecks,
    failedDynamicChecks,
    notApplicableDynamicRoutes,
    totalRedirectChecks,
    passedRedirectChecks,
    failedRedirectChecks,
    notApplicableRedirectChecks,
    totalRequiredActions,
    satisfiedRequiredActions,
    failedRequiredActions,
    vercelToolbarCspDiagnosticCount,
    abortedDataRequestCount,
  };
}

function checkpoint() {
  artifact.summary = summarize();
  writeArtifact();
}

async function run() {
  writeArtifact();

  try {
    const targetValidation = validatePortalAuditTarget({
      baseURL: rawBaseURL,
      mode: rawRequestedMode,
      trustedPreviewOrigin: process.env.PORTAL_AUDIT_TRUSTED_PREVIEW_ORIGIN,
    });
    artifact.targetValidation = {
      ok: targetValidation.ok,
      mode: targetValidation.mode,
      targetClass: targetValidation.targetClass,
      errors: targetValidation.errors,
    };
    artifact.baseURL = targetValidation.origin;
    artifact.executionPolicy.mode = targetValidation.mode;
    if (!targetValidation.ok) {
      artifact.status = 'blocked';
      throw new Error(formatPortalAuditTargetErrors(targetValidation));
    }

    trustedOrigin = targetValidation.origin;
    // Target trust is established. It is now safe to load the capability
    // token and role credentials from the local audit-only environment file.
    loadPortalAuditEnvFile(join(root, '.env.e2e.local'));
    const readOnlyAuditToken = process.env.PORTAL_AUDIT_READ_ONLY_TOKEN?.trim() ?? '';
    if (readOnlyAuditToken.length < 32) {
      artifact.targetValidation.ok = false;
      artifact.targetValidation.errors.push('read_only_audit_token_missing_or_too_short');
      artifact.status = 'blocked';
      throw new Error('read_only_audit_capability_invalid');
    }
    deadlineAt =
      runStartedAt + (targetValidation.mode === 'production_canary' ? 6 * 60_000 : 25 * 60_000);
    artifact.executionPolicy.deadlineMs = deadlineAt - runStartedAt;
    const sections = sectionsToRun(targetValidation.mode);
    const viewports = viewportsForMode(targetValidation.mode);
    artifact.executionPolicy.evidenceScope =
      targetValidation.mode === 'production_canary'
        ? 'production_nonstaff_canary'
        : targetValidation.mode === 'isolated_preview' || sections.length === Object.keys(STATIC_PATHS).length
          ? 'complete_five_role_matrix'
          : 'local_requested_sections';
    artifact.requestedSections = sections;
    artifact.viewports = viewports;

    const inventory = auditPortalRouteInventory({
      appRoot: join(root, 'app'),
      staticPaths: STATIC_PATHS,
      dynamicPaths: DYNAMIC_PATHS,
      redirectOnlyPaths: REDIRECT_ONLY_PATHS,
    });
    artifact.inventory = { ...inventory, status: inventory.ok ? 'passed' : 'failed' };
    checkpoint();

    if (!inventory.ok) {
      console.error(formatPortalRouteInventoryDrift(inventory));
      throw new Error('portal_route_inventory_drift');
    }

    if (process.env.PORTAL_AUDIT_INVENTORY_ONLY === '1') {
      artifact.status = 'partial';
      artifact.fatalError = 'inventory_only_not_release_evidence';
      return;
    }

    // Target trust and the audit capability are established. Resolve credentials.
    const validation = validateDedicatedPortalCredentials(sections, process.env);
    artifact.credentialValidation = {
      ok: validation.ok,
      errors: validation.errors,
      sources: Object.fromEntries(
        sections.map((role) => [role, validation.credentials[role]?.source ?? 'missing'])
      ),
      authenticatedIdentitiesDistinct: null,
    };
    checkpoint();

    if (!validation.ok) {
      artifact.status = 'blocked';
      for (const error of validation.errors) {
        console.error(`${error.role}: ${error.code}; set ${error.required.join(' and ')}`);
      }
      throw new Error('dedicated_portal_credentials_invalid');
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const authByRole = {};
      const loginResults = await mapWithConcurrency(sections, 2, async (role) => {
        console.error(`Authenticating dedicated ${role} account`);
        return [role, await captureRoleStorageState(browser, role, validation.credentials[role])];
      });
      for (const [role, auth] of loginResults) authByRole[role] = auth;

      const identityOwners = new Map();
      const authenticatedIdentityErrors = [];
      for (const role of sections) {
        const identityId = authByRole[role].identityId;
        const previousRole = identityOwners.get(identityId);
        if (previousRole) {
          authenticatedIdentityErrors.push({
            role,
            code: 'authenticated_identity_reused',
            conflictsWith: previousRole,
            required: [],
          });
        } else {
          identityOwners.set(identityId, role);
        }
      }
      artifact.credentialValidation.authenticatedIdentitiesDistinct =
        authenticatedIdentityErrors.length === 0;
      artifact.credentialValidation.errors.push(...authenticatedIdentityErrors);
      artifact.credentialValidation.ok = authenticatedIdentityErrors.length === 0;
      checkpoint();
      if (authenticatedIdentityErrors.length > 0) {
        artifact.status = 'blocked';
        throw new Error('authenticated_portal_identities_are_not_distinct');
      }

      const limit = createLimiter(routeConcurrency);
      const probePromises = [];
      for (const sourceRole of sections) {
        const policy = ROLE_ACCESS_MATRIX[sourceRole];
        for (const targetRole of policy.allowed) {
          probePromises.push(
            probeRoleAccess(
              browser,
              sourceRole,
              authByRole[sourceRole].storageState,
              targetRole,
              'allowed',
              limit
            )
          );
        }
        for (const targetRole of policy.denied) {
          probePromises.push(
            probeRoleAccess(
              browser,
              sourceRole,
              authByRole[sourceRole].storageState,
              targetRole,
              'denied',
              limit
            )
          );
        }
      }
      artifact.accessMatrix.probes = await Promise.all(probePromises);
      const failedProbes = artifact.accessMatrix.probes.filter((probe) => !probe.ok);
      artifact.accessMatrix.summary = {
        total: artifact.accessMatrix.probes.length,
        passed: artifact.accessMatrix.probes.length - failedProbes.length,
        failed: failedProbes.length,
      };
      checkpoint();

      await Promise.all(
        sections.map(async (role) => {
          const paths = routesForRole(role, targetValidation.mode);
          const roleResult = {
            status: 'running',
            loginRedirect: SECTION_LOGIN_REDIRECT[role],
            auth: {
              credentialSource: validation.credentials[role].source,
              storageState: 'captured_in_memory',
              loginFinalPathname: authByRole[role].finalPathname,
              identityVerification: 'server_user_id_distinct',
              blockedPostLoginWriteRequestCount:
                authByRole[role].blockedPostLoginWriteRequestCount,
              blockedPostLoginTelemetryRequestCount:
                authByRole[role].blockedPostLoginTelemetryRequestCount,
              suppressedPostLoginSideEffectRequestCount:
                authByRole[role].suppressedPostLoginSideEffectRequestCount,
            },
            dynamicRoutes: [],
            redirectCoverage: {
              results: [],
              summary: summarizeRedirectCoverage([]),
            },
            actionCoverage: {
              results: [],
              summary: summarizeActionCoverage([]),
            },
            accessProbeFailures: failedProbes.filter((probe) => probe.sourceRole === role).length,
            viewports: {},
            error: null,
          };
          artifact.roles[role] = roleResult;
          checkpoint();

          try {
            console.error(
              `Auditing ${role}: ${paths.length} routes x ${viewports.length} viewport(s)`
            );
            const viewportAudits = await Promise.all(
              viewports.map(async (viewport) => [
                viewport.name,
                await auditViewport(
                  browser,
                  role,
                  authByRole[role].storageState,
                  viewport,
                  paths,
                  limit
                ),
              ])
            );
            roleResult.viewports = Object.fromEntries(
              viewportAudits.map(([name, audit]) => [name, audit.result])
            );
            const initialDynamicCandidates = viewportAudits.flatMap(
              ([, audit]) => audit.discoveredRoutes
            );
            const dynamicCoverage = await auditDynamicRoutes(
              browser,
              role,
              authByRole[role].storageState,
              initialDynamicCandidates,
              targetValidation.mode
            );
            roleResult.dynamicRoutes = dynamicCoverage.results;
            roleResult.redirectCoverage = await auditRedirectOnlyRoutes(
              browser,
              role,
              authByRole[role].storageState,
              authByRole[role].fixtureClaims,
              dynamicCoverage.resolvedPaths,
              targetValidation.mode
            );
            roleResult.actionCoverage = await auditRoleActions(
              browser,
              role,
              authByRole[role].storageState,
              dynamicCoverage.resolvedPaths,
              targetValidation.mode
            );
            roleResult.status =
              roleResult.accessProbeFailures === 0 &&
              roleResult.auth.blockedPostLoginWriteRequestCount === 0 &&
              Object.values(roleResult.viewports).every((entry) => entry.summary.failed === 0) &&
              roleResult.dynamicRoutes.every((entry) => entry.status !== 'failed') &&
              roleResult.redirectCoverage.summary.failed === 0 &&
              roleResult.actionCoverage.summary.failedRequired === 0
                ? 'passed'
                : 'failed';
          } catch (error) {
            roleResult.status = 'failed';
            roleResult.error = sanitizePortalDiagnostic(error?.message ?? String(error));
          } finally {
            checkpoint();
          }
        })
      );
    } finally {
      await browser.close();
    }

    artifact.summary = summarize();
    const allRequiredChecksPassed =
      artifact.summary.failedRoles === 0 &&
      artifact.summary.failedStaticChecks === 0 &&
      artifact.summary.failedAccessProbes === 0 &&
      artifact.summary.failedDynamicChecks === 0 &&
      artifact.summary.failedRedirectChecks === 0 &&
      artifact.summary.failedRequiredActions === 0;
    artifact.status = allRequiredChecksPassed ? 'passed' : 'failed';
    artifact.fatalError = artifact.status === 'passed'
      ? null
      : 'portal_audit_checks_failed';
  } catch (error) {
    if (artifact.status !== 'blocked') artifact.status = 'failed';
    artifact.fatalError = sanitizePortalDiagnostic(error?.message ?? String(error));
    console.error(artifact.fatalError);
  } finally {
    artifact.completedAt = new Date().toISOString();
    artifact.summary = summarize();
    writeArtifact();
    console.log(`Wrote ${outputPath}`);
    console.log(JSON.stringify(artifact.summary));
    if (artifact.status !== 'passed') process.exitCode = 1;
  }
}

await run();
