import {
  DYNAMIC_PATHS,
  REDIRECT_ONLY_PATHS,
  STATIC_PATHS,
} from './portal-audit-paths.mjs';
import { canonicalPathname } from './portal-audit-classify.mjs';

const UNKNOWN_ROUTE = '[unmatched-route]';
const ROUTE_ORIGIN = 'https://portal-audit.invalid';
const PHASES = new Set(['init', 'mutation', 'domcontentloaded', 'react-error']);
const TAGS = new Set([
  'a', 'article', 'aside', 'body', 'button', 'dialog', 'div', 'fieldset',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header',
  'html', 'iframe', 'img', 'input', 'label', 'li', 'link', 'main', 'meta',
  'nav', 'noscript', 'ol', 'p', 'script', 'section', 'span', 'style', 'svg',
  'table', 'tbody', 'td', 'textarea', 'th', 'thead', 'title', 'tr', 'ul',
]);

function manifestPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  try {
    return canonicalPathname(new URL(value, ROUTE_ORIGIN).pathname);
  } catch {
    return null;
  }
}

const routeTemplates = [
  ...Object.values(STATIC_PATHS).flat(),
  ...Object.values(DYNAMIC_PATHS).flat(),
  ...Object.values(REDIRECT_ONLY_PATHS).flatMap((entries) =>
    entries.flatMap(({ path, target }) => [path, target])),
].map(manifestPath).filter(Boolean);
const staticRoutes = new Set(routeTemplates.filter((path) => !path.includes('[')));
const dynamicRoutes = [...new Set(routeTemplates.filter((path) => path.includes('[')))]
  .sort((left, right) => {
    const specificity = (path) => path.split('/').filter((part) => part && !part.startsWith('[')).length;
    return specificity(right) - specificity(left) || right.length - left.length;
  });

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

/** Only checked-in templates may reach the CI log; unknown short IDs stay hidden. */
export function safeHydrationRoute(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return UNKNOWN_ROUTE;
  }
  try {
    const url = new URL(value, ROUTE_ORIGIN);
    if (url.origin !== ROUTE_ORIGIN) return UNKNOWN_ROUTE;
    const path = canonicalPathname(url.pathname.replace(/\/$/, '') || '/');
    if (staticRoutes.has(path)) return path;
    return dynamicRoutes.find((template) => matchesTemplate(path, template)) ?? UNKNOWN_ROUTE;
  } catch {
    return UNKNOWN_ROUTE;
  }
}

function boundedCount(value, max, min = 0) {
  return Number.isSafeInteger(value) && value >= min ? Math.min(value, max) : null;
}

function safeTags(value, limit) {
  return Array.isArray(value)
    ? value.slice(0, limit).map((tag) => TAGS.has(tag) ? tag : 'unknown')
    : [];
}

function safeSample(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    phase: PHASES.has(value.phase) ? value.phase : 'unknown',
    bodyTags: safeTags(value.bodyTags, 16),
    bodyChildCount: boundedCount(value.bodyChildCount, 10_000),
    mainCount: boundedCount(value.mainCount, 10_000),
    mainBodyIndex: boundedCount(value.mainBodyIndex, 10_000, -1),
    mainTags: safeTags(value.mainTags, 8),
    mainChildCount: boundedCount(value.mainChildCount, 10_000),
    portalTouchFirst: typeof value.portalTouchFirst === 'boolean' ? value.portalTouchFirst : null,
    shellCount: boundedCount(value.shellCount, 10_000),
    shellTags: safeTags(value.shellTags, 8),
    shellChildCount: boundedCount(value.shellChildCount, 10_000),
  };
}

function safeSamples(value, limit, recent = false) {
  if (!Array.isArray(value)) return [];
  return (recent ? value.slice(-limit) : value.slice(0, limit))
    .map(safeSample).filter(Boolean);
}

function safeNavDecision(trace, prefix, decisionKey, sourceSuffix) {
  const pathname = trace[`${prefix}Pathname`];
  const nullPath = trace[`${prefix}NullPath`];
  const decision = trace[`${prefix}${sourceSuffix}`];
  if (pathname === undefined && nullPath === undefined && decision === undefined) return null;
  return {
    pathname: safeHydrationRoute(pathname),
    nullPath: typeof nullPath === 'boolean' ? nullPath : null,
    [decisionKey]: typeof decision === 'boolean' ? decision : null,
  };
}

/** Rebuild the browser-owned trace from approved primitives before JSON logging. */
export function sanitizePortalHydrationTrace(trace, { role, viewport, artifactPath }) {
  if (!trace || typeof trace !== 'object' || Array.isArray(trace) ||
      trace.auditTraceVersion !== 1) return null;
  return {
    role: Object.hasOwn(STATIC_PATHS, role) ? role : 'unknown',
    viewport: viewport === 'desktop' || viewport === 'mobile' ? viewport : 'unknown',
    path: safeHydrationRoute(artifactPath),
    initialPathname: safeHydrationRoute(trace.initialPathname),
    errorPathname: safeHydrationRoute(trace.errorPathname),
    firstShellPathname: safeHydrationRoute(trace.firstShellPathname),
    lastShellPathname: safeHydrationRoute(trace.lastShellPathname),
    firstMarketingNav: safeNavDecision(trace, 'firstMarketingNav', 'hidden', 'Hidden'),
    lastMarketingNav: safeNavDecision(trace, 'lastMarketingNav', 'hidden', 'Hidden'),
    firstPortalShell: safeNavDecision(trace, 'firstPortalShell', 'showNav', 'ShowNav'),
    lastPortalShell: safeNavDecision(trace, 'lastPortalShell', 'showNav', 'ShowNav'),
    first: safeSamples(trace.first, 4),
    recent: safeSamples(trace.recent, 16, true),
    atError: safeSample(trace.atError),
  };
}
