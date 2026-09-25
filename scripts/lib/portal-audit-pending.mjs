import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizedRequestPath } from './portal-audit-environment.mjs';
import { safeHydrationRoute } from './portal-hydration-log.mjs';

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/api');
const ROUTE_FILE = /^route\.(?:js|jsx|ts|tsx)$/;
const METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);
let apiTemplates;

function discoverApiTemplates() {
  const paths = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && ROUTE_FILE.test(entry.name)) {
        const segments = relative(API_ROOT, dirname(absolute)).split(sep)
          .filter((segment) => segment && segment !== '.' && !/^\(.+\)$/.test(segment));
        paths.push(`/api${segments.length ? `/${segments.join('/')}` : ''}`);
      }
    }
  }
  walk(API_ROOT);
  return [...new Set(paths)].sort((left, right) => {
    const specificity = (path) => path.split('/').filter((segment) => segment && !segment.startsWith('[')).length;
    return specificity(right) - specificity(left) || right.length - left.length;
  });
}

function matchesTemplate(path, template) {
  const parts = path.split('/').filter(Boolean);
  const templateParts = template.split('/').filter(Boolean);
  let index = 0;
  for (const part of templateParts) {
    if (/^\[\[\.\.\.[^\]]+\]\]$/.test(part)) return true;
    if (/^\[\.\.\.[^\]]+\]$/.test(part)) return index < parts.length;
    if (index >= parts.length) return false;
    if (!/^\[[^\]]+\]$/.test(part) && part !== parts[index]) return false;
    index += 1;
  }
  return index === parts.length;
}

/** Emit only checked-in route templates or the existing coarse redacted path. */
export function safePendingRequestPath(value, trustedOrigin) {
  try {
    const url = new URL(value);
    if (url.origin !== trustedOrigin) return '/[redacted]';
    const portalRoute = safeHydrationRoute(url.pathname);
    if (portalRoute !== '[unmatched-route]') {
      return portalRoute.length <= 240 ? portalRoute : '/[redacted]';
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        apiTemplates ??= discoverApiTemplates();
        const match = apiTemplates.find((template) => matchesTemplate(url.pathname, template));
        if (match) return match.length <= 240 ? match : '/api/[redacted]';
      } catch {
        // Missing source inventory cannot turn an audit timeout into a runner failure.
      }
    }
    return sanitizedRequestPath(value);
  } catch {
    return '/[invalid-url]';
  }
}

/** Snapshot in-flight fetch/XHR requests at a settlement timeout, never their headers or query. */
export function snapshotPendingDataRequests(inFlight, trustedOrigin) {
  const requests = [];
  for (const request of inFlight) {
    if (requests.length >= 10) break;
    let url;
    let resourceType;
    try {
      url = request.url();
      resourceType = request.resourceType();
      if (new URL(url).origin !== trustedOrigin ||
          (resourceType !== 'fetch' && resourceType !== 'xhr')) continue;
    } catch {
      continue;
    }
    let headers = {};
    try {
      const candidate = request.headers();
      if (candidate && typeof candidate === 'object') headers = candidate;
    } catch { /* Header values are never persisted. */ }
    let hasRscQuery = false;
    try { hasRscQuery = new URL(url).searchParams.has('_rsc'); } catch { /* Invalid URL stays redacted. */ }
    let method = 'OTHER';
    try {
      const candidate = request.method().toUpperCase();
      if (METHODS.has(candidate)) method = candidate;
    } catch { /* Keep the fixed fallback. */ }
    const purpose = typeof headers.purpose === 'string' ? headers.purpose : '';
    const secPurpose = typeof headers['sec-purpose'] === 'string' ? headers['sec-purpose'] : '';
    requests.push({
      method,
      path: safePendingRequestPath(url, trustedOrigin),
      resourceType,
      prefetch: 'next-router-prefetch' in headers ||
        /\bprefetch\b/i.test(purpose) ||
        /\bprefetch\b/i.test(secPurpose),
      rsc: headers.rsc === '1' || hasRscQuery,
    });
  }
  return { count: inFlight.size, requests };
}

/** Preserve the existing failure message while attaching a bounded diagnostic snapshot. */
export function recordPendingDataRequestTimeout(inFlight, errors, timeoutMs, trustedOrigin) {
  if (inFlight.size === 0) return null;
  errors.push(`Same-origin data requests did not settle within ${timeoutMs}ms (${inFlight.size} pending)`);
  try {
    return snapshotPendingDataRequests(inFlight, trustedOrigin);
  } catch {
    // Diagnostic collection must not replace the existing timeout verdict.
    return { count: inFlight.size, requests: [] };
  }
}
