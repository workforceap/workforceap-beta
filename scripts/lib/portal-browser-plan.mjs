import { STATIC_PATHS, DYNAMIC_PATHS, REDIRECT_ONLY_PATHS } from './portal-audit-paths.mjs';
import { validateAcceptanceIdentity } from './portal-acceptance-lanes.mjs';

export const STAFF_COMPARE_ROUTES = Object.freeze({
  admin: ['/admin', '/admin/overview', '/admin/members', '/admin/reporting', '/admin/jobs?filter=all'],
  counselor: ['/counselor/today', '/counselor/overview', '/counselor/students', '/counselor/triage', '/counselor/placements'],
  employer: ['/employer', '/employer/candidates?view=applicants', '/employer/jobs', '/employer/candidates?view=pipeline'],
  partner: ['/partner', '/partner/referred-members', '/partner/impact?view=outcomes', '/partner/attention'],
});
export const STAFF_ALIASES = Object.freeze([
  { role: 'admin', path: '/admin/students', expectedPath: '/admin/members' },
]);
export const STAFF_VIEW_STATES = Object.freeze([1440, 1024, 390].flatMap(width => ['light', 'dark'].flatMap(theme =>
  (width === 390 ? ['expanded', 'drawer'] : ['expanded', 'collapsed']).map(state => ({ width, theme, state })),
)));

export function safePortalPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('Expected a relative portal path');
  const url = new URL(path, 'https://fixture.invalid');
  if (url.origin !== 'https://fixture.invalid' || url.hash) throw new Error('Invalid portal path');
  return `${url.pathname}${url.search}`;
}

/**
 * Derive fixture cases from the current registry, including explicit unavailable states.
 * @param {{identity: Record<string, unknown>, fixtures: Array<{route: string, scenarios: Array<{href: string}>, availability?: string}>, dynamicRoutes?: Array<{pattern: string, path: string}>, mentorApproved?: boolean, memberId?: string}} options
 */
export function createPortalBrowserPlan({ identity, fixtures, dynamicRoutes = [], mentorApproved = false, memberId }) {
  validateAcceptanceIdentity(identity);
  /** @type {Array<{id: string, lane: string, role: string, path?: string, expectedPath?: string, width?: number, theme?: string, state?: string, missing?: string}>} */
  const cases = [];
  const add = (lane, role, path, extra = {}) => {
    safePortalPath(path);
    const suffix = [extra.width, extra.theme, extra.state].filter(Boolean).join(':');
    cases.push({ id: `${role}:${path}${suffix ? `:${suffix}` : ''}`, lane, role, path, ...extra });
  };
  for (const [role, routes] of Object.entries(STATIC_PATHS)) {
    for (const path of routes) {
      add('logged-out-routes', role, path);
      if (role === 'member') for (const width of [1440, 390]) add('member-routes', role, path, { width, theme: 'light', expectedPath: path });
    }
  }
  for (const pattern of DYNAMIC_PATHS.member) {
    if (pattern.includes('...')) continue; // The current catch-all is redirect inventory, not an independent screen.
    const matches = dynamicRoutes.filter(route => route.pattern === pattern);
    if (matches.length !== 1) {
      cases.push({ id: `member:${pattern}:fixture`, lane: 'member-routes', role: 'member', missing: 'approved_dynamic_fixture_missing' });
      continue;
    }
    const route = matches[0];
    const matcher = new RegExp(`^${pattern.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\[[^\]]+\]/g, '[A-Za-z0-9_-]+')}$`);
    const resolved = new URL(safePortalPath(route.path), 'https://fixture.invalid');
    if (!matcher.test(resolved.pathname)) throw new Error('Dynamic fixture does not match its current route pattern');
    if (pattern.includes('/modules/') && !resolved.searchParams.get('program')) throw new Error('Module fixture requires its program query');
    for (const width of [1440, 390]) add('member-routes', 'member', route.path, { width, theme: 'light', expectedPath: route.path });
  }
  for (const alias of REDIRECT_ONLY_PATHS.member ?? []) {
    if (!alias.path.includes('[') && !alias.target.includes('[')) for (const width of [1440, 390]) add('member-routes', 'member', alias.path, { width, theme: 'light', expectedPath: alias.target });
  }
  for (const [role, routes] of Object.entries(STAFF_COMPARE_ROUTES)) {
    for (const path of routes) {
      if (!STATIC_PATHS[role].some(known => known.split('?')[0] === path.split('?')[0])) throw new Error('Staff comparison route absent from current inventory');
      for (const view of STAFF_VIEW_STATES) add('staff-comparison', role, path, { ...view, expectedPath: path });
    }
  }
  for (const alias of STAFF_ALIASES) for (const view of STAFF_VIEW_STATES) add('staff-comparison', alias.role, alias.path, { ...view, expectedPath: alias.expectedPath, redirect: true });
  for (const [role, prefix] of [['admin', '/admin/members'], ['counselor', '/counselor/students']]) {
    if (/^[A-Za-z0-9_-]+$/.test(memberId ?? '')) for (const view of STAFF_VIEW_STATES) add('staff-comparison', role, `${prefix}/${memberId}`, { ...view, expectedPath: `${prefix}/${memberId}` });
    else cases.push({ id: `${role}:member-detail:fixture`, lane: 'staff-comparison', role, missing: 'run_owned_member_id_missing' });
  }
  for (const view of STAFF_VIEW_STATES) {
    add('mentor-comparison', 'member', '/dashboard/mentor', { ...view, expectedPath: '/dashboard/mentor', ...(mentorApproved ? {} : { missing: 'approved_mentor_fixture_missing' }) });
  }
  for (const fixture of fixtures) for (const path of [fixture.route, ...fixture.scenarios.map(scenario => scenario.href)]) {
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) add('fixture-render-matrix', 'anonymous', path, {
      width, theme, ...(fixture.availability === 'local-development' ? { missing: 'local_development_only_fixture' } : {}),
    });
  }
  cases.push({ id: 'current-route-inventory', lane: 'inventory-readiness', role: 'anonymous' });
  const expectedCases = Object.fromEntries([...new Set(cases.map(item => item.lane))].map(lane => [lane, cases.filter(item => item.lane === lane).map(item => item.id)]));
  for (const ids of Object.values(expectedCases)) if (new Set(ids).size !== ids.length) throw new Error('Duplicate planned browser case');
  return { identity: validateAcceptanceIdentity(identity), cases, expectedCases };
}
