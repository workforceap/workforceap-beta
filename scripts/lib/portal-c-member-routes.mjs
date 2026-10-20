import { resolveDynamicRouteCandidates } from './portal-audit-actions.mjs';

export const MEMBER_ROUTE_PARENTS = Object.freeze({
  'job-detail': '/dashboard/jobs',
  'learning-module': '/dashboard/learning',
  lab: '/dashboard/learning',
  'counselor-detail': '/dashboard/counselor',
  'mentor-profile': '/dashboard/mentors',
  'career-brief-detail': '/dashboard/career-brief',
  'career-library-detail': '/dashboard/career-library',
});

/** Keep the required program query, while refusing external or invented targets. */
export function memberRouteFixturePath(href, pattern, staticPaths = []) {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//') || /[\\#\s]/.test(href)) return null;
  const url = new URL(href, 'https://fixture.invalid');
  const pathname = url.pathname.replace(/^\/(en|es|fr|pt)(?=\/)/, '');
  const parts = pathname.split('/');
  const expected = pattern.split('/');
  if (parts.length !== expected.length || !parts.every((part, index) => expected[index].startsWith('[')
    ? /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(part)
    : part === expected[index])) return null;
  const entries = [...url.searchParams];
  if (pattern === '/dashboard/learning/modules/[courseSlug]') {
    if (entries.length !== 1 || entries[0][0] !== 'program' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entries[0][1])) return null;
  } else if (entries.length) return null;
  return resolveDynamicRouteCandidates({
    hrefPaths: [`${pathname}${url.search}`], patterns: [pattern], excludedPaths: staticPaths,
  })[0]?.path ?? null;
}

export function parseMemberRouteFixtures(raw, views) {
  const value = JSON.parse(raw ?? '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Member route fixtures must be a JSON object.');
  const staticPaths = views.filter(view => !view.livePath.includes('[')).map(view => view.livePath);
  return Object.fromEntries(Object.entries(value).map(([slug, href]) => {
    const view = views.find(candidate => candidate.slug === slug && candidate.livePath.includes('['));
    const path = view && memberRouteFixturePath(href, view.livePath, staticPaths);
    if (!path) throw new Error(`Invalid authorized member route fixture for ${slug}.`);
    return [slug, path];
  }));
}
