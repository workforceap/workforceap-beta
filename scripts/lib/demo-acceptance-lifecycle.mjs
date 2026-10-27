/** Durable orchestration. Dependencies are explicit; this module has no clients or credentials. */
import { digest } from './demo-acceptance-journal.mjs';
import { FIVE_ROLES, emailFor, partnerSlugFor, runIdFor } from './five-role-acceptance.mjs';
import { readFileSync } from 'node:fs';
import { PHASE_NAMES, validatePhaseBlueprint } from './demo-acceptance-phase-plan.mjs';

export const FIXTURE_PLAN_VERSION = 2;
export const REQUIRED_SCENARIOS = Object.freeze([
  'member-goal', 'counselor-note', 'admin-note', 'employer-profile', 'partner-profile',
  'member-location', 'member-notifications', 'member-message-read',
  'member-preassessment-incomplete', 'member-preassessment-completed',
]);
export function assertAcceptanceAction(operation, mode) {
  const allowed = [...REQUIRED_SCENARIOS.slice(0, 8), ...FIVE_ROLES.map(role => `login:${role}`),
    ...['candidate', 'baseline'].flatMap(kind => FIVE_ROLES.map(role => `browser-login:${kind}:${role}`)),
    ...PHASE_NAMES.flatMap(phase => ['candidate', 'baseline'].flatMap(kind => FIVE_ROLES.map(role => `browser-login:${phase}:${kind}:${role}`)))];
  if (mode !== 'acceptance' || !allowed.includes(operation)) throw new Error('Operation is not an approved acceptance action.');
}

export function loginRole(operation) {
  const match = /^(?:login:|browser-login:(?:(?:unassigned|assigned-owner|approved-profile):)?(?:candidate|baseline):)(member|counselor|admin|employer|partner)$/.exec(operation);
  return match?.[1] ?? null;
}

export function fixturePlan(runId, organizationId, phaseBlueprint = undefined) {
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
    ...(phaseBlueprint ? { phaseBlueprint } : {}),
  };
}

export function phaseBlueprintFromEnvironment(env) {
  if (!env.DEMO_QA_PHASE_PLAN_FILE) return undefined;
  const blueprint = JSON.parse(readFileSync(env.DEMO_QA_PHASE_PLAN_FILE, 'utf8'));
  return validatePhaseBlueprint(blueprint, { runId: runIdFor(env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT), organizationId: env.PORTAL_QA_ORGANIZATION_ID, controlSha: env.GITHUB_SHA, baselineSha: env.DEMO_QA_BASELINE_SHA });
}

export function identityFromEnvironment(env) {
  const runId = runIdFor(env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT);
  const identity = {
    repository: env.GITHUB_REPOSITORY, workflowRunId: env.GITHUB_RUN_ID, workflowAttempt: 1,
    runId, projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: env.PORTAL_QA_ORGANIZATION_ID,
    controlSha: env.GITHUB_SHA, deployedSha: env.DEMO_QA_APP_SHA, baselineSha: env.DEMO_QA_BASELINE_SHA,
    planHash: digest(fixturePlan(runId, env.PORTAL_QA_ORGANIZATION_ID, phaseBlueprintFromEnvironment(env))),
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
    if (role && ['confirmed', 'failed-confirmed'].includes(event.kind) && event.data.observed?.id) {
      fixture.users[role] = { userId: event.data.observed.id, email: emailFor(state.identity.runId, role) };
      if (fixture.pending === role) delete fixture.pending;
    }
    if (role && event.kind === 'failed-confirmed' && event.data.observed?.outcome === 'absent' && fixture.pending === role) delete fixture.pending;
  }
  return fixture;
}

export function pendingOperations(state) {
  const pending = new Map();
  for (const event of state.events) {
    const id = event.data?.operationId;
    if (!id) continue;
    if (['intent', 'cleanup-intent'].includes(event.kind)) pending.set(id, event);
    if (['confirmed', 'cleanup-confirmed', 'failed-confirmed', 'db-committed'].includes(event.kind)) pending.delete(id);
  }
  return [...pending.values()];
}

/** A timeout never establishes absence or permission to repeat a mutation. */
export function createLifecycle(journal, identity, owner, plan = fixturePlan(identity.runId, identity.organizationId)) {
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
      if (digest(plan) !== identity.planHash) throw new Error('Creation plan does not match immutable identity.');
      state = await journal.claim(identity, owner);
      await append('confirmed', { operationId: 'fixture-plan', plan,
        fixtureState: { runId: identity.runId, organizationId: identity.organizationId, users: {} } });
      return state;
    },
    current, append,
    adopt(next) {
      if (next.owner !== owner || next.identity.planHash !== identity.planHash || (state && next.revision !== state.revision + 1)) throw new Error('Invalid atomic journal continuation.');
      state = next;
    },
    async saveFixture(fixtureState) { return append('confirmed', { fixtureState }); },
    /** @param {{cleanup?: boolean, deferDispatch?: boolean, readKnownFailure?: () => Promise<any>}} options */
    async write(operationId, preimage, expectedPostimage, call, verify, options = {}) {
      const { cleanup = false, deferDispatch = false, readKnownFailure } = options;
      await current();
      if (state.events.some(event => event.data?.operationId === operationId && ['intent', 'cleanup-intent'].includes(event.kind))) {
        throw new Error('This operation was already attempted; reconcile it instead of replaying it.');
      }
      if (!cleanup && pendingOperations(state).length) throw new Error('An unresolved write is quarantined.');
      await append(cleanup ? 'cleanup-intent' : 'intent', { operationId, preimage, expectedPostimage });
      let responseReceived = false;
      let dispatched = false;
      const beforeSend = async () => {
        if (dispatched) throw new Error('This operation already dispatched; a second send is forbidden.');
        await append('dispatch-started', { operationId });
        dispatched = true;
      };
      const observeResponse = async ({ status } = {}) => {
        if (!dispatched) throw new Error('Response lacks a durable dispatch marker.');
        if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error('Invalid HTTP response evidence.');
        if (responseReceived) return;
        await append('response-received', { operationId, status });
        responseReceived = true;
      };
      try {
        if (!deferDispatch) await beforeSend();
        const result = await call(observeResponse, beforeSend);
        if (!dispatched) throw new Error('The operation never dispatched.');
        await current(); // A handoff during HTTP execution cannot authorize a stale confirmation.
        const observed = await verify(result);
        if (observed === false || observed == null) throw new Error('Mutation readback did not match.');
        await append(cleanup ? 'cleanup-confirmed' : 'confirmed', { operationId, observed });
        return result;
      } catch {
        if ((responseReceived || !dispatched) && readKnownFailure) {
          try {
            await current();
            if (!responseReceived && state.events.some(event => event.kind === 'dispatch-started' && event.data?.operationId === operationId)) throw new Error('Dispatch outcome remains unknown.');
            const observed = await readKnownFailure();
            if (observed) {
              await append('failed-confirmed', { operationId, observed, acceptancePassed: false, neverDispatched: !dispatched });
              throw new Error(`Operation ${operationId} failed after a received response; cleanup remains available.`);
            }
          } catch (error) {
            if (state.events.at(-1)?.kind === 'failed-confirmed') throw error;
          }
        }
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
export async function terminalRunProof(identity, fetchRun, owner = `${identity.repository}/${identity.runId}`) {
  const prefix = `${identity.repository}/`;
  const ownerRun = owner.startsWith(prefix) ? owner.slice(prefix.length).match(/^([1-9]\d{0,19})-1$/)?.[1] : null;
  if (!ownerRun) throw new Error('Current owner is not a trusted workflow run.');
  const run = await fetchRun(ownerRun);
  if (!run || String(run.id) !== ownerRun || run.repository?.full_name !== identity.repository ||
      (ownerRun === identity.workflowRunId && run.head_sha !== identity.controlSha) || !/^[a-f0-9]{40}$/.test(run.head_sha ?? '') || run.run_attempt !== 1 || run.status !== 'completed' || !run.conclusion ||
      (ownerRun !== identity.workflowRunId && (run.event !== 'workflow_dispatch' || run.head_branch !== 'master' || run.path !== '.github/workflows/five-role-demo-acceptance.yml'))) {
    throw new Error('Original workflow is not authoritatively terminal.');
  }
  return { source: 'github', repository: identity.repository, runId: ownerRun, owner, headSha: run.head_sha, workflowAttempt: 1,
    status: 'completed', conclusion: run.conclusion, observedAt: new Date().toISOString() };
}

export function assertCleanupQuiescent(state) {
  const pending = pendingOperations(state);
  // A terminal GitHub worker does not prove an outstanding provider/app request stopped.
  // No server execution bound is assumed. Such a run requires exact reconciliation first.
  if (pending.length) throw new Error('Cleanup is quarantined while an original write outcome is unresolved.');
}
