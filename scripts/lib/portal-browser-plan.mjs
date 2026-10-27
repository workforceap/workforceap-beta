import { STATIC_PATHS, DYNAMIC_PATHS, REDIRECT_ONLY_PATHS } from './portal-audit-paths.mjs';
import { validateAcceptanceIdentity, validateBrowserPhase, BROWSER_PHASE_NAMES } from './portal-acceptance-lanes.mjs';

/** Source content that the coordinator must verify at both immutable commits before writes. */
export const PORTAL_PHASE_CONTENT_PATHS = Object.freeze([
  'lib/content/careerBriefs.ts', 'lib/content/memberResources.ts', 'lib/content/programs.ts',
  'lib/content/programSlug.ts', 'lib/content/programCurriculumManifest.ts', 'lib/content/workforceApModule.ts',
  'lib/content/itSupportLabs.ts', 'lib/content/courseraDiscoveredCatalog.ts', 'lib/member/curriculumAssignment.ts',
  'shared/programSyllabi.ts', 'shared/programCurricula.ts', 'shared/digitalLiteracyPathway.ts',
  'content/career-brief/2026-03-21-weekly-brief.md', 'content/member-resources/index.json',
  'content/member-resources/ats-resume-template.md',
]);
export const PORTAL_PHASE_FIXED_CONTENT = Object.freeze({
  careerBrief: '2026-03-21-weekly-brief', resource: 'ats-resume-template',
  programSlug: 'it-support-professional-certificate-ibm', curriculumVersion: 'legacy-v1',
  moduleProgram: 'digital-literacy-empowerment-class', moduleCourse: 'digital-literacy-empowerment-class-course-1',
  labId: 'ticket-triage', labContentVersion: '2026-09-09.v1', labRubricVersion: '2026-09-09.v1',
});

/** @typedef {{name: 'unassigned'|'assigned-owner'|'approved-profile', blueprintHash: string, stateDigest: string, ids: {counselorResult:string,enrollment:string,mentor:string,job:string}}} BrowserPhase */
/** Fixed bindings only; a receipt or caller cannot substitute an arbitrary dynamic route. */
export function portalPhaseDynamicRoutes(value) {
  const phase = validateBrowserPhase(value);
  const fixed = PORTAL_PHASE_FIXED_CONTENT;
  const all = [
    { phase: 'unassigned', pattern: '/dashboard/career-brief/[slug]', path: `/dashboard/career-brief/${fixed.careerBrief}` },
    { phase: 'unassigned', pattern: '/dashboard/career-library/[id]', path: `/dashboard/career-library/${fixed.resource}` },
    { phase: 'assigned-owner', pattern: '/dashboard/counselor/[id]', path: `/dashboard/counselor/${phase.ids.counselorResult}` },
    { phase: 'assigned-owner', pattern: '/dashboard/learning/modules/[courseSlug]', path: `/dashboard/learning/modules/${fixed.moduleCourse}?program=${fixed.moduleProgram}` },
    { phase: 'assigned-owner', pattern: '/dashboard/learning/labs/[labId]', path: `/dashboard/learning/labs/${fixed.labId}` },
    { phase: 'approved-profile', pattern: '/dashboard/jobs/[id]', path: `/dashboard/jobs/${phase.ids.job}` },
    { phase: 'approved-profile', pattern: '/dashboard/mentors/[mentorId]', path: `/dashboard/mentors/${phase.ids.mentor}` },
  ];
  const required = DYNAMIC_PATHS.member.filter(pattern => !pattern.includes('...'));
  if (all.length !== required.length || required.some(pattern => all.filter(route => route.pattern === pattern).length !== 1)) throw new Error('Current dynamic inventory differs from the reviewed phase bindings');
  return all.filter(route => route.phase === phase.name).map(({ pattern, path }) => ({ pattern, path }));
}

/** Hosted phases are opt-in; the independent local companion never reads phase credentials/state. */
export function validateBrowserPhaseInput(input, { localFixturesOnly = false, phasesEnabled = false } = {}) {
  if (input.phase === undefined) return undefined;
  if (localFixturesOnly) throw new Error('The local fixture companion does not accept a hosted phase');
  if (!phasesEnabled) throw new Error('Hosted synthetic phases are disabled');
  if ((input.dynamicRoutes !== undefined && (!Array.isArray(input.dynamicRoutes) || input.dynamicRoutes.length)) || (input.mentorApproved !== undefined && input.mentorApproved !== false)) throw new Error('Phased coverage cannot use route overrides or an approval boolean');
  return validateBrowserPhase(input.phase);
}

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
 * @param {{identity: Record<string, unknown>, fixtures: Array<{route: string, scenarios: Array<{href: string}>, availability?: string}>, dynamicRoutes?: Array<{pattern: string, path: string}>, mentorApproved?: boolean, memberId?: string, phase?: BrowserPhase}} options
 */
export function createPortalBrowserPlan({ identity, fixtures, dynamicRoutes = [], mentorApproved = false, memberId, phase: requestedPhase }) {
  validateAcceptanceIdentity(identity);
  const phase = requestedPhase === undefined ? undefined : validateBrowserPhase(requestedPhase);
  if (phase && (dynamicRoutes.length || mentorApproved)) throw new Error('Phased coverage cannot use route overrides or an approval boolean');
  if (phase && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(memberId ?? '')) throw new Error('Phased browser coverage requires the journal-owned member UUID');
  const ordinary = !phase || phase.name === 'unassigned';
  const prefix = phase ? `${phase.name}:` : '';
  const routes = phase ? portalPhaseDynamicRoutes(phase) : dynamicRoutes;
  /** @type {Array<{id: string, lane: string, role: string, path?: string, expectedPath?: string, width?: number, theme?: string, state?: string, missing?: string}>} */
  const cases = [];
  const add = (lane, role, path, extra = {}) => {
    safePortalPath(path);
    const suffix = [extra.width, extra.theme, extra.state].filter(Boolean).join(':');
    cases.push({ id: `${prefix}${role}:${path}${suffix ? `:${suffix}` : ''}`, lane, role, path, ...extra });
  };
  if (ordinary) for (const [role, routes] of Object.entries(STATIC_PATHS)) {
    for (const path of routes) {
      add('logged-out-routes', role, path);
      if (role === 'member') for (const width of [1440, 390]) add('member-routes', role, path, { width, theme: 'light', expectedPath: path });
    }
  }
  for (const pattern of DYNAMIC_PATHS.member) {
    if (pattern.includes('...')) continue; // The current catch-all is redirect inventory, not an independent screen.
    const matches = routes.filter(route => route.pattern === pattern);
    if (phase && !matches.length) continue; // Required in its fixed named phase, never omitted from the combined contract.
    if (matches.length !== 1) {
      cases.push({ id: `${prefix}member:${pattern}:fixture`, lane: 'member-routes', role: 'member', missing: 'approved_dynamic_fixture_missing' });
      continue;
    }
    const route = matches[0];
    const matcher = new RegExp(`^${pattern.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\[[^\]]+\]/g, '[A-Za-z0-9_-]+')}$`);
    const resolved = new URL(safePortalPath(route.path), 'https://fixture.invalid');
    if (!matcher.test(resolved.pathname)) throw new Error('Dynamic fixture does not match its current route pattern');
    if (pattern.includes('/modules/') && !resolved.searchParams.get('program')) throw new Error('Module fixture requires its program query');
    for (const width of [1440, 390]) add('member-routes', 'member', route.path, { width, theme: 'light', expectedPath: route.path });
  }
  if (ordinary) for (const alias of REDIRECT_ONLY_PATHS.member ?? []) {
    if (!alias.path.includes('[') && !alias.target.includes('[')) for (const width of [1440, 390]) add('member-routes', 'member', alias.path, { width, theme: 'light', expectedPath: alias.target });
  }
  if (ordinary) for (const [role, routes] of Object.entries(STAFF_COMPARE_ROUTES)) {
    for (const path of routes) {
      if (!STATIC_PATHS[role].some(known => known.split('?')[0] === path.split('?')[0])) throw new Error('Staff comparison route absent from current inventory');
      for (const view of STAFF_VIEW_STATES) add('staff-comparison', role, path, { ...view, expectedPath: path });
    }
  }
  if (ordinary) for (const alias of STAFF_ALIASES) for (const view of STAFF_VIEW_STATES) add('staff-comparison', alias.role, alias.path, { ...view, expectedPath: alias.expectedPath, redirect: true });
  if (ordinary) for (const [role, pathPrefix] of [['admin', '/admin/members'], ['counselor', '/counselor/students']]) {
    if (/^[A-Za-z0-9_-]+$/.test(memberId ?? '')) for (const view of STAFF_VIEW_STATES) add('staff-comparison', role, `${pathPrefix}/${memberId}`, { ...view, expectedPath: `${pathPrefix}/${memberId}` });
    else cases.push({ id: `${prefix}${role}:member-detail:fixture`, lane: 'staff-comparison', role, missing: 'run_owned_member_id_missing' });
  }
  if (phase?.name === 'assigned-owner') {
    for (const path of ['/dashboard/program', '/dashboard/program/start']) for (const width of [1440, 390]) add('member-routes', 'member', path, { width, theme: 'light', expectedPath: path });
  }
  if (!phase || phase.name === 'assigned-owner') for (const view of STAFF_VIEW_STATES) {
    add('mentor-comparison', 'member', '/dashboard/mentor', { ...view, expectedPath: '/dashboard/mentor', ...(phase || mentorApproved ? {} : { missing: 'approved_mentor_fixture_missing' }) });
  }
  if (ordinary) for (const fixture of fixtures) for (const path of [fixture.route, ...fixture.scenarios.map(scenario => scenario.href)]) {
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) add('fixture-render-matrix', 'anonymous', path, {
      width, theme, ...(fixture.availability === 'local-development' ? { missing: 'local_development_only_fixture' } : {}),
    });
  }
  if (ordinary) cases.push({ id: `${prefix}current-route-inventory`, lane: 'inventory-readiness', role: 'anonymous' });
  const expectedCases = Object.fromEntries([...new Set(cases.map(item => item.lane))].map(lane => [lane, cases.filter(item => item.lane === lane).map(item => item.id)]));
  for (const ids of Object.values(expectedCases)) if (new Set(ids).size !== ids.length) throw new Error('Duplicate planned browser case');
  return { identity: validateAcceptanceIdentity(identity), ...(phase ? { phase } : {}), cases, expectedCases };
}

/** Required coverage is derived from trusted coordinator descriptors, not receipt-owned cases. */
export function createPortalPhaseContracts({ identity, fixtures, memberId, phases }) {
  if (!Array.isArray(phases) || phases.length !== BROWSER_PHASE_NAMES.length) throw new Error('All three trusted browser phases are required');
  const validated = phases.map(validateBrowserPhase);
  if (new Set(validated.map(phase => phase.name)).size !== BROWSER_PHASE_NAMES.length) throw new Error('Duplicate browser phase');
  const first = validated[0];
  if (validated.some(phase => phase.blueprintHash !== first.blueprintHash || Object.keys(first.ids).some(key => phase.ids[key] !== first.ids[key]))) throw new Error('Browser phase blueprint or reserved IDs differ');
  const plans = BROWSER_PHASE_NAMES.map(name => createPortalBrowserPlan({ identity, fixtures, memberId, phase: validated.find(phase => phase.name === name) }));
  /** @type {Record<string, string[]>} */
  const expectedCases = {};
  for (const plan of plans) for (const [lane, ids] of Object.entries(plan.expectedCases)) expectedCases[lane] = [...(expectedCases[lane] ?? []), ...ids];
  return {
    contracts: plans.map(plan => ({ phase: plan.phase, expectedCases: plan.expectedCases })), expectedCases,
    localFixtureCaseIds: plans.flatMap(plan => plan.cases.filter(item => item.missing === 'local_development_only_fixture').map(item => item.id)),
  };
}
