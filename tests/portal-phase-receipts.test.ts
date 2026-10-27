import { describe, expect, it } from 'vitest';
import {
  BROWSER_PHASE_NAMES, combinePortalPhaseReceipts, evaluateAcceptanceLanes,
  mergeLocalFixtureCompanion, validateBrowserPhase,
} from '../scripts/lib/portal-acceptance-lanes.mjs';

const identity = {
  runId: 'phase-run-42', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'org-42',
  controlSha: 'a'.repeat(40), deployedSha: 'b'.repeat(40), baselineSha: 'c'.repeat(40), planHash: 'd'.repeat(64),
  repository: 'workforceap/workforceap-beta', workflowRunId: '42', workflowAttempt: '1',
};
const reservedIds = {
  counselorResult: '11111111-1111-4111-8111-111111111111', enrollment: '22222222-2222-4222-8222-222222222222',
  mentor: '33333333-3333-4333-8333-333333333333', job: '44444444-4444-4444-8444-444444444444',
};
type Phase = { name: string; blueprintHash: string; stateDigest: string; ids: typeof reservedIds };
type CaseResult = { id: string; status: string; reason?: string };
type Receipt = {
  schemaVersion: number; identity: typeof identity; phase: Phase; lane: string; status: string;
  startedAt: string; completedAt: string; cases: CaseResult[];
};
type Contract = { phase: Phase; expectedCases: Record<string, string[]> };
type Bundle = {
  kind: string; schemaVersion: number; identity: typeof identity; phase: Phase;
  expectedCases?: Record<string, string[]>; receipts: Receipt[];
};

function contracts(): Contract[] {
  const coverage: Record<string, string[]>[] = [
    { 'inventory-readiness': ['inventory'], 'logged-out-routes': ['anonymous'], 'member-routes': ['member'], 'staff-comparison': ['staff'], 'fixture-render-matrix': ['fixture:hosted', 'fixture:local'] },
    { 'member-routes': ['member'], 'mentor-comparison': ['mentor'] },
    { 'member-routes': ['member'] },
  ];
  return BROWSER_PHASE_NAMES.map((name, index) => ({
    phase: { name, blueprintHash: 'e'.repeat(64), stateDigest: String(index + 1).repeat(64), ids: { ...reservedIds } },
    expectedCases: Object.fromEntries(Object.entries(coverage[index]).map(([lane, ids]) => [lane, ids.map(id => `${name}:${id}`)])),
  }));
}

function bundles(trusted = contracts()): Bundle[] {
  return trusted.map(({ phase, expectedCases }, index) => ({
    kind: 'hosted-browser', schemaVersion: 1, identity: { ...identity }, phase: structuredClone(phase),
    expectedCases: structuredClone(expectedCases),
    receipts: Object.entries(expectedCases).map(([lane, ids]) => ({
      schemaVersion: 1, identity: { ...identity }, phase: structuredClone(phase), lane, status: 'passed',
      startedAt: `2026-10-27T00:0${index}:00Z`, completedAt: `2026-10-27T00:0${index}:30Z`,
      cases: ids.map(id => ({ id, status: 'passed' })),
    })),
  }));
}

function combine(values = bundles(), trusted = contracts()) {
  return combinePortalPhaseReceipts(identity, trusted, values);
}

function localFixtureSetup() {
  const values = bundles();
  const fixture = values[0].receipts.find(receipt => receipt.lane === 'fixture-render-matrix')!;
  fixture.status = 'incomplete';
  fixture.cases[1] = { id: 'unassigned:fixture:local', status: 'incomplete', reason: 'local_development_only_fixture' };
  const { phase: _phase, ...localReceipt } = fixture;
  const local = {
    kind: 'local-fixture-companion', schemaVersion: 1, identity: { ...identity },
    receipts: [{ ...localReceipt, status: 'passed', cases: [{ id: 'fixture:local', status: 'passed' }] }],
  };
  return { hosted: combine(values), local, expected: ['unassigned:fixture:local'] };
}

describe('public browser phase schema', () => {
  it('accepts exactly the public descriptor and fixed phase names without sharing mutable IDs', () => {
    expect(BROWSER_PHASE_NAMES).toEqual(['unassigned', 'assigned-owner', 'approved-profile']);
    for (const { phase } of contracts()) {
      const validated = validateBrowserPhase(phase);
      expect(validated).toEqual(phase);
      expect(validated.ids).not.toBe(phase.ids);
    }
  });

  it.each([
    ['unknown name', (phase: Phase) => ({ ...phase, name: 'other' })],
    ['uppercase hash', (phase: Phase) => ({ ...phase, blueprintHash: 'A'.repeat(64) })],
    ['short digest', (phase: Phase) => ({ ...phase, stateDigest: 'a'.repeat(63) })],
    ['extra secret', (phase: Phase) => ({ ...phase, token: 'must-not-be-accepted' })],
    ['extra ID', (phase: Phase) => ({ ...phase, ids: { ...phase.ids, member: phase.ids.job } })],
    ['invalid UUID', (phase: Phase) => ({ ...phase, ids: { ...phase.ids, job: 'not-a-uuid' } })],
    ['duplicate UUID', (phase: Phase) => ({ ...phase, ids: { ...phase.ids, job: phase.ids.mentor } })],
  ])('rejects %s', (_name, mutate) => {
    expect(() => validateBrowserPhase(mutate(contracts()[0].phase))).toThrow();
  });

  it('rejects missing fields, uppercase aliases of duplicate UUIDs, and coercible hashes', () => {
    const { stateDigest: _digest, ...missing } = contracts()[0].phase;
    expect(() => validateBrowserPhase(missing)).toThrow();
    const phase = contracts()[0].phase;
    phase.ids.mentor = 'a3333333-3333-4333-8333-333333333333';
    phase.ids.job = phase.ids.mentor.toUpperCase();
    expect(() => validateBrowserPhase(phase)).toThrow('distinct');
    expect(() => validateBrowserPhase({ ...contracts()[0].phase, stateDigest: { toString: () => 'a'.repeat(64) } })).toThrow('hash');
  });
});

describe('trusted three-phase browser aggregation', () => {
  it('combines each browser lane once using canonical phase order and the trusted case union', () => {
    const result = combine(bundles().reverse(), contracts().reverse());
    expect(result.kind).toBe('hosted-browser');
    expect(result.schemaVersion).toBe(1);
    expect(result.identity).toEqual(identity);
    expect(result.phases).toEqual(contracts().map(contract => contract.phase));
    expect(result.receipts).toHaveLength(6);
    expect(new Set(result.receipts.map(receipt => receipt.lane)).size).toBe(6);
    expect(result.receipts.every(receipt => receipt.status === 'passed')).toBe(true);
    expect(result.expectedCases['member-routes']).toEqual(['unassigned:member', 'assigned-owner:member', 'approved-profile:member']);
    const member = result.receipts.find(receipt => receipt.lane === 'member-routes')!;
    expect(member.startedAt).toBe('2026-10-27T00:00:00.000Z');
    expect(member.completedAt).toBe('2026-10-27T00:02:30.000Z');
    // Supplemental action/readback/cleanup evidence remains the later evaluator's responsibility.
    expect(evaluateAcceptanceLanes(identity, result.expectedCases, result.receipts).status).toBe('incomplete');
  });

  it.each([0, 1, 2])('keeps missing phase %i incomplete even when every supplied reporter passed', index => {
    const values = bundles(); values.splice(index, 1);
    const result = combine(values);
    const expectedMissing = contracts()[index].expectedCases;
    for (const [lane, ids] of Object.entries(expectedMissing)) {
      const receipt = result.receipts.find(item => item.lane === lane)!;
      expect(receipt.status).toBe('incomplete');
      for (const id of ids) expect(receipt.cases.find(item => item.id === id)).toEqual({ id, status: 'incomplete', reason: 'phase_bundle_missing' });
    }
  });

  it('returns complete missing coverage contracts for an empty evidence set', () => {
    const result = combine([]);
    expect(result.receipts).toHaveLength(6);
    expect(result.receipts.every(receipt => receipt.status === 'incomplete')).toBe(true);
    expect(result.receipts.every(receipt => receipt.cases.every(item => item.status === 'incomplete'))).toBe(true);
  });

  it('marks omitted lanes and cases incomplete without taking coverage from bundle metadata', () => {
    const values = bundles();
    values[1].receipts = values[1].receipts.filter(receipt => receipt.lane !== 'mentor-comparison');
    values[2].receipts[0].cases = [];
    values[2].expectedCases = {};
    const result = combine(values);
    expect(result.receipts.find(receipt => receipt.lane === 'mentor-comparison')?.cases[0].reason).toBe('phase_lane_missing');
    expect(result.receipts.find(receipt => receipt.lane === 'member-routes')?.status).toBe('incomplete');
    expect(result.receipts.find(receipt => receipt.lane === 'member-routes')?.cases.at(-1)).toEqual({ id: 'approved-profile:member', status: 'incomplete', reason: 'phase_case_missing' });
  });

  it.each(['blueprintHash', 'stateDigest'] as const)('rejects a stale bundle %s', key => {
    const values = bundles(); values[1].phase[key] = 'f'.repeat(64);
    expect(() => combine(values)).toThrow('descriptor');
  });

  it('rejects mismatched reserved IDs and receipt-only phase descriptors', () => {
    const values = bundles();
    values[0].phase.ids.job = '55555555-5555-4555-8555-555555555555';
    expect(() => combine(values)).toThrow('descriptor');
    const other = bundles(); other[0].receipts[0].phase.stateDigest = 'f'.repeat(64);
    expect(() => combine(other)).toThrow('descriptor');
  });

  it('rejects duplicate and unknown phases, duplicate lanes, and unphased/mixed bundles', () => {
    const values = bundles();
    expect(() => combine([...values, values[0]])).toThrow('Duplicate');
    values[0].phase.name = 'foreign';
    expect(() => combine(values)).toThrow('phase');
    const duplicate = bundles(); duplicate[0].receipts.push(duplicate[0].receipts[0]);
    expect(() => combine(duplicate)).toThrow('Duplicate');
    const { phase: _phase, ...legacy } = bundles()[0];
    expect(() => combinePortalPhaseReceipts(identity, contracts(), [legacy])).toThrow('phase');
    expect(() => combinePortalPhaseReceipts(identity, contracts(), [{ ...bundles()[0], phases: contracts().map(contract => contract.phase) }])).toThrow('bundle');
  });

  it.each(['runId', 'projectRef', 'organizationId', 'controlSha', 'deployedSha', 'baselineSha', 'planHash', 'repository', 'workflowRunId', 'workflowAttempt'] as const)('rejects foreign bundle and receipt %s', key => {
    const values = bundles(); values[0].identity[key] = 'foreign';
    expect(() => combine(values)).toThrow();
    const other = bundles(); other[0].receipts[0].identity[key] = 'foreign';
    expect(() => combine(other)).toThrow();
  });

  it('rejects unknown identity fields', () => {
    const values = bundles(); Object.assign(values[0].identity, { other: 'foreign' });
    expect(() => combine(values)).toThrow('identity');
  });

  it('copies only public case fields and rejects non-string reason metadata', () => {
    const values = bundles();
    Object.assign(values[0].receipts[0].cases[0], { reason: 'checked', token: 'must-not-be-carried', evidence: { secret: 'private' } });
    const result = combine(values);
    expect(result.receipts.find(receipt => receipt.lane === 'inventory-readiness')?.cases).toEqual([{ id: 'unassigned:inventory', status: 'passed', reason: 'checked' }]);
    Object.assign(values[0].receipts[0].cases[0], { reason: { secret: 'private' } });
    expect(() => combine(values)).toThrow('reason');
  });

  it('rejects incomplete, duplicated, or inconsistent trusted phase contracts', () => {
    expect(() => combine([], contracts().slice(0, 2))).toThrow('three');
    const duplicate = contracts(); duplicate[2] = duplicate[1];
    expect(() => combine([], duplicate)).toThrow('Duplicate');
    const blueprint = contracts(); blueprint[2].phase.blueprintHash = 'f'.repeat(64);
    expect(() => combine([], blueprint)).toThrow('blueprint');
    const ids = contracts(); ids[2].phase.ids.job = '55555555-5555-4555-8555-555555555555';
    expect(() => combine([], ids)).toThrow('reserved IDs');
  });

  it.each([
    {}, { 'member-routes': [] }, { 'five-role-actions': ['unassigned:action'] },
    { 'member-routes': ['member'] }, { 'member-routes': ['assigned-owner:member'] },
    { 'member-routes': ['unassigned:'] }, { 'member-routes': ['unassigned:member', 'unassigned:member'] },
    { 'member-routes': ['unassigned:member'], 'staff-comparison': ['unassigned:member'] },
  ])('rejects invalid trusted case contracts %#', expectedCases => {
    const trusted = contracts(); trusted[0].expectedCases = expectedCases as Record<string, string[]>;
    expect(() => combine([], trusted)).toThrow();
  });

  it.each(['failed', 'cancelled', 'timed-out', 'error'])('preserves %s lane/case outcomes', status => {
    const values = bundles(); values[1].receipts[0].status = status;
    expect(combine(values).receipts.find(receipt => receipt.lane === 'member-routes')?.status).toBe(status === 'error' ? 'error' : 'failed');
    const other = bundles(); other[1].receipts[0].cases[0].status = status;
    const receipt = combine(other).receipts.find(item => item.lane === 'member-routes')!;
    expect(receipt.status).toBe(status === 'error' ? 'error' : 'failed');
    expect(receipt.cases[1].status).toBe(status);
  });

  it.each(['incomplete', 'pending', 'running', 'skipped'])('never upgrades %s evidence to passed', status => {
    const values = bundles(); values[1].receipts[0].status = status;
    expect(combine(values).receipts.find(receipt => receipt.lane === 'member-routes')?.status).toBe('incomplete');
    const other = bundles(); other[1].receipts[0].cases[0].status = status;
    expect(combine(other).receipts.find(receipt => receipt.lane === 'member-routes')?.status).toBe('incomplete');
  });

  it('preserves both failure and read error cases when a lane contains both', () => {
    const values = bundles(); values[0].receipts.find(receipt => receipt.lane === 'member-routes')!.cases[0].status = 'failed';
    values[1].receipts[0].cases[0].status = 'error';
    const receipt = combine(values).receipts.find(item => item.lane === 'member-routes')!;
    expect(receipt.status).toBe('error');
    expect(receipt.cases.map(item => item.status)).toEqual(['failed', 'error', 'passed']);
  });

  it('rejects unexpected lanes, foreign phase cases, and duplicate cases', () => {
    const values = bundles(); values[0].receipts[0].lane = 'cleanup';
    expect(() => combine(values)).toThrow('lane');
    const other = bundles(); other[1].receipts[0].cases[0].id = 'approved-profile:member';
    expect(() => combine(other)).toThrow('case');
    const duplicate = bundles(); duplicate[0].receipts[0].cases.push(duplicate[0].receipts[0].cases[0]);
    expect(() => combine(duplicate)).toThrow('Duplicate');
  });

  it('rejects invalid bundle and receipt schemas, statuses, times, and case arrays', () => {
    const wrongKind = bundles(); wrongKind[0].kind = 'local-fixture-companion';
    expect(() => combine(wrongKind)).toThrow('bundle');
    const wrongVersion = bundles(); wrongVersion[0].schemaVersion = 2;
    expect(() => combine(wrongVersion)).toThrow('bundle');
    const mutations: Array<(receipt: Receipt) => void> = [
      receipt => { receipt.schemaVersion = 2; }, receipt => { receipt.status = 'success'; },
      receipt => { receipt.startedAt = 'invalid'; }, receipt => { receipt.completedAt = '2026-10-26T00:00:00Z'; },
      receipt => { receipt.cases[0].status = 'success'; }, receipt => { Object.assign(receipt, { cases: null }); },
      receipt => { Object.assign(receipt, { phase: undefined }); },
    ];
    for (const mutate of mutations) {
      const values = bundles(); mutate(values[0].receipts[0]);
      expect(() => combine(values)).toThrow();
    }
  });
});

describe('local fixture companion mapping for combined phase evidence', () => {
  it('maps only trusted legacy fixture IDs to unassigned and keeps the combined ID', () => {
    const { hosted, local, expected } = localFixtureSetup();
    const receipts = mergeLocalFixtureCompanion(hosted, local, identity, expected);
    const fixture = receipts.find((receipt: { lane: string }) => receipt.lane === 'fixture-render-matrix')!;
    expect(fixture.status).toBe('passed');
    expect(fixture.cases).toEqual([{ id: 'unassigned:fixture:hosted', status: 'passed' }, { id: 'unassigned:fixture:local', status: 'passed' }]);
    expect(hosted.receipts.find(receipt => receipt.lane === 'fixture-render-matrix')?.status).toBe('incomplete');
    expect(local.receipts[0].cases[0].id).toBe('fixture:local');
  });

  it('does not remove arbitrary prefixes or accept already-prefixed local IDs', () => {
    const { hosted, local, expected } = localFixtureSetup();
    local.receipts[0].cases[0].id = 'unassigned:fixture:local';
    expect(() => mergeLocalFixtureCompanion(hosted, local, identity, expected)).toThrow('coverage');
    expect(() => mergeLocalFixtureCompanion(hosted, local, identity, ['assigned-owner:fixture:local'])).toThrow('unassigned');
  });

  it('maps only public local case fields and rejects non-string reasons', () => {
    const { hosted, local, expected } = localFixtureSetup();
    Object.assign(local.receipts[0].cases[0], { reason: 'local proof', token: 'must-not-be-carried' });
    const fixture = mergeLocalFixtureCompanion(hosted, local, identity, expected).find((receipt: { lane: string }) => receipt.lane === 'fixture-render-matrix')!;
    expect(fixture.cases[1]).toEqual({ id: 'unassigned:fixture:local', status: 'passed', reason: 'local proof' });
    Object.assign(local.receipts[0].cases[0], { reason: null });
    expect(() => mergeLocalFixtureCompanion(hosted, local, identity, expected)).toThrow('reason');
  });

  it('requires valid combined phases and excludes local phase descriptors', () => {
    const { hosted, local, expected } = localFixtureSetup();
    expect(() => mergeLocalFixtureCompanion({ ...hosted, phases: hosted.phases.slice(0, 2) }, local, identity, expected)).toThrow('three');
    expect(() => mergeLocalFixtureCompanion(hosted, { ...local, phase: contracts()[0].phase }, identity, expected)).toThrow('companion');
    Object.assign(local.receipts[0], { phase: contracts()[0].phase });
    expect(() => mergeLocalFixtureCompanion(hosted, local, identity, expected)).toThrow('receipt');
  });

  it('does not map raw local IDs into a single-phase or unphased bundle', () => {
    const { hosted, local, expected } = localFixtureSetup();
    const { phases: _phases, ...unphased } = hosted;
    expect(() => mergeLocalFixtureCompanion(unphased, local, identity, expected)).toThrow('coverage');
    expect(() => mergeLocalFixtureCompanion({ ...unphased, phase: contracts()[0].phase }, local, identity, expected)).toThrow('coverage');
  });

  it('cannot repair missing phase evidence or replace hosted failure', () => {
    const { local, expected } = localFixtureSetup();
    const missing = combine(bundles().slice(1));
    expect(() => mergeLocalFixtureCompanion(missing, local, identity, expected)).toThrow('Cannot replace');
    const { hosted } = localFixtureSetup();
    hosted.receipts.find(receipt => receipt.lane === 'fixture-render-matrix')!.cases[1].status = 'failed';
    expect(() => mergeLocalFixtureCompanion(hosted, local, identity, expected)).toThrow('Cannot replace');
  });

  it.each(['failed', 'error', 'incomplete'])('preserves %s local evidence after mapping', status => {
    const { hosted, local, expected } = localFixtureSetup();
    local.receipts[0].status = status; local.receipts[0].cases[0].status = status;
    const receipt = mergeLocalFixtureCompanion(hosted, local, identity, expected).find((item: { lane: string }) => item.lane === 'fixture-render-matrix')!;
    expect(receipt.status).toBe(status);
    expect(receipt.cases[1]).toEqual({ id: 'unassigned:fixture:local', status });
  });
});
