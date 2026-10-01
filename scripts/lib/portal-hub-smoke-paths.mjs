/**
 * Narrow authenticated portal hub smoke (member / counselor / employer).
 *
 * One hub + one deep link per role. Read-only Playwright coverage that sits
 * below the five-role `audit:portal` matrix (WAP-66 / historic #2284).
 */

export const PORTAL_HUB_SMOKE_ROLES = Object.freeze(['member', 'counselor', 'employer']);

/** @typedef {'member' | 'counselor' | 'employer'} PortalHubSmokeRole */

/**
 * @type {Readonly<Record<PortalHubSmokeRole, { hub: string, deepLink: string, hubHeading: RegExp, deepHeading: RegExp }>>}
 */
export const PORTAL_HUB_SMOKE_PATHS = Object.freeze({
  member: {
    hub: '/dashboard',
    deepLink: '/dashboard/jobs',
    hubHeading: /welcome back|welcome to workforceap|dashboard|^home$/i,
    deepHeading: /^job board$/i,
  },
  counselor: {
    hub: '/counselor',
    deepLink: '/counselor/inbox',
    // `/counselor` lands on Today (one attention list); the overview headings remain for `/counselor/overview`.
    hubHeading: /today|counselor overview|caseload|hey,/i,
    deepHeading: /^inbox zero$/i,
  },
  employer: {
    hub: '/employer',
    deepLink: '/employer/applications',
    hubHeading: /employer overview|hiring/i,
    deepHeading: /^applicants(?:\s*\(\d+\))?$/i,
  },
});

/**
 * @param {string} pathname
 * @param {PortalHubSmokeRole} role
 */
export function isPortalHubSmokePath(pathname, role) {
  const root = PORTAL_HUB_SMOKE_PATHS[role]?.hub;
  if (!root || typeof pathname !== 'string') return false;
  const path = pathname.split('?')[0] || '';
  return path === root || path.startsWith(`${root}/`);
}
