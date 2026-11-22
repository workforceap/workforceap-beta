import { readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export const PORTAL_ROLE_PREFIXES = Object.freeze({
  member: 'dashboard',
  admin: 'admin',
  employer: 'employer',
  partner: 'partner',
  counselor: 'counselor',
});

const PAGE_FILE_PATTERN = /^page\.(?:js|jsx|ts|tsx)$/;

function isRouteGroup(segment) {
  return /^\(.+\)$/.test(segment);
}

function isIgnoredSegment(segment) {
  return isRouteGroup(segment) || segment.startsWith('@') || segment.startsWith('_');
}

function normalizedRoute(pathname) {
  const withoutQuery = String(pathname ?? '').split(/[?#]/, 1)[0] || '/';
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : '/';
}

function sectionForRoute(route) {
  const firstSegment = normalizedRoute(route).split('/').filter(Boolean)[0] ?? '';
  return Object.entries(PORTAL_ROLE_PREFIXES).find(([, prefix]) => prefix === firstSegment)?.[0] ?? null;
}

function isDynamicRoute(route) {
  return normalizedRoute(route)
    .split('/')
    .some((segment) => segment.includes('[') || segment.includes(']'));
}

function walkPageFiles(directory, out) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walkPageFiles(absolute, out);
    } else if (entry.isFile() && PAGE_FILE_PATTERN.test(entry.name)) {
      out.push(absolute);
    }
  }
}

/** Convert an App Router page file to its public path, ignoring route groups. */
export function routeFromPageFile(appRoot, pageFile) {
  const rel = relative(resolve(appRoot), resolve(pageFile));
  if (!rel || rel.startsWith('..') || rel.split(sep).includes('..')) return null;

  const segments = rel.split(sep);
  if (!PAGE_FILE_PATTERN.test(segments.at(-1) ?? '')) return null;

  const routeSegments = segments.slice(0, -1).filter((segment) => !isIgnoredSegment(segment));
  return normalizedRoute(`/${routeSegments.join('/')}`);
}

/** Read the five role-prefixed route trees from App Router page files. */
export function discoverPortalPageRoutes(appRoot) {
  const pageFiles = [];
  walkPageFiles(resolve(appRoot), pageFiles);

  const discovered = Object.fromEntries(
    Object.keys(PORTAL_ROLE_PREFIXES).map((role) => [role, { static: new Set(), dynamic: new Set() }])
  );

  for (const pageFile of pageFiles) {
    const route = routeFromPageFile(appRoot, pageFile);
    const role = route ? sectionForRoute(route) : null;
    if (!role) continue;
    discovered[role][isDynamicRoute(route) ? 'dynamic' : 'static'].add(route);
  }

  return Object.fromEntries(
    Object.entries(discovered).map(([role, routes]) => [
      role,
      {
        static: [...routes.static].sort(),
        dynamic: [...routes.dynamic].sort(),
      },
    ])
  );
}

function canonicalManifestRoutes(paths) {
  return [...new Set((paths ?? []).map(normalizedRoute))].sort();
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

/**
 * Flag-gated entries are pages that are OFF by default and answer not-found
 * until a server flag is on. They stay in the inventory (drift still fails)
 * but are classified separately: each names its flag, the expected result
 * while the flag is off, and the enforcing test that covers the denial.
 */
function normalizeFlagGatedEntries(entries, expectedDynamic) {
  const routes = [];
  const invalid = [];
  for (const entry of entries ?? []) {
    const path = normalizedRoute(entry?.path);
    const flag = typeof entry?.flag === 'string' ? entry.flag.trim() : '';
    const whenOff = typeof entry?.whenOff === 'string' ? entry.whenOff.trim() : '';
    const coveredBy = typeof entry?.coveredBy === 'string' ? entry.coveredBy.trim() : '';
    if (!entry || typeof entry !== 'object' || !flag || whenOff !== 'not_found' || !coveredBy) {
      invalid.push(path);
      continue;
    }
    if (isDynamicRoute(path) !== expectedDynamic) continue;
    routes.push(path);
  }
  return { routes: [...new Set(routes)].sort(), invalid: [...new Set(invalid)].sort() };
}

function normalizeRedirectOnlyEntries(entries, expectedDynamic) {
  const routes = [];
  const invalid = [];

  for (const entry of entries ?? []) {
    const path = normalizedRoute(entry?.path);
    const target = typeof entry?.target === 'string' ? entry.target.trim() : '';
    const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
    if (!entry || typeof entry !== 'object' || !target || !reason) {
      invalid.push(path);
      continue;
    }
    if (isDynamicRoute(path) !== expectedDynamic) continue;
    routes.push(path);
  }

  return {
    routes: [...new Set(routes)].sort(),
    invalid: [...new Set(invalid)].sort(),
  };
}

/** Compare the checked-in route manifest to routes discovered from app/. */
export function comparePortalRouteInventory({
  discovered,
  staticPaths,
  dynamicPaths,
  redirectOnlyPaths = {},
  flagGatedPaths = {},
}) {
  const roles = Object.keys(PORTAL_ROLE_PREFIXES);
  const sections = {};
  let ok = true;

  for (const role of roles) {
    const discoveredStatic = [...(discovered?.[role]?.static ?? [])].sort();
    const discoveredDynamic = [...(discovered?.[role]?.dynamic ?? [])].sort();
    const auditedStatic = canonicalManifestRoutes(staticPaths?.[role]);
    const auditedDynamic = canonicalManifestRoutes(dynamicPaths?.[role]);
    const redirectStatic = normalizeRedirectOnlyEntries(redirectOnlyPaths?.[role], false);
    const redirectDynamic = normalizeRedirectOnlyEntries(redirectOnlyPaths?.[role], true);
    const gatedStatic = normalizeFlagGatedEntries(flagGatedPaths?.[role], false);
    const gatedDynamic = normalizeFlagGatedEntries(flagGatedPaths?.[role], true);
    const manifestStatic = [...new Set([...auditedStatic, ...redirectStatic.routes, ...gatedStatic.routes])].sort();
    const manifestDynamic = [...new Set([...auditedDynamic, ...redirectDynamic.routes, ...gatedDynamic.routes])].sort();
    const missingStatic = difference(discoveredStatic, manifestStatic);
    const staleStatic = difference(manifestStatic, discoveredStatic);
    const missingDynamic = difference(discoveredDynamic, manifestDynamic);
    const staleDynamic = difference(manifestDynamic, discoveredDynamic);
    const overlappingStatic = [
      ...intersection(auditedStatic, redirectStatic.routes),
      ...intersection([...auditedStatic, ...redirectStatic.routes], gatedStatic.routes),
    ].sort();
    const overlappingDynamic = [
      ...intersection(auditedDynamic, redirectDynamic.routes),
      ...intersection([...auditedDynamic, ...redirectDynamic.routes], gatedDynamic.routes),
    ].sort();
    const invalidRedirectOnly = [...redirectStatic.invalid, ...redirectDynamic.invalid].sort();
    const invalidFlagGated = [...new Set([...gatedStatic.invalid, ...gatedDynamic.invalid])].sort();
    const sectionOk =
      missingStatic.length === 0 &&
      staleStatic.length === 0 &&
      missingDynamic.length === 0 &&
      staleDynamic.length === 0 &&
      overlappingStatic.length === 0 &&
      overlappingDynamic.length === 0 &&
      invalidRedirectOnly.length === 0 &&
      invalidFlagGated.length === 0;

    if (!sectionOk) ok = false;
    sections[role] = {
      ok: sectionOk,
      discoveredStaticCount: discoveredStatic.length,
      manifestStaticCount: manifestStatic.length,
      auditedStaticCount: auditedStatic.length,
      redirectOnlyStaticCount: redirectStatic.routes.length,
      discoveredDynamicCount: discoveredDynamic.length,
      manifestDynamicCount: manifestDynamic.length,
      auditedDynamicCount: auditedDynamic.length,
      redirectOnlyDynamicCount: redirectDynamic.routes.length,
      flagGatedStaticCount: gatedStatic.routes.length,
      flagGatedDynamicCount: gatedDynamic.routes.length,
      missingStatic,
      staleStatic,
      missingDynamic,
      staleDynamic,
      overlappingStatic,
      overlappingDynamic,
      invalidRedirectOnly,
      invalidFlagGated,
    };
  }

  const expectedRoles = new Set(roles);
  const unexpectedManifestSections = [
    ...Object.keys(staticPaths ?? {}),
    ...Object.keys(dynamicPaths ?? {}),
    ...Object.keys(redirectOnlyPaths ?? {}),
    ...Object.keys(flagGatedPaths ?? {}),
  ]
    .filter((role) => !expectedRoles.has(role))
    .filter((role, index, all) => all.indexOf(role) === index)
    .sort();

  if (unexpectedManifestSections.length > 0) ok = false;

  return {
    ok,
    generatedAt: new Date().toISOString(),
    sections,
    unexpectedManifestSections,
  };
}

export function formatPortalRouteInventoryDrift(report) {
  if (report.ok) return 'Portal route manifest matches app page routes.';
  const lines = ['Portal route manifest drift detected:'];
  for (const [role, section] of Object.entries(report.sections ?? {})) {
    for (const [key, values] of Object.entries({
      missingStatic: section.missingStatic,
      staleStatic: section.staleStatic,
      missingDynamic: section.missingDynamic,
      staleDynamic: section.staleDynamic,
      overlappingStatic: section.overlappingStatic,
      overlappingDynamic: section.overlappingDynamic,
      invalidRedirectOnly: section.invalidRedirectOnly,
      invalidFlagGated: section.invalidFlagGated,
    })) {
      if (values?.length) lines.push(`- ${role}.${key}: ${values.join(', ')}`);
    }
  }
  if (report.unexpectedManifestSections?.length) {
    lines.push(`- unexpected sections: ${report.unexpectedManifestSections.join(', ')}`);
  }
  return lines.join('\n');
}

export function auditPortalRouteInventory({
  appRoot,
  staticPaths,
  dynamicPaths,
  redirectOnlyPaths = {},
  flagGatedPaths = {},
}) {
  return comparePortalRouteInventory({
    discovered: discoverPortalPageRoutes(appRoot),
    staticPaths,
    dynamicPaths,
    redirectOnlyPaths,
    flagGatedPaths,
  });
}
