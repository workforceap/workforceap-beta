import { describe, expect, it, vi } from 'vitest';
import {
  memberProgramRouteExpectation,
  parseMemberProgramRouteFacts,
  readMemberProgramRouteFacts,
} from '../scripts/lib/portal-audit-program-routes.mjs';
import {
  redirectDestinationFailureReasons,
  summarizeRedirectCoverage,
} from '../scripts/lib/portal-audit-actions.mjs';

const startPath = '/dashboard/program/start';
const screeningPath = '/dashboard/program/employer-screening';
const member = { role: 'member', superAdmin: false };
const enrolled = {
  version: 1,
  start: { hasResolvedProgram: true },
  employerScreening: { hasResolvedProgram: true, pack: 'available' },
};
const noProgram = {
  version: 1,
  start: { hasResolvedProgram: false },
  employerScreening: { hasResolvedProgram: false, pack: 'not_applicable' },
};
const verified = (facts: unknown) => ({ ok: true, reason: null, facts });

describe('member program route fixture decisions', () => {
  it.each([
    { path: startPath, heading: 'Your path to certification' },
    { path: screeningPath, heading: 'Employer screening pack' },
  ])('requires the enrolled $path to render its own heading', ({ path, heading }) => {
    expect(memberProgramRouteExpectation(path, 'member', member, verified(enrolled))).toEqual({
      behavior: 'render', target: path, heading, reason: 'verified_program_present',
    });
  });

  it.each([startPath, screeningPath])('requires a no-program %s to redirect to program home', (path) => {
    expect(memberProgramRouteExpectation(path, 'member', member, verified(noProgram))).toEqual({
      behavior: 'redirect', target: '/dashboard/program', heading: null, reason: 'verified_program_absent',
    });
  });

  it('keeps the start resolver progress-only fallback distinct from the screening resolver', () => {
    const progressOnly = { ...noProgram, start: { hasResolvedProgram: true } };
    expect(memberProgramRouteExpectation(startPath, 'member', member, verified(progressOnly)).behavior).toBe('render');
    expect(memberProgramRouteExpectation(screeningPath, 'member', member, verified(progressOnly)).behavior).toBe('redirect');
  });

  it('reports a verified absent pack as unavailable coverage without claiming a page passed', () => {
    const facts = { ...enrolled, employerScreening: { hasResolvedProgram: true, pack: 'absent' } };
    const expectation = memberProgramRouteExpectation(screeningPath, 'member', member, verified(facts));
    expect(expectation).toEqual({
      behavior: 'unavailable', target: screeningPath, heading: null, reason: 'screening_pack_absent_noncoverage',
    });
    expect(summarizeRedirectCoverage([{ status: 'not_applicable', resultReason: expectation.reason }])).toMatchObject({
      total: 1, passed: 0, failed: 0, notApplicable: 1,
    });
    expect(memberProgramRouteExpectation(startPath, 'member', member, verified(facts)).behavior).toBe('render');
  });

  it('rejects a malformed pack instead of treating it as missing coverage', () => {
    const facts = { ...enrolled, employerScreening: { hasResolvedProgram: true, pack: 'invalid' } };
    expect(memberProgramRouteExpectation(screeningPath, 'member', member, verified(facts))).toMatchObject({
      behavior: 'unverified', reason: 'screening_pack_invalid',
    });
  });

  it.each([
    { claims: null, read: verified(enrolled) },
    { claims: { role: 'admin', superAdmin: false }, read: verified(enrolled) },
    { claims: { role: 'member', superAdmin: true }, read: verified(enrolled) },
    { claims: member, read: null },
    { claims: member, read: verified(null) },
    { claims: member, read: { ok: false, facts: enrolled, reason: 'program_fixture_facts_http_error' } },
  ])('does not infer a program from role claims or unavailable evidence %#', ({ claims, read }) => {
    for (const path of [startPath, screeningPath]) {
      expect(memberProgramRouteExpectation(path, 'member', claims, read).behavior).toBe('unverified');
    }
  });

  it('rejects a different role or an unknown route', () => {
    expect(memberProgramRouteExpectation(startPath, 'admin', member, verified(enrolled)).behavior).toBe('unverified');
    expect(memberProgramRouteExpectation('/dashboard', 'member', member, verified(enrolled))).toMatchObject({
      behavior: 'unverified', reason: 'unknown_program_fixture_route',
    });
  });
});

describe('member fixture evidence boundary', () => {
  it('retains only the version and boolean/enum facts', () => {
    const facts = parseMemberProgramRouteFacts({
      ...enrolled,
      userId: 'private-member',
      start: { ...enrolled.start, programSlug: 'private-program' },
      employerScreening: { ...enrolled.employerScreening, packId: 'private-pack' },
    });
    expect(facts).toEqual(enrolled);
    expect(JSON.stringify(facts)).not.toContain('private');
  });

  it.each([
    null,
    {},
    { ...enrolled, version: 2 },
    { ...enrolled, start: { hasResolvedProgram: 'true' } },
    { ...enrolled, employerScreening: { hasResolvedProgram: false, pack: 'available' } },
    { ...enrolled, employerScreening: { hasResolvedProgram: true, pack: 'not_applicable' } },
    { ...enrolled, employerScreening: { hasResolvedProgram: true, pack: 'unknown' } },
  ])('rejects missing, inconsistent, or unrecognized facts %#', (facts) => {
    expect(parseMemberProgramRouteFacts(facts)).toBeNull();
    expect(memberProgramRouteExpectation(screeningPath, 'member', member, verified(facts)).behavior).toBe('unverified');
  });

  it('uses the existing authenticated GET and discards the returned profile', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: () => true,
      json: async () => ({
        programRouteFacts: enrolled,
        user: { id: 'private-member', email: 'private@example.test' },
        profile: { address: 'private address' },
      }),
    });
    const result = await readMemberProgramRouteFacts({ get }, 'https://preview.example.test', 1234);
    expect(get).toHaveBeenCalledExactlyOnceWith(
      'https://preview.example.test/api/member/profile?portalAudit=program-subpages',
      { timeout: 1234, failOnStatusCode: false, maxRedirects: 0 },
    );
    expect(result).toEqual(verified(enrolled));
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it.each([302, 401, 403, 500])('fails closed on HTTP %i without reading or persisting the error body', async (status) => {
    const json = vi.fn();
    const result = await readMemberProgramRouteFacts({
      get: async () => ({ ok: () => status >= 200 && status < 300, json }),
    }, 'https://preview.example.test', 1234);
    expect(result).toEqual({ ok: false, facts: null, reason: 'program_fixture_facts_http_error' });
    expect(json).not.toHaveBeenCalled();
  });

  it('fails closed if the capability or opt-in facts were unavailable', async () => {
    const result = await readMemberProgramRouteFacts({
      get: async () => ({ ok: () => true, json: async () => ({ user: { id: 'private' } }) }),
    }, 'https://preview.example.test', 1234);
    expect(result).toEqual({ ok: false, facts: null, reason: 'program_fixture_facts_unverified' });
  });

  it.each(['transport', 'json'])('redacts a failed %s read and never converts it to no-program facts', async (failure) => {
    const result = await readMemberProgramRouteFacts({
      get: async () => {
        if (failure === 'transport') throw new Error('private request details');
        return { ok: () => true, json: async () => { throw new Error('private response details'); } };
      },
    }, 'https://preview.example.test', 1234);
    expect(result).toEqual({ ok: false, facts: null, reason: 'program_fixture_facts_read_failed' });
    expect(memberProgramRouteExpectation(startPath, 'member', member, result).behavior).toBe('unverified');
  });
});

describe('conditional member route destination health', () => {
  it.each([
    { path: startPath, facts: enrolled },
    { path: screeningPath, facts: enrolled },
    { path: startPath, facts: noProgram },
    { path: screeningPath, facts: noProgram },
  ])('requires the verified target of $path to pass the existing health checks', ({ path, facts }) => {
    const expectation = memberProgramRouteExpectation(path, 'member', member, verified(facts));
    const destination = {
      finalUrl: `https://preview.example.test${expectation.target}`,
      expectedTarget: expectation.target,
      trustedOrigin: 'https://preview.example.test',
      documentStatus: 200,
      inspection: {
        readOnlyCapabilityActive: true,
        appReady: true,
        h1Count: 1,
        errorFallbackDetected: false,
        errorFallbackStates: [],
      },
    };
    expect(redirectDestinationFailureReasons(destination)).toEqual([]);
    for (const change of [
      { finalUrl: 'https://preview.example.test/dashboard' },
      { documentStatus: 500 },
      { documentStatus: 404 },
      { pageErrorCount: 1 },
      { consoleErrorCount: 1 },
      { dataErrorCount: 1 },
      { blockedWriteRequestCount: 1 },
      { inspection: { ...destination.inspection, readOnlyCapabilityActive: false } },
      { inspection: { ...destination.inspection, appReady: false } },
      { inspection: { ...destination.inspection, h1Count: 0 } },
      { inspection: { ...destination.inspection, errorFallbackDetected: true } },
    ]) {
      expect(redirectDestinationFailureReasons({ ...destination, ...change }).length).toBeGreaterThan(0);
    }
  });
});
