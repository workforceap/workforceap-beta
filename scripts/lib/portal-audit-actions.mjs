/**
 * Pure helpers for the authenticated portal audit's read-only discovery and
 * navigation contracts. Runtime identifiers stay in memory; callers must only
 * persist the checked-in route pattern.
 */

function parsePath(value) {
  try {
    const url = new URL(String(value ?? ''), 'https://portal-audit.invalid');
    if (url.origin !== 'https://portal-audit.invalid') return null;
    return {
      pathname: url.pathname.replace(/\/$/, '') || '/',
      pathWithSearch: `${url.pathname.replace(/\/$/, '') || '/'}${url.search}`,
    };
  } catch {
    return null;
  }
}

function routeSegments(value) {
  const parsed = parsePath(value);
  return parsed ? parsed.pathname.split('/').filter(Boolean) : [];
}

function isSingleDynamicSegment(segment) {
  return /^\[[^.[\]]+\]$/.test(segment);
}

function isCatchAllSegment(segment) {
  return /^\[\.\.\.[^\]]+\]$/.test(segment);
}

function isOptionalCatchAllSegment(segment) {
  return /^\[\[\.\.\.[^\]]+\]\]$/.test(segment);
}

/** Match a concrete pathname to a Next.js App Router dynamic pattern. */
export function dynamicRoutePatternMatches(pattern, concretePath) {
  const patternSegments = routeSegments(pattern);
  const pathSegments = routeSegments(concretePath);
  let pathIndex = 0;

  for (let patternIndex = 0; patternIndex < patternSegments.length; patternIndex += 1) {
    const segment = patternSegments[patternIndex];
    if (isOptionalCatchAllSegment(segment)) {
      return patternIndex === patternSegments.length - 1;
    }
    if (isCatchAllSegment(segment)) {
      return patternIndex === patternSegments.length - 1 && pathIndex < pathSegments.length;
    }
    if (pathIndex >= pathSegments.length) return false;
    if (!isSingleDynamicSegment(segment) && segment !== pathSegments[pathIndex]) return false;
    pathIndex += 1;
  }

  return pathIndex === pathSegments.length;
}

function patternSpecificity(pattern) {
  const segments = routeSegments(pattern);
  const literalSegments = segments.filter(
    (segment) =>
      !isSingleDynamicSegment(segment) &&
      !isCatchAllSegment(segment) &&
      !isOptionalCatchAllSegment(segment)
  ).length;
  const catchAllSegments = segments.filter(
    (segment) => isCatchAllSegment(segment) || isOptionalCatchAllSegment(segment)
  ).length;
  return literalSegments * 100 + segments.length * 10 - catchAllSegments;
}

/**
 * Resolve visible, same-origin anchor paths to their most-specific dynamic
 * route pattern. Checked-in static paths are excluded so `/employer/jobs/new`
 * can never masquerade as `/employer/jobs/[id]`.
 * @param {{
 *   hrefPaths?: string[],
 *   patterns?: string[],
 *   excludedPaths?: string[],
 *   sourcePath?: string | null,
 *   sourceArtifactPath?: string | null,
 * }} args
 */
export function resolveDynamicRouteCandidates({
  hrefPaths,
  patterns,
  excludedPaths = [],
  sourcePath = null,
  sourceArtifactPath = null,
}) {
  const excluded = new Set(
    excludedPaths.map((value) => parsePath(value)?.pathname).filter(Boolean)
  );
  const seen = new Set();
  const candidates = [];

  for (const hrefPath of hrefPaths ?? []) {
    const parsed = parsePath(hrefPath);
    if (!parsed || excluded.has(parsed.pathname) || parsed.pathname.includes('[')) continue;
    const matches = (patterns ?? [])
      .filter((pattern) => dynamicRoutePatternMatches(pattern, parsed.pathname))
      .sort((left, right) => patternSpecificity(right) - patternSpecificity(left));
    const pattern = matches[0];
    if (!pattern) continue;
    const key = `${pattern}\u0000${parsed.pathWithSearch}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      pattern,
      path: parsed.pathWithSearch,
      sourcePath,
      sourceArtifactPath: sourceArtifactPath ?? sourcePath,
    });
  }

  return candidates;
}

/**
 * @param {string} actualPath
 * @param {{ targetPath?: string, targetPattern?: string }} contract
 * @param {string | null} [resolvedDynamicPath]
 */
export function navigationTargetMatches(actualPath, contract, resolvedDynamicPath = null) {
  const actual = parsePath(actualPath);
  if (!actual) return false;
  if (contract.targetPath) {
    const target = parsePath(contract.targetPath);
    return Boolean(target && actual.pathWithSearch === target.pathWithSearch);
  }
  if (!contract.targetPattern || !resolvedDynamicPath) return false;
  const resolved = parsePath(resolvedDynamicPath);
  return Boolean(
    resolved &&
      actual.pathWithSearch === resolved.pathWithSearch &&
      dynamicRoutePatternMatches(contract.targetPattern, actual.pathname)
  );
}

function dynamicTemplateParts(pathname) {
  return String(pathname).split('/').filter(Boolean);
}

/** Resolve a redirect-only template using the already-audited target fixture. */
export function resolveRedirectAuditEntry(entry, resolvedPaths = new Map()) {
  if (!entry?.path || !entry?.target) return null;
  const hasDynamicSource = entry.path.includes('[');
  const hasDynamicTarget = entry.target.includes('[');
  if (!hasDynamicSource && !hasDynamicTarget) {
    return { sourcePath: entry.path, targetPath: entry.target };
  }

  const concreteTarget = resolvedPaths.get(entry.target);
  if (!concreteTarget) return null;
  const targetUrl = new URL(concreteTarget, 'https://audit.invalid');
  const templateParts = dynamicTemplateParts(entry.target);
  const concreteParts = dynamicTemplateParts(targetUrl.pathname);
  if (templateParts.length !== concreteParts.length) return null;

  const values = new Map();
  for (let index = 0; index < templateParts.length; index += 1) {
    const match = templateParts[index].match(/^\[([^\]]+)\]$/);
    if (match) values.set(match[1], concreteParts[index]);
  }
  const fallbackValues = [...values.values()];
  let fallbackIndex = 0;
  const sourcePathname = dynamicTemplateParts(entry.path)
    .map((part) => {
      const match = part.match(/^\[([^\]]+)\]$/);
      if (!match) return part;
      const value = values.get(match[1]) ?? fallbackValues[fallbackIndex];
      fallbackIndex += 1;
      return value ?? part;
    })
    .join('/');
  if (sourcePathname.includes('[')) return null;

  return {
    sourcePath: `/${sourcePathname}`,
    targetPath: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
  };
}

function sortedSearchEntries(url) {
  return [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) =>
    aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
  );
}

function canonicalAuditPathname(pathname) {
  const parts = String(pathname).split('/').filter(Boolean);
  if (parts.length > 0 && /^[a-z]{2}$/i.test(parts[0])) parts.shift();
  return `/${parts.join('/')}` || '/';
}

/** Exact-origin, canonical-path, query, and fragment match for redirect aliases. */
export function redirectTargetMatches(finalUrl, expectedTarget, trustedOrigin) {
  try {
    const final = new URL(finalUrl);
    const expected = new URL(expectedTarget, `${trustedOrigin}/`);
    return (
      final.origin === trustedOrigin &&
      canonicalAuditPathname(final.pathname) === canonicalAuditPathname(expected.pathname) &&
      JSON.stringify(sortedSearchEntries(final)) === JSON.stringify(sortedSearchEntries(expected)) &&
      final.hash === expected.hash
    );
  } catch {
    return false;
  }
}

/** The checked-in redirect gate must match the identity used by this audit. */
export function fixtureConditionMatches(condition, role, claims) {
  if (!condition) return true;
  if (condition === 'regular_admin') {
    return role === 'admin' && claims?.role === 'admin' && claims?.superAdmin === false;
  }
  if (condition === 'member_without_mentor') {
    // The exact /mentor/apply redirect below proves this member has no mentor
    // record because the source page redirects there only after that lookup.
    return role === 'member' && claims?.role === 'member' && claims?.superAdmin === false;
  }
  if (condition === 'member_without_active_program_slug') {
    // Both program subpages redirect to My Program when the fixture has no
    // active program slug. The exact redirect proves that source guard ran.
    return role === 'member' && claims?.role === 'member' && claims?.superAdmin === false;
  }
  return false;
}

/** A fixture-gated redirect passes only when its destination is a healthy read. */
export function conditionalRedirectFailureReasons({
  finalUrl,
  expectedTarget,
  trustedOrigin,
  documentStatus,
  inspection,
  consoleErrorCount = 0,
  pageErrorCount = 0,
  dataErrorCount = 0,
  abortedDataRequestCount = 0,
  blockedWriteRequestCount = 0,
}) {
  const failures = [];
  if (!redirectTargetMatches(finalUrl, expectedTarget, trustedOrigin)) {
    failures.push('redirect_target_mismatch');
  }
  if (documentStatus !== 200) failures.push('conditional_redirect_document_not_200');
  if (inspection?.readOnlyCapabilityActive !== true) {
    failures.push('read_only_audit_capability_not_active');
  }
  if (inspection?.appReady !== true || inspection?.h1Count !== 1) {
    failures.push('conditional_redirect_destination_not_ready');
  }
  if (inspection?.errorFallbackDetected === true || (inspection?.errorFallbackStates?.length ?? 0) > 0) {
    failures.push('route_error_fallback');
  }
  const bodyText = String(inspection?.bodyText ?? '').toLowerCase();
  if (bodyText.includes('page not found') || bodyText.includes('the page you’re looking for')) {
    failures.push('not_found_fallback');
  }
  if (bodyText.includes('hit an unexpected error') || bodyText.includes('something went wrong')) {
    failures.push('route_error_fallback');
  }
  if (consoleErrorCount > 0) failures.push('console_errors');
  if (pageErrorCount > 0) failures.push('page_errors');
  if (dataErrorCount > 0 || abortedDataRequestCount > 0) {
    failures.push('same_origin_data_request_failed');
  }
  if (blockedWriteRequestCount > 0) failures.push('non_get_request_blocked');
  return [...new Set(failures)];
}

export function summarizeRedirectCoverage(results) {
  const rows = results ?? [];
  return {
    total: rows.length,
    passed: rows.filter((row) => row.status === 'passed').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    notApplicable: rows.filter((row) => row.status === 'not_applicable').length,
  };
}

/**
 * Missing redirect fixtures inherit the target dynamic route's requirement.
 * An optional (`when_discoverable`) fixture is honest non-coverage, not a
 * release failure; a required fixture remains fail-closed.
 */
export function missingRedirectFixtureOutcome(requirement) {
  if (requirement === 'when_discoverable') {
    return {
      status: 'not_applicable',
      resultReason: 'no_safe_visible_fixture',
      failureReasons: [],
    };
  }
  return {
    status: 'failed',
    resultReason: 'missing_dynamic_redirect_fixture',
    failureReasons: ['missing_dynamic_redirect_fixture'],
  };
}

export function summarizeActionCoverage(results) {
  const required = (results ?? []).filter(
    (result) => result.required || result.requiredWhenApplicable
  );
  const satisfiedRequired = required.filter(
    (result) =>
      result.status === 'passed' ||
      (result.requiredWhenApplicable &&
        result.status === 'not_applicable' &&
        result.reason === 'declared_empty_state_verified')
  ).length;
  return {
    total: results?.length ?? 0,
    passed: (results ?? []).filter((result) => result.status === 'passed').length,
    failed: (results ?? []).filter((result) => result.status === 'failed').length,
    notApplicable: (results ?? []).filter((result) => result.status === 'not_applicable').length,
    required: required.length,
    satisfiedRequired,
    failedRequired: required.length - satisfiedRequired,
  };
}

/** A read-only audit can never pass if the exercised page attempted a write. */
export function applyBlockedWriteFailure(result, blockedWriteRequestCount) {
  result.blockedWriteRequestCount = Math.max(0, blockedWriteRequestCount);
  if (result.blockedWriteRequestCount === 0) return result;

  result.failureReasons = [
    ...new Set([...(result.failureReasons ?? []), 'non_get_request_blocked']),
  ];
  result.status = 'failed';
  result.reason = 'write_request_blocked';
  return result;
}

/**
 * These POST endpoints render existing resume documents and do not write app
 * state. Every other non-GET request remains blocked by the audit runtime.
 */
export function isAllowedReadOnlyNonGetRequest(method, pathname, options = {}) {
  if (String(method).toUpperCase() !== 'POST') return false;
  const path = String(pathname ?? '').replace(/\/$/, '') || '/';
  return (
    (options.allowAuthentication === true && path === '/api/auth/login') ||
    path === '/api/member/resume/docx-html' ||
    /^\/api\/counselor\/members\/[^/]+\/resume\/docx-html$/.test(path)
  );
}

/** Expected mount telemetry is blocked, counted, and never written by the audit. */
export function isBlockedAuditTelemetryRequest(method, pathname) {
  return (
    String(method).toUpperCase() === 'POST' &&
    String(pathname ?? '').replace(/\/$/, '') === '/api/events'
  );
}

/**
 * Exact mount-time GETs whose implementations consume mutable infrastructure
 * even though the HTTP verb is safe. The audit fulfills these locally so it
 * cannot consume production rate-limit state. Product data is never returned
 * by this exception.
 */
export function isSuppressedAuditSideEffectGetRequest(method, pathname) {
  return (
    String(method).toUpperCase() === 'GET' &&
    String(pathname ?? '').replace(/\/$/, '') === '/api/auth/check-mfa-required'
  );
}

/**
 * Decide how the browser guard handles a request. Read-only POST exceptions are
 * valid only on the exact origin that passed target validation; an external
 * URL with the same pathname is always blocked.
 */
export function classifyReadOnlyAuditRequest(method, requestUrl, trustedOrigin, options = {}) {
  const normalizedMethod = String(method).toUpperCase();

  let parsed;
  try {
    parsed = new URL(String(requestUrl));
  } catch {
    return normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS'
      ? 'continue'
      : 'block';
  }
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') {
    if (
      parsed.origin === trustedOrigin &&
      isSuppressedAuditSideEffectGetRequest(normalizedMethod, parsed.pathname)
    ) {
      return 'suppress_side_effect_get';
    }
    return 'continue';
  }

  if (parsed.origin !== trustedOrigin) return 'block';
  if (isBlockedAuditTelemetryRequest(normalizedMethod, parsed.pathname)) {
    return 'suppress_telemetry';
  }
  return isAllowedReadOnlyNonGetRequest(normalizedMethod, parsed.pathname, options)
    ? 'continue'
    : 'block';
}

/** Keep a fresh quiet baseline for each settlement wait, then extend it on activity. */
export function dataRequestQuietWindowSatisfied({
  inFlightCount,
  lastActivityAt,
  waitStartedAt,
  now,
  quietWindowMs = 300,
}) {
  return (
    inFlightCount === 0 &&
    now - Math.max(waitStartedAt, lastActivityAt) >= quietWindowMs
  );
}

/** Require positive authorization-denial evidence; a broken target is not a denial. */
export function evaluateAccessProbe(row, expectation) {
  const targetUsable = row?.ok === true;
  if (expectation === 'allowed') {
    return { ok: targetUsable, targetUsable, denialEvidence: null };
  }

  const status = Number.isFinite(row?.documentStatus) ? row.documentStatus : null;
  const deniedStatus = status === 401 || status === 403;
  const deniedRedirect = Boolean(row?.stuckLogin || row?.wrongRoleRedirect);
  const publicPortalTarget = row?.requestedPathname === '/employer' || row?.requestedPathname === '/partner';
  const exactPublicLanding =
    status === 200 &&
    row?.originMatched === true &&
    row?.wrongRoleRedirect === true &&
    row?.unexpectedRedirect === true &&
    ((row?.requestedPathname === '/employer' && row?.finalPathname === '/employers') ||
      (row?.requestedPathname === '/partner' && row?.finalPathname === '/partners'));
  const denialEvidence = deniedStatus
    ? `http_${status}`
    : exactPublicLanding
      ? 'exact_public_access_landing'
      : deniedRedirect && !publicPortalTarget
        ? 'safe_redirect_outside_target'
        : null;
  const allowedFailures = new Set(
    deniedStatus
      ? ['document_error_status', 'app_not_ready', 'missing_h1']
      : exactPublicLanding
        ? [
            'wrong_role_redirect',
            'unexpected_redirect',
            'read_only_audit_capability_not_active',
            'app_not_ready',
            'missing_h1',
          ]
      : ['login_redirect', 'wrong_role_redirect', 'unexpected_redirect']
  );
  const unexpectedFailures = (row?.failureReasons ?? []).filter(
    (reason) => !allowedFailures.has(reason)
  );

  return {
    ok: !targetUsable && Boolean(denialEvidence) && unexpectedFailures.length === 0,
    targetUsable,
    denialEvidence,
  };
}
