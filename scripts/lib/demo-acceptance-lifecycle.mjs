/** Durable orchestration. Dependencies are explicit; this module has no clients or credentials. */
import { digest } from './demo-acceptance-journal.mjs';
import { FIVE_ROLES, emailFor, partnerSlugFor, runIdFor } from './five-role-acceptance.mjs';

export const FIXTURE_PLAN_VERSION = 2;
export const REQUIRED_SCENARIOS = Object.freeze([
  'member-goal', 'counselor-note', 'admin-note', 'employer-profile', 'partner-profile',
  'member-location', 'member-notifications', 'member-message-read',
  'member-preassessment-incomplete', 'member-preassessment-completed',
]);

export function fixturePlan(runId, organizationId) {
  if (!/^\d{1,20}-1$/.test(runId)) throw new Error('Invalid first-attempt fixture run.');
  return {
    version: FIXTURE_PLAN_VERSION, runId, organizationId,
    users: Object.fromEntries(FIVE_ROLES.map(role => [role, { email: emailFor(runId, role), role, preimage: null }])),
    partner: { slug: partnerSlugFor(runId), preimage: null },
    databaseRows: ['User', 'UserRole', 'Profile', 'Counselor', 'CounselorAssignment', 'Employer', 'Partner', 'PartnerUser', 'MessageThread', 'MemberEvent'],
    memberState: { assessmentCompleted: false, seededLoginEvents: 6, notificationsUpdates: true, notificationsReminders: true, memberLastReadAt: null },
    scenarios: REQUIRED_SCENARIOS,
    // No provider, invitation, test-email, enrollment, mentor approval or product assessment scoring.
    providerActions: false, emailActions: false,
  };
}

export function identityFromEnvironment(env) {
  const runId = runIdFor(env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT);
  const identity = {
    repository: env.GITHUB_REPOSITORY, workflowRunId: env.GITHUB_RUN_ID, workflowAttempt: 1,
    runId, projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: env.PORTAL_QA_ORGANIZATION_ID,
    controlSha: env.GITHUB_SHA, deployedSha: env.DEMO_QA_APP_SHA, baselineSha: env.DEMO_QA_BASELINE_SHA,
    planHash: digest(fixturePlan(runId, env.PORTAL_QA_ORGANIZATION_ID)),
  };
  if (identity.repository !== 'workforceap/workforceap-beta' || env.GITHUB_REF !== 'refs/heads/master') {
    throw new Error('Only the trusted repository master workflow may own fixtures.');
  }
  for (const key of ['controlSha', 'deployedSha', 'baselineSha']) {
    if (!/^[a-f0-9]{40}$/.test(identity[key] ?? '')) throw new Error(`Missing immutable ${key}.`);
  }
  return identity;
}

export function fixtureStateFromJournal(state) {
  const entries = state.events.filter(event => event.data?.fixtureState);
  const latest = entries.at(-1)?.data.fixtureState;
  if (!latest || latest.runId !== state.identity.runId || latest.organizationId !== state.identity.organizationId) {
    throw new Error('The durable journal has no matching fixture state.');
  }
  const fixture = structuredClone(latest);
  for (const event of state.events) {
    const role = event.data?.operationId?.match(/^auth-create:(member|counselor|admin|employer|partner)$/)?.[1];
    if (role && event.kind === 'confirmed' && event.data.observed?.id) {
      fixture.users[role] = { userId: event.data.observed.id, email: emailFor(state.identity.runId, role) };
      if (fixture.pending === role) delete fixture.pending;
    }
  }
  return fixture;
}

export function pendingOperations(state) {
  const pending = new Map();
  for (const event of state.events) {
    const id = event.data?.operationId;
    if (!id) continue;
    if (['intent', 'cleanup-intent'].includes(event.kind)) pending.set(id, event);
    if (['confirmed', 'cleanup-confirmed', 'db-committed'].includes(event.kind)) pending.delete(id);
  }
  return [...pending.values()];
}

/** A timeout never establishes absence or permission to repeat a mutation. */
export function createLifecycle(journal, identity, owner) {
  let state;
  const current = async () => {
    const next = await journal.read(identity.runId);
    if (next.owner !== owner || next.identity.planHash !== identity.planHash) throw new Error('Run ownership changed.');
    if (state && state.revision !== next.revision) throw new Error('Concurrent journal writer detected.');
    state = next;
    return state;
  };
  const append = async (kind, data) => {
    await current();
    state = await journal.append(identity.runId, owner, state.revision, kind, data);
    return state;
  };
  return {
    async claim() {
      state = await journal.claim(identity, owner);
      await append('confirmed', { operationId: 'fixture-plan', plan: fixturePlan(identity.runId, identity.organizationId),
        fixtureState: { runId: identity.runId, organizationId: identity.organizationId, users: {} } });
      return state;
    },
    current, append,
    adopt(next) {
      if (next.owner !== owner || next.identity.planHash !== identity.planHash || (state && next.revision !== state.revision + 1)) throw new Error('Invalid atomic journal continuation.');
      state = next;
    },
    async saveFixture(fixtureState) { return append('confirmed', { fixtureState }); },
    async write(operationId, preimage, expectedPostimage, call, verify, { cleanup = false } = {}) {
      await current();
      if (state.events.some(event => event.data?.operationId === operationId && ['intent', 'cleanup-intent'].includes(event.kind))) {
        throw new Error('This operation was already attempted; reconcile it instead of replaying it.');
      }
      if (!cleanup && pendingOperations(state).length) throw new Error('An unresolved write is quarantined.');
      await append(cleanup ? 'cleanup-intent' : 'intent', { operationId, preimage, expectedPostimage });
      try {
        const result = await call();
        await current(); // A handoff during HTTP execution cannot authorize a stale confirmation.
        const observed = await verify(result);
        if (observed === false || observed == null) throw new Error('Mutation readback did not match.');
        await append(cleanup ? 'cleanup-confirmed' : 'confirmed', { operationId, observed });
        return result;
      } catch {
        // If journal access also failed the durable intent remains authoritative.
        await append('quarantined', { operationId, reason: 'outcome-unknown' }).catch(() => {});
        throw new Error(`Operation ${operationId} is quarantined; no automatic retry is allowed.`);
      }
    },
    async reconcile(operationId, readExact) {
      await current();
      const pending = pendingOperations(state).find(event => event.data.operationId === operationId);
      if (!pending) throw new Error('No unresolved intent exists for this exact operation.');
      // The reader must distinguish proven absent from unreadable, and enforce exact run metadata.
      const observed = await readExact(pending.data);
      if (!observed || !['owned', 'absent'].includes(observed.outcome)) throw new Error('Outcome remains unknown.');
      await append('confirmed', { operationId, observed, recovered: true });
      return observed;
    },
  };
}

/** Only authoritative GitHub completion is accepted here. No elapsed-time takeover. */
export async function terminalRunProof(identity, fetchRun) {
  const run = await fetchRun(identity.workflowRunId);
  if (!run || String(run.id) !== identity.workflowRunId || run.repository?.full_name !== identity.repository ||
      run.head_sha !== identity.controlSha || run.run_attempt !== 1 || run.status !== 'completed' || !run.conclusion) {
    throw new Error('Original workflow is not authoritatively terminal.');
  }
  return { source: 'github', repository: identity.repository, runId: identity.workflowRunId,
    status: 'completed', conclusion: run.conclusion, observedAt: new Date().toISOString() };
}

export function assertCleanupQuiescent(state) {
  const pending = pendingOperations(state);
  // A terminal GitHub worker does not prove an outstanding provider/app request stopped.
  // No server execution bound is assumed. Such a run requires exact reconciliation first.
  if (pending.length) throw new Error('Cleanup is quarantined while an original write outcome is unresolved.');
}
