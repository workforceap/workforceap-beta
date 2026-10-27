import type { Prisma } from '@prisma/client';
import { upsertEquivalentCourseEnrollment } from '../../lib/member/courseEnrollmentAssignment';
import { canonical, digest } from './demo-acceptance-journal.mjs';
import { validatePhaseBlueprint, assertPhaseApproval, phaseBlueprintHash, PHASE_NAMES } from './demo-acceptance-phase-plan.mjs';
import { readOwnedGraph, assertGraphUnchanged, type OwnedGraph } from './demo-acceptance-owned-rows';
import type { FixtureState, FixturePhase, PhaseName } from '../five-role-demo-fixture';

export type PhaseBlueprint = ReturnType<typeof validatePhaseBlueprint>;
const models = ['AIToolResult', 'CourseEnrollment', 'Mentor', 'Job'] as const;

export function phaseDescriptor(blueprint: PhaseBlueprint, name: PhaseName, graph: OwnedGraph): FixturePhase {
  return { name, blueprintHash: phaseBlueprintHash(blueprint), stateDigest: digest(graph), ids: blueprint.ids };
}

export function expectedPhaseRows(blueprint: PhaseBlueprint, state: FixtureState, phase: PhaseName): OwnedGraph {
  const rows: OwnedGraph = { AIToolResult: [], CourseEnrollment: [], Mentor: [], Job: [] };
  if (phase === 'unassigned') return rows;
  const member = state.users.member?.userId, admin = state.users.admin?.userId;
  if (!member || !admin || !state.employerId) throw new Error('Phase actors must be resolved from the durable five-role fixture.');
  rows.AIToolResult = [{ id: blueprint.ids.counselorResult, userId: member, ...blueprint.savedResult, parentToolResultId: null }];
  rows.CourseEnrollment = [{ id: blueprint.ids.enrollment, organizationId: state.organizationId, userId: member,
    ...blueprint.assignment, enrolledAt: blueprint.fixtureAsOf, enrolledByAdminId: admin, fundingSource: null, fundingNotes: null,
    workspaceEmailProvisioned: false, workspaceEmail: null, sponsoredByPartnerId: null }];
  rows.Mentor = [{ id: blueprint.ids.mentor, userId: member, ...blueprint.mentor,
    ...(phase === 'approved-profile' ? { isActive: true, approvedAt: blueprint.fixtureAsOf } : {}) }];
  if (phase === 'approved-profile') rows.Job = [{ id: blueprint.ids.job, organizationId: state.organizationId, employerId: state.employerId,
    ...blueprint.job, location: null, locationType: 'onsite', jobType: 'fulltime', salaryMin: null, salaryMax: null,
    importProvider: null, importMethod: null, minimumAge: null, youthAppropriate: false, requiresWorkPermit: false,
    approvedAt: blueprint.fixtureAsOf, approvedById: admin, aiMatchesComputedAt: null,
    matchSuggestionsLastSentAt: null, matchSuggestionsLastStatus: null, matchSuggestionsLastError: null }];
  return rows;
}

export function assertPhaseRows(blueprint: PhaseBlueprint, state: FixtureState, graph: OwnedGraph) {
  if (!state.phase || state.phase.blueprintHash !== phaseBlueprintHash(blueprint) || canonical(state.phase.ids) !== canonical(blueprint.ids)) throw new Error('Phase state is not bound to the reviewed blueprint.');
  const expected = expectedPhaseRows(blueprint, state, state.phase.name);
  for (const model of models) if (canonical(graph[model] ?? []) !== canonical(expected[model])) throw new Error(`Synthetic ${model} differs from the exact reviewed phase.`);
}

/** All mutations and their returned evidence must be committed by journal.atomic. No external calls. */
export async function transitionPhaseRows(tx: Prisma.TransactionClient, state: FixtureState, before: OwnedGraph, blueprint: PhaseBlueprint, next: PhaseName, approval: unknown, now = Date.now()) {
  validatePhaseBlueprint(blueprint, blueprint);
  if (state.runId !== blueprint.runId || state.organizationId !== blueprint.organizationId) throw new Error('Phase blueprint targets another run.');
  const proof = assertPhaseApproval(approval, blueprint, next, { now });
  if (!state.phase || (next === 'assigned-owner' && state.phase.name !== 'unassigned') || (next === 'approved-profile' && state.phase.name !== 'assigned-owner') || next === 'unassigned') throw new Error('Phase transition is not the prescribed next step.');
  assertGraphUnchanged(before, await readOwnedGraph(tx, state));
  assertPhaseRows(blueprint, state, before);
  const member = state.users.member!.userId, admin = state.users.admin!.userId;
  if (next === 'assigned-owner') {
    const collisions = await Promise.all([
      tx.aIToolResult.count({ where: { OR: [{ id: blueprint.ids.counselorResult }, { userId: member }] } }),
      tx.courseEnrollment.count({ where: { OR: [{ id: blueprint.ids.enrollment }, { userId: member }] } }),
      tx.mentor.count({ where: { OR: [{ id: blueprint.ids.mentor }, { userId: member }] } }),
      tx.job.count({ where: { id: blueprint.ids.job } }), tx.courseProgress.count({ where: { userId: member } }), tx.memberProgramProgress.count({ where: { userId: member } }),
    ]);
    if (collisions.some(count => count !== 0)) throw new Error('Existing phase records or progress cannot be adopted.');
    await tx.aIToolResult.create({ data: { id: blueprint.ids.counselorResult, userId: member, ...blueprint.savedResult, toolType: 'career_counselor', createdAt: new Date(blueprint.fixtureAsOf), parentToolResultId: null } });
    const enrollment = await upsertEquivalentCourseEnrollment(tx, { userId: member, programSlug: blueprint.assignment.programSlug,
      create: { id: blueprint.ids.enrollment, organizationId: state.organizationId, curriculumVersion: blueprint.assignment.curriculumVersion,
        isPrimary: true, enrolledAt: new Date(blueprint.fixtureAsOf), enrolledByAdminId: admin, fundingSource: null, fundingNotes: null,
        workspaceEmailProvisioned: false, workspaceEmail: null, sponsoredByPartnerId: null }, update: {} });
    if (enrollment.assignmentOutcome !== 'created' || enrollment.id !== blueprint.ids.enrollment || enrollment.curriculumVersion !== 'legacy-v1') throw new Error('Canonical assignment did not create the reserved synthetic enrollment.');
    await tx.mentor.create({ data: { id: blueprint.ids.mentor, userId: member, ...blueprint.mentor, createdAt: new Date(blueprint.fixtureAsOf) } });
  } else {
    const changed = await tx.mentor.updateMany({ where: { id: blueprint.ids.mentor, userId: member, isActive: false, approvedAt: null }, data: { isActive: true, approvedAt: new Date(blueprint.fixtureAsOf) } });
    if (changed.count !== 1 || await tx.job.count({ where: { id: blueprint.ids.job } })) throw new Error('Exposure transition compare-and-set failed.');
    await tx.job.create({ data: { id: blueprint.ids.job, organizationId: state.organizationId, employerId: state.employerId!, ...blueprint.job,
      status: 'live', expiresAt: new Date(blueprint.job.expiresAt), approvedAt: new Date(blueprint.fixtureAsOf), approvedById: admin, createdAt: new Date(blueprint.fixtureAsOf) } });
  }
  const nextState: FixtureState = { ...state, phase: phaseDescriptor(blueprint, next, before) };
  const ownedGraph = await readOwnedGraph(tx, nextState);
  nextState.phase = phaseDescriptor(blueprint, next, ownedGraph);
  assertPhaseRows(blueprint, nextState, ownedGraph);
  const omitPhases = (graph: OwnedGraph) => Object.fromEntries(Object.entries(graph).filter(([name]) => !(models as readonly string[]).includes(name)));
  assertGraphUnchanged(omitPhases(before), omitPhases(ownedGraph));
  return { result: nextState, evidence: { fixtureState: nextState, phase: nextState.phase, ownedGraph, approval: proof, fixtureSetupOnly: true } };
}

/** Call only after an exact graph CAS inside the journal cleanup transaction. */
export async function deletePhaseRows(tx: Prisma.TransactionClient, state: FixtureState, graph: OwnedGraph) {
  if (!state.phase) return;
  const operations = [
    ['Job', (ids: string[]) => tx.job.deleteMany({ where: { id: { in: ids } } })],
    ['Mentor', (ids: string[]) => tx.mentor.deleteMany({ where: { id: { in: ids } } })],
    ['AIToolResult', (ids: string[]) => tx.aIToolResult.deleteMany({ where: { id: { in: ids } } })],
    ['CourseEnrollment', (ids: string[]) => tx.courseEnrollment.deleteMany({ where: { id: { in: ids } } })],
  ] as const;
  for (const [model, remove] of operations) {
    const ids = graph[model]?.map(row => row.id) ?? [];
    if (!ids.length) continue;
    const result = await remove(ids);
    if (result.count !== ids.length) throw new Error('Phase cleanup row count changed.');
  }
}

/** Direct reserved-ID queries also prove absence after roots and nullable relationships disappear. */
export async function verifyPhaseAbsence(tx: Prisma.TransactionClient, state: FixtureState) {
  if (!state.phase) return undefined;
  const ids = state.phase.ids;
  const counts = await Promise.all([tx.aIToolResult.count({ where: { id: ids.counselorResult } }),
    tx.courseEnrollment.count({ where: { id: ids.enrollment } }), tx.mentor.count({ where: { id: ids.mentor } }), tx.job.count({ where: { id: ids.job } })]);
  if (counts.some(count => count !== 0)) throw new Error('A reserved synthetic phase record remains.');
  return { ids, absent: true };
}

type PhaseJournalEvent = { kind: string; data?: { operationId?: string; phase?: FixturePhase; fixtureState?: FixtureState; ownedGraph?: OwnedGraph; approval?: ReturnType<typeof assertPhaseApproval> } };
/** Missing checkpoints produce explicit unreached descriptors, never a successful phase assertion. */
export function phaseCheckpointsFromJournal(events: PhaseJournalEvent[], blueprint: PhaseBlueprint, approval: unknown) {
  const issues: string[] = [];
  let last = -1;
  const phases = PHASE_NAMES.map(name => {
    const matches = events.map((event, index) => ({ event, index })).filter(({ event }) => event.kind === 'db-committed' && event.data?.operationId === `phase:${name}`);
    if (matches.length !== 1) {
      issues.push(`phase:${name}:checkpoint_missing_or_duplicate`);
      return { name, blueprintHash: phaseBlueprintHash(blueprint), ids: blueprint.ids, stateDigest: digest({ unreachedPhase: name, blueprintHash: phaseBlueprintHash(blueprint) }) } as FixturePhase;
    }
    const { event, index } = matches[0];
    const data = event.data!;
    try {
      if (index <= last || !data.phase || !data.fixtureState || !data.ownedGraph || !data.approval || data.phase.name !== name || canonical(data.phase) !== canonical(data.fixtureState.phase) || data.phase.stateDigest !== digest(data.ownedGraph)) throw new Error('Phase evidence is inconsistent.');
      const proof = assertPhaseApproval(approval, blueprint, name, { now: Date.parse(data.approval.checkedAt) });
      if (canonical(proof) !== canonical(data.approval)) throw new Error('Phase approval differs from the exact reviewed contract.');
      assertPhaseRows(blueprint, data.fixtureState, data.ownedGraph);
    } catch { issues.push(`phase:${name}:checkpoint_invalid`); }
    last = index;
    return data.phase ?? { name, blueprintHash: phaseBlueprintHash(blueprint), ids: blueprint.ids, stateDigest: digest({ invalidPhase: name }) } as FixturePhase;
  });
  return { phases, issues };
}
