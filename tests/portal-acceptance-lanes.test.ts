import { describe, expect, it } from 'vitest';
import { evaluateAcceptanceLanes, mergeLocalFixtureCompanion, REQUIRED_LANES, validateAcceptanceIdentity } from '../scripts/lib/portal-acceptance-lanes.mjs';
import { createPortalBrowserPlan, STAFF_VIEW_STATES } from '../scripts/lib/portal-browser-plan.mjs';
import { PORTAL_REVIEW_FIXTURES } from '../lib/dev/portalReviewFixtures';

const identity = { runId: 'run-42', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'org-42', controlSha: 'a'.repeat(40), deployedSha: 'b'.repeat(40), baselineSha: 'c'.repeat(40), planHash: 'd'.repeat(64) };
const expected = Object.fromEntries(REQUIRED_LANES.map(lane => [lane, [`${lane}:required`]]));
function receipts() { return REQUIRED_LANES.map(lane => ({ schemaVersion: 1, lane, identity: { ...identity }, status: 'passed', startedAt: '2026-10-27T00:00:00Z', completedAt: '2026-10-27T00:01:00Z', cases: [{ id: `${lane}:required`, status: 'passed' }] })); }

describe('complete same-run acceptance evidence', () => {
  it('accepts only all mandatory agreeing lanes and cases', () => {
    expect(evaluateAcceptanceLanes(identity, expected, receipts()).status).toBe('passed');
  });
  it.each(['skipped', 'pending', 'running', 'incomplete'])('keeps %s evidence incomplete even when the reporter says passed', status => {
    const values = receipts(); values[0].cases[0].status = status;
    expect(evaluateAcceptanceLanes(identity, expected, values).status).toBe('incomplete');
  });
  it('keeps missing cleanup red and does not count a successful reporter', () => {
    expect(evaluateAcceptanceLanes(identity, expected, receipts().filter(item => item.lane !== 'cleanup')).status).toBe('incomplete');
    const values = receipts(); values.at(-1)!.status = 'failed';
    expect(evaluateAcceptanceLanes(identity, expected, values).status).toBe('failed');
  });
  it('distinguishes evidence read errors and rejects contradictory duplicates', () => {
    const values = receipts(); values[1].status = 'error';
    expect(evaluateAcceptanceLanes(identity, expected, values).status).toBe('error');
    expect(evaluateAcceptanceLanes(identity, expected, [...receipts(), receipts()[0]]).status).toBe('error');
  });
  it.each(['runId', 'controlSha', 'deployedSha', 'baselineSha', 'planHash', 'organizationId'])('rejects mismatched %s', field => {
    const values = receipts(); (values[0].identity as Record<string, string>)[field] = 'different';
    expect(evaluateAcceptanceLanes(identity, expected, values).status).toBe('error');
  });
  it('does not let a receipt redefine its required coverage', () => {
    const values = receipts(); values[0].cases = [];
    expect(evaluateAcceptanceLanes(identity, expected, values).status).toBe('incomplete');
    values[0].cases = [{ id: 'optional-alternative', status: 'passed' }];
    expect(evaluateAcceptanceLanes(identity, expected, values).status).toBe('error');
  });
  it('rejects production and short SHA identities', () => {
    expect(() => validateAcceptanceIdentity({ ...identity, projectRef: 'jqddnyuszufndwwezdwp' })).toThrow('DEMO');
    expect(() => validateAcceptanceIdentity({ ...identity, deployedSha: 'bbbbbbb' })).toThrow('deployedSha');
  });
  it('preserves optional workflow provenance and rejects its mismatch', () => {
    const withProvenance = { ...identity, repository: 'workforceap/workforceap-beta', workflowRunId: '42', workflowAttempt: '1' };
    expect(validateAcceptanceIdentity(withProvenance)).toEqual(withProvenance);
    expect(evaluateAcceptanceLanes(withProvenance, expected, receipts()).status).toBe('error');
  });
  it('merges only exact known local-only omissions; it cannot replace a real hosted failure', () => {
    const hosted = { kind: 'hosted-browser', identity, receipts: [{ ...receipts()[0], lane: 'fixture-render-matrix', status: 'incomplete', cases: [{ id: 'local-case', status: 'incomplete', reason: 'local_development_only_fixture' }] }] };
    const local = { kind: 'local-fixture-companion', identity, receipts: [{ ...receipts()[0], lane: 'fixture-render-matrix', cases: [{ id: 'local-case', status: 'passed' }] }] };
    expect(mergeLocalFixtureCompanion(hosted, local, identity, ['local-case'])[0].status).toBe('passed');
    hosted.receipts[0].cases[0].status = 'failed';
    expect(() => mergeLocalFixtureCompanion(hosted, local, identity, ['local-case'])).toThrow('Cannot replace');
    expect(() => mergeLocalFixtureCompanion(hosted, local, { ...identity, deployedSha: 'f'.repeat(40) }, ['local-case'])).toThrow('identity');
  });
});

describe('browser coverage from current route and fixture manifests', () => {
  it('builds unique current cases with all widths, themes and shell states', () => {
    const plan = createPortalBrowserPlan({ identity, fixtures: PORTAL_REVIEW_FIXTURES, memberId: 'synthetic-42' });
    expect(STAFF_VIEW_STATES).toHaveLength(12);
    expect(plan.cases.some(item => item.path === '/employer/candidates?view=pipeline')).toBe(true);
    expect(plan.cases.some(item => item.path === '/partner/impact?view=outcomes')).toBe(true);
    expect(plan.cases.find(item => item.path === '/admin/students' && item.lane === 'staff-comparison')?.expectedPath).toBe('/admin/members');
    for (const ids of Object.values(plan.expectedCases)) expect(new Set(ids).size).toBe(ids.length);
  });
  it('keeps unavailable fixtures and unapproved mentor coverage explicit', () => {
    const plan = createPortalBrowserPlan({ identity, fixtures: PORTAL_REVIEW_FIXTURES });
    expect(plan.cases.filter(item => item.lane === 'mentor-comparison').every(item => item.missing === 'approved_mentor_fixture_missing')).toBe(true);
    expect(plan.cases.some(item => item.missing === 'local_development_only_fixture')).toBe(true);
    expect(plan.cases.some(item => item.missing === 'approved_dynamic_fixture_missing')).toBe(true);
  });
  it('preserves curriculum query and rejects foreign or mismatched fixture paths', () => {
    const options = { identity, fixtures: [], memberId: 'synthetic-42' };
    const route = { pattern: '/dashboard/learning/modules/[courseSlug]', path: '/dashboard/learning/modules/course-42?program=program-42' };
    expect(createPortalBrowserPlan({ ...options, dynamicRoutes: [route] }).cases.some(item => item.path === route.path)).toBe(true);
    expect(() => createPortalBrowserPlan({ ...options, dynamicRoutes: [{ ...route, path: '/dashboard/learning/modules/course-42' }] })).toThrow('program');
    expect(() => createPortalBrowserPlan({ ...options, dynamicRoutes: [{ ...route, path: '//outside.invalid/path' }] })).toThrow();
  });
});
