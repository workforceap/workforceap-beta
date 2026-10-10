import {
  dataRequestQuietWindowSatisfied,
  isAllowedReadOnlyNonGetRequest,
  isBlockedAuditTelemetryRequest,
  isVerifiedDeniedRedirectWithCanceledGets,
} from './portal-audit-actions.mjs';
import { sanitizeAuditDiagnostic, sanitizeAuditUrl } from './portal-audit-browser.mjs';
import { classifyPortalAuditRow } from './portal-audit-classify.mjs';
import {
  isAbortedReadRequest,
  isVerifiedReadOnlyDestination,
  requestFailureCategory,
  sanitizedRequestPath,
} from './portal-audit-environment.mjs';
import {
  applicationConsoleErrors,
  isExpectedGatedApiBody,
  isGatedApiResponseCandidate,
} from './portal-audit-gated-api.mjs';
import { recordPendingDataRequestTimeout } from './portal-audit-pending.mjs';

const boundedDiagnosticPush = (list, diagnostic) => {
  if (list.length < 10) list.push(diagnostic);
};

function isSameOriginDataRequest(request, trustedOrigin) {
  const type = request.resourceType();
  if (type !== 'fetch' && type !== 'xhr') return false;
  try {
    return new URL(request.url()).origin === trustedOrigin;
  } catch {
    return false;
  }
}

function failedSameOriginDataResponse(response, trustedOrigin, dynamicPatterns) {
  const type = response.request().resourceType();
  if ((type !== 'fetch' && type !== 'xhr') || response.status() < 400) return null;
  try {
    if (new URL(response.url()).origin !== trustedOrigin) return null;
  } catch {
    return `Same-origin data request returned HTTP ${response.status()}`;
  }
  return `Same-origin data request returned HTTP ${response.status()} at ${sanitizeAuditUrl(
    response.url(), dynamicPatterns
  )}`;
}

function failedSameOriginDataRequest(request, trustedOrigin, dynamicPatterns) {
  if (!isSameOriginDataRequest(request, trustedOrigin)) return null;
  const url = new URL(request.url());
  const method = request.method().toUpperCase();
  if (isBlockedAuditTelemetryRequest(method, url.pathname)) return null;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' &&
      !isAllowedReadOnlyNonGetRequest(method, url.pathname)) return null;
  const category = requestFailureCategory(request.failure()?.errorText);
  const headers = request.headers();
  return {
    message: `Same-origin data request failed (${category}) at ${sanitizeAuditUrl(
      request.url(), dynamicPatterns
    )}`,
    category,
    method,
    resourceType: request.resourceType(),
    path: sanitizedRequestPath(request.url(), dynamicPatterns),
    prefetch: 'next-router-prefetch' in headers ||
      /\bprefetch\b/i.test(headers.purpose ?? '') ||
      /\bprefetch\b/i.test(headers['sec-purpose'] ?? ''),
    rsc: headers.rsc === '1' || url.searchParams.has('_rsc'),
  };
}

/** The runner's real Playwright collector; gate bodies and resource URLs are never persisted. */
export function trackSameOriginDataRequests(page, { trustedOrigin, dynamicPatterns = [] }) {
  const inFlight = new Set();
  const errors = [];
  const pendingResponseChecks = new Set();
  const gatedResponsesByUrl = new Map();
  const consoleDiagnostics = [];
  const abortedErrors = [];
  const abortedDataRequests = [];
  let abortedDataRequestCount = 0;
  const pendingDataRequests = [];
  let pendingDataRequestCount = 0;
  let lastActivityAt = Date.now();

  const handleRequest = (request) => {
    if (!isSameOriginDataRequest(request, trustedOrigin)) return;
    inFlight.add(request);
    lastActivityAt = Date.now();
  };
  const handleResponse = (response) => {
    const error = failedSameOriginDataResponse(response, trustedOrigin, dynamicPatterns);
    if (!error) return;
    if (!isGatedApiResponseCandidate({ status: response.status(), url: response.url() })) {
      errors.push(error);
      return;
    }
    const state = gatedResponsesByUrl.get(response.url()) ?? { expected: 0, failed: 0, pending: 0 };
    gatedResponsesByUrl.set(response.url(), state);
    state.pending += 1;
    lastActivityAt = Date.now();
    const check = {
      error,
      settle(expected) {
        // A late body cannot erase a timeout failure or excuse its console error.
        if (!pendingResponseChecks.delete(check)) return;
        state.pending -= 1;
        state[expected ? 'expected' : 'failed'] += 1;
        if (!expected) errors.push(error);
        lastActivityAt = Date.now();
      },
    };
    pendingResponseChecks.add(check);
    Promise.resolve().then(() => response.text())
      .then((body) => check.settle(isExpectedGatedApiBody(body)), () => check.settle(false));
  };
  const handleRequestFinished = (request) => {
    if (!inFlight.delete(request)) return;
    lastActivityAt = Date.now();
  };
  const handleRequestFailed = (request) => {
    if (inFlight.delete(request)) lastActivityAt = Date.now();
    const failure = failedSameOriginDataRequest(request, trustedOrigin, dynamicPatterns);
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
    get errors() {
      // A late response can arrive during DOM inspection after settlement.
      // Until its body is verified, every classification must remain strict.
      return [...errors, ...[...pendingResponseChecks].map(({ error }) => error)];
    },
    abortedErrors,
    abortedDataRequests,
    pendingDataRequests,
    recordConsoleError(message) {
      if (message.type() !== 'error') return;
      // Retain the concrete location only until classification, never in an artifact.
      consoleDiagnostics.push({
        text: message.text(),
        url: message.location()?.url ?? '',
        argumentCount: message.args?.().length ?? null,
      });
    },
    get consoleErrors() {
      return applicationConsoleErrors(consoleDiagnostics, gatedResponsesByUrl);
    },
    get abortedDataRequestCount() {
      return abortedDataRequestCount;
    },
    get pendingDataRequestCount() {
      return pendingDataRequestCount;
    },
    async waitForSettlement(timeoutMs) {
      const boundedTimeout = Math.max(1, Math.min(timeoutMs, 5_000));
      const waitStartedAt = Date.now();
      const settleDeadline = waitStartedAt + boundedTimeout;
      const quietWindowMs = 300;
      while (Date.now() < settleDeadline) {
        if (dataRequestQuietWindowSatisfied({
          inFlightCount: inFlight.size + pendingResponseChecks.size,
          lastActivityAt,
          waitStartedAt,
          now: Date.now(),
          quietWindowMs,
        })) return;
        await page.waitForTimeout(Math.min(50, Math.max(1, settleDeadline - Date.now())));
      }
      // response.text() can wait on an unfinished body. Keep the same bounded
      // settlement deadline and fail closed instead of awaiting it indefinitely.
      for (const check of [...pendingResponseChecks]) check.settle(false);
      const pending = recordPendingDataRequestTimeout(inFlight, errors, boundedTimeout, trustedOrigin);
      if (pending) {
        pendingDataRequestCount = pending.count;
        pendingDataRequests.splice(0, pendingDataRequests.length, ...pending.requests);
      }
    },
    detach() {
      page.off('request', handleRequest);
      page.off('response', handleResponse);
      page.off('requestfinished', handleRequestFinished);
      page.off('requestfailed', handleRequestFailed);
      for (const check of [...pendingResponseChecks]) check.settle(false);
      gatedResponsesByUrl.clear();
      consoleDiagnostics.length = 0;
    },
  };
}

/** Preserve cancellation evidence unless the actual collected destination is healthy. */
export function classifyCollectedPortalAuditRow(rowInput, dataRequests, options = {}) {
  const uniqueDiagnostics = (values) => [...new Set(values
    .map((value) => sanitizeAuditDiagnostic(value, options.dynamicPatterns ?? []))
    .filter(Boolean))].slice(0, 20);
  const collectedInput = {
    ...rowInput,
    consoleErrors: uniqueDiagnostics([...(rowInput.consoleErrors ?? []), ...dataRequests.consoleErrors]),
    pageErrors: uniqueDiagnostics([...(rowInput.pageErrors ?? []), ...dataRequests.errors]),
    abortedDataRequestCount: dataRequests.abortedDataRequestCount,
    abortedDataRequests: dataRequests.abortedDataRequests,
    pendingDataRequestCount: dataRequests.pendingDataRequestCount,
    pendingDataRequests: dataRequests.pendingDataRequests,
  };
  const candidateRow = classifyPortalAuditRow(collectedInput);
  const exactDestinationVerified = isVerifiedReadOnlyDestination({
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
  const deniedRedirectVerified = isVerifiedDeniedRedirectWithCanceledGets(
    candidateRow, options.accessExpectation, options.accessSourceHome
  );
  return dataRequests.abortedDataRequestCount === 0 || exactDestinationVerified || deniedRedirectVerified
    ? candidateRow
    : classifyPortalAuditRow({
        ...collectedInput,
        pageErrors: uniqueDiagnostics([...collectedInput.pageErrors, ...dataRequests.abortedErrors]),
      });
}
