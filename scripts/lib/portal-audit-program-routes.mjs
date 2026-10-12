/** Read-only member fixture facts for the two program subpages with data-dependent routing. */
export const MEMBER_PROGRAM_FACTS_PATH = '/api/member/profile?portalAudit=program-subpages';
export const MEMBER_PROGRAM_FIXTURE_CONDITION = 'member_program_route';

const PROGRAM_PATHS = new Set([
  '/dashboard/program/start',
  '/dashboard/program/employer-screening',
]);
const PACK_STATES = new Set(['available', 'absent', 'invalid', 'not_applicable']);

/** Whitelist booleans/enums only; never persist the profile or fixture identifiers. */
export function parseMemberProgramRouteFacts(value) {
  if (value?.version !== 1 ||
      typeof value?.start?.hasResolvedProgram !== 'boolean' ||
      typeof value?.employerScreening?.hasResolvedProgram !== 'boolean' ||
      !PACK_STATES.has(value?.employerScreening?.pack)) return null;
  const { hasResolvedProgram, pack } = value.employerScreening;
  if (hasResolvedProgram === (pack === 'not_applicable')) return null;
  return {
    version: 1,
    start: { hasResolvedProgram: value.start.hasResolvedProgram },
    employerScreening: { hasResolvedProgram, pack },
  };
}

/** Fetch through the existing authenticated profile read and validated audit capability. */
export async function readMemberProgramRouteFacts(request, origin, timeout) {
  try {
    const response = await request.get(new URL(MEMBER_PROGRAM_FACTS_PATH, origin).href, {
      timeout,
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    if (!response.ok()) return { ok: false, reason: 'program_fixture_facts_http_error', facts: null };
    const body = await response.json();
    const facts = parseMemberProgramRouteFacts(body?.programRouteFacts);
    return facts
      ? { ok: true, reason: null, facts }
      : { ok: false, reason: 'program_fixture_facts_unverified', facts: null };
  } catch {
    return { ok: false, reason: 'program_fixture_facts_read_failed', facts: null };
  }
}

/**
 * The start and screening pages deliberately use different existing resolvers.
 * A missing screening pack is explicit noncoverage, never a successful render.
 */
export function memberProgramRouteExpectation(path, role, claims, readResult) {
  const unverified = (reason) => ({ behavior: 'unverified', target: path, heading: null, reason });
  if (!PROGRAM_PATHS.has(path)) return unverified('unknown_program_fixture_route');
  if (role !== 'member' || claims?.role !== 'member' || claims?.superAdmin !== false) {
    return unverified('fixture_condition_mismatch');
  }
  const facts = readResult?.ok === true ? parseMemberProgramRouteFacts(readResult.facts) : null;
  if (!facts) return unverified(readResult?.reason ?? 'program_fixture_facts_unverified');

  const start = path === '/dashboard/program/start';
  const hasProgram = start ? facts.start.hasResolvedProgram : facts.employerScreening.hasResolvedProgram;
  if (!hasProgram) {
    return { behavior: 'redirect', target: '/dashboard/program', heading: null, reason: 'verified_program_absent' };
  }
  if (!start && facts.employerScreening.pack === 'absent') {
    return { behavior: 'unavailable', target: path, heading: null, reason: 'screening_pack_absent_noncoverage' };
  }
  if (!start && facts.employerScreening.pack === 'invalid') {
    return unverified('screening_pack_invalid');
  }
  return {
    behavior: 'render',
    target: path,
    heading: start ? 'Your path to certification' : 'Employer screening pack',
    reason: 'verified_program_present',
  };
}
