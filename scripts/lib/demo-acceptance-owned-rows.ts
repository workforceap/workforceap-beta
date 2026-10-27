import { Prisma, type PrismaClient } from '@prisma/client';
import { canonical } from './demo-acceptance-journal.mjs';
import { emailFor, writtenValueFor } from './five-role-acceptance.mjs';
import type { FixtureState, Role } from '../five-role-demo-fixture';

type Row = Record<string, unknown> & { id: string };
export type OwnedGraph = Record<string, Row[]>;
type Reader = PrismaClient | Prisma.TransactionClient;
type Delegate = { findMany(input: { where: unknown }): Promise<Row[]> };
const RETAINED = new Set(['AuditLog', 'AuditEvent', 'WorkflowDiagnostic']);
const ALLOWED = new Set(['User', 'Profile', 'UserRole', 'Counselor', 'CounselorAssignment', 'Employer', 'Partner',
  'PartnerUser', 'MessageThread', 'Message', 'Goal', 'CounselorNote', 'MemberEvent']);
const VOLATILE = new Set(['createdAt', 'updatedAt', 'lastLoginAt']);
function rowsFor(db: Reader, model: string) {
  return (db as unknown as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)];
}
function sanitized(row: Row, model: string): Row {
  const keys = Prisma.dmmf.datamodel.models.find(item => item.name === model)?.primaryKey?.fields;
  const id = row.id ?? (keys?.length ? canonical(keys.map(key => row[key])) : undefined);
  if (!id) throw new Error(`Unidentifiable ${model} row; cleanup refused.`);
  return JSON.parse(JSON.stringify({ ...Object.fromEntries(Object.entries(row).filter(([key]) => !VOLATILE.has(key))), id })) as Row;
}

/** Enumerate every FK reachable from an owned root. A new relation fails closed by default. */
export async function readOwnedGraph(db: Reader, state: FixtureState): Promise<OwnedGraph> {
  const graph: OwnedGraph = {};
  const allowed = new Set(ALLOWED);
  const phaseIds: Record<string, string> = {};
  if (state.phase && state.phase.name !== 'unassigned') {
    Object.assign(phaseIds, { AIToolResult: state.phase.ids.counselorResult, CourseEnrollment: state.phase.ids.enrollment, Mentor: state.phase.ids.mentor });
    if (state.phase.name === 'approved-profile') phaseIds.Job = state.phase.ids.job;
    for (const model of Object.keys(phaseIds)) allowed.add(model);
  }
  const roots: Record<string, string[]> = {
    User: Object.values(state.users).map(user => user!.userId),
    Partner: state.partnerId ? [state.partnerId] : [], Employer: state.employerId ? [state.employerId] : [],
  };
  for (const [model, ids] of Object.entries(roots)) {
    graph[model] = ids.length ? (await rowsFor(db, model).findMany({ where: { id: { in: ids } } })).map(row => sanitized(row, model)).sort((a, b) => a.id.localeCompare(b.id)) : [];
  }
  for (const row of graph.User) {
    const role = (Object.keys(state.users) as Role[]).find(key => state.users[key]?.userId === row.id);
    if (!role || row.email !== emailFor(state.runId, role) || row.organizationId !== state.organizationId) {
      throw new Error('Foreign identity in fixture graph.');
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const model of Prisma.dmmf.datamodel.models) {
      if (RETAINED.has(model.name)) continue;
      const clauses = model.fields.flatMap(field => {
        const ids = graph[field.type]?.map(row => row.id) ?? [];
        if (field.kind !== 'object' || field.relationFromFields?.length !== 1 || !ids.length) return [];
        return [{ [field.relationFromFields[0]]: { in: ids } }];
      });
      if (!clauses.length) continue;
      const found = await rowsFor(db, model.name).findMany({ where: { OR: clauses } });
      if (found.length && !allowed.has(model.name)) throw new Error(`Unexpected related ${model.name}; cleanup refused.`);
      const known = new Map((graph[model.name] ?? []).map(row => [row.id, row]));
      for (const raw of found) {
        const row = sanitized(raw, model.name);
        if (phaseIds[model.name] && row.id !== phaseIds[model.name]) throw new Error(`Foreign ${model.name} phase record; cleanup refused.`);
        if (roots[model.name] && !roots[model.name].includes(row.id)) throw new Error(`Foreign ${model.name} root reached through a relationship.`);
        if (!known.has(row.id)) { known.set(row.id, row); changed = true; }
      }
      if (known.size) graph[model.name] = [...known.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
  }
  // Every reference between deletable models must remain inside this run's graph.
  for (const model of Prisma.dmmf.datamodel.models) {
    for (const row of graph[model.name] ?? []) for (const field of model.fields) {
      if (field.kind !== 'object' || field.relationFromFields?.length !== 1 || !allowed.has(field.type)) continue;
      const value = row[field.relationFromFields[0]];
      if (value !== null && value !== undefined && !(graph[field.type] ?? []).some(parent => parent.id === value)) {
        throw new Error(`Foreign ${field.type} relationship in ${model.name}; cleanup refused.`);
      }
    }
  }
  return graph;
}

export function assertGraphUnchanged(expected: OwnedGraph, actual: OwnedGraph) {
  if (canonical(expected) !== canonical(actual)) throw new Error('Owned fixture fields or dependents drifted; cleanup refused.');
}

/** Login analytics are asynchronous. Every observed row needs a prior exact-user login intent. */
export function assertJournaledLoginEvents(graph: OwnedGraph, fixture: FixtureState, seededIds: string[], allowedCounts: Record<string, number>) {
  const counts: Record<string, number> = {};
  const users = new Set(Object.values(fixture.users).map(user => user!.userId));
  for (const row of graph.MemberEvent ?? []) {
    if (row.eventName !== 'member_logged_in' || seededIds.includes(row.id)) continue;
    if (!users.has(row.userId as string) || row.sourcePage !== '/login' || row.entityType !== null || row.entityId !== null) throw new Error('Unowned login event; cleanup refused.');
    const userId = row.userId as string;
    counts[userId] = (counts[userId] ?? 0) + 1;
    if (counts[userId] > (allowedCounts[userId] ?? 0)) throw new Error('Login event lacks a durable attempt; cleanup refused.');
  }
}

/** Allow only the one documented scenario's writes; unknown application side effects remain red. */
export function assertGraphTransition(before: OwnedGraph, after: OwnedGraph, operation: string, state: FixtureState) {
  const created = (model: string) => (after[model] ?? []).filter(row => !(before[model] ?? []).some(old => old.id === row.id));
  if (operation === 'member-goal' && created('Goal').length !== 1) throw new Error('Goal action did not create exactly one record.');
  if (['counselor-note', 'admin-note'].includes(operation) && created('CounselorNote').length !== 1) throw new Error('Note action did not create exactly one record.');
  const fields: Record<string, Record<string, string[]>> = {
    'member-location': { Profile: ['city', 'state', 'zip'] },
    'member-notifications': { User: ['notificationsUpdates', 'notificationsReminders'] },
    'member-message-read': { MessageThread: ['memberLastReadAt'] },
    'employer-profile': { Employer: ['companyName'] }, 'partner-profile': { Partner: ['name'] },
    'member-preassessment-completed': { User: ['assessmentCompleted', 'assessmentCompletedAt', 'assessmentScore', 'assessmentScorePct'] },
  };
  const allowed = fields[operation] ?? {};
  for (const [model, rows] of Object.entries(before)) {
    for (const row of rows) {
      const next = after[model]?.find(candidate => candidate.id === row.id);
      if (!next) throw new Error('An application action deleted an owned fixture.');
      const target = model === 'User' ? row.id === state.users.member?.userId
        : model === 'Profile' ? row.userId === state.users.member?.userId
          : model === 'MessageThread' ? row.memberId === state.users.member?.userId
            : model === 'Employer' ? row.id === state.employerId
              : model === 'Partner' ? row.id === state.partnerId : false;
      const permitted = target ? allowed[model] ?? [] : [];
      const omit = (value: Row) => Object.fromEntries(Object.entries(value).filter(([key]) => !permitted.includes(key)));
      if (canonical(omit(row)) !== canonical(omit(next))) throw new Error(`Unexpected ${model} field change.`);
    }
  }
  for (const [model, rows] of Object.entries(after)) for (const row of rows) {
    if (before[model]?.some(old => old.id === row.id)) continue;
    if (model === 'MemberEvent' && Object.values(state.users).some(user => user?.userId === row.userId) && row.eventName === 'member_logged_in' && row.sourcePage === '/login' && row.entityType === null && row.entityId === null) continue;
    if (operation === 'member-goal' && model === 'Goal' && row.userId === state.users.member?.userId &&
        row.title === writtenValueFor(state.runId, 'member') && row.goalType === 'wap6_qa') continue;
    if (operation === 'member-goal' && model === 'MemberEvent' && row.userId === state.users.member?.userId &&
        row.eventName === 'goal_created' && after.Goal?.some(goal => goal.id === row.entityId)) continue;
    const role = operation === 'counselor-note' ? 'counselor' : operation === 'admin-note' ? 'admin' : null;
    if (role && model === 'CounselorNote' && row.memberId === state.users.member?.userId &&
        row.authorId === state.users[role]?.userId && row.content === writtenValueFor(state.runId, role)) continue;
    throw new Error(`Unexpected new ${model} row from ${operation}.`);
  }
}
