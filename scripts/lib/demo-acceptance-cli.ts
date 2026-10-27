import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { createJournal, createPrismaJournalStore, canonical, digest } from './demo-acceptance-journal.mjs';
import { createLifecycle, identityFromEnvironment, fixturePlan, fixtureStateFromJournal, terminalRunProof, assertCleanupQuiescent, pendingOperations, assertAcceptanceAction, loginRole, phaseBlueprintFromEnvironment } from './demo-acceptance-lifecycle.mjs';
import { readPortalQaTarget } from './portal-qa-guard.cjs';
import { probeDemoServiceKey } from './demo-service-key-probe.cjs';
import { createFixtures, createRoleRowsIn, cleanupFixtures, liveDeps, readbackPersistence, type FixtureState, type Role, type PortalQaTarget, type FixturePhase, type PhaseName } from '../five-role-demo-fixture';
import { readOwnedGraph, assertGraphUnchanged, assertGraphTransition, assertJournaledLoginEvents, type OwnedGraph } from './demo-acceptance-owned-rows';
import { FIVE_ROLES, READBACK_KIND, CLEANUP_KIND, writtenValueFor, runIdFor } from './five-role-acceptance.mjs';
import { canonicalEventName } from '../../lib/events/names';
import { execFileSync } from 'node:child_process';
import { assertDispatchContext } from './demo-acceptance-workflow.mjs';
import { verifyBrowserTargets } from './portal-browser-targets.mjs';
import { PHASE_CONTENT_PATHS, phaseBlueprintHash } from './demo-acceptance-phase-plan.mjs';
import { verifyHostedPhaseAuthorization } from './demo-acceptance-phase-authorization.mjs';
import { phaseDescriptor, assertPhaseRows, transitionPhaseRows, deletePhaseRows, verifyPhaseAbsence, type PhaseBlueprint } from './demo-acceptance-phase-rows';

function output(path: string | undefined, value: unknown) {
  if (!path) throw new Error('Receipt output path is required.');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
function browserInput(env: NodeJS.ProcessEnv, identity: Record<string, unknown>, memberId?: string, phase?: FixturePhase) {
  output(env.PORTAL_BROWSER_INPUT, { identity, baselineDeploymentId: Number(env.DEMO_QA_BASELINE_DEPLOYMENT_ID),
    candidateDeploymentId: Number(env.DEMO_QA_CANDIDATE_DEPLOYMENT_ID), ...(memberId ? { memberId } : {}), ...(phase ? { phase } : {}), dynamicRoutes: [] });
}

function verifyPhaseSource(blueprint: PhaseBlueprint) {
  for (const [index, path] of PHASE_CONTENT_PATHS.entries()) for (const [sha, key] of [[blueprint.baselineSha, 'baselineBlob'], [blueprint.controlSha, 'candidateBlob']]) {
    const actual = execFileSync('git', ['rev-parse', `${sha}:${path}`], { encoding: 'utf8', windowsHide: true }).trim();
    if (actual !== blueprint.contentProof[index][key]) throw new Error('Reviewed phase source content changed.');
  }
}
const read = (path: string | undefined) => { if (!path) throw new Error('Receipt path missing.'); return JSON.parse(readFileSync(path, 'utf8')); };

/** Exact database fixture operation shared by the live coordinator and local contract proof. */
export async function createAcceptanceRows(tx: Prisma.TransactionClient, target: PortalQaTarget, input: Parameters<typeof createRoleRowsIn>[2], runId: string, phaseBlueprint?: PhaseBlueprint) {
  const created = await createRoleRowsIn(tx, target, input);
  await tx.messageThread.create({ data: { memberId: input.users.member.userId, counselorUserId: input.users.counselor.userId } });
  // The production writer imports ambient app Prisma. Validate its vocabulary here and
  // seed only canonical synthetic login events inside this dedicated journal transaction.
  const eventName = canonicalEventName('member_logged_in');
  if (!eventName) throw new Error('Canonical login event is unavailable.');
  for (let count = 0; count < 6; count++) await tx.$executeRaw`INSERT INTO member_events (id, user_id, event_name, metadata, created_at) VALUES (${randomUUID()}, ${input.users.member.userId}, ${eventName}, ${JSON.stringify({ fixtureRunId: runId, fixtureSetupOnly: true })}::jsonb, NOW())`;
  const fixtureState: FixtureState = { runId, organizationId: target.organizationId, users: input.users, ...created };
  const ownedGraph = await readOwnedGraph(tx, fixtureState);
  if (phaseBlueprint) fixtureState.phase = phaseDescriptor(phaseBlueprint, 'unassigned', ownedGraph);
  return { result: { ...created, ...(fixtureState.phase ? { phase: fixtureState.phase } : {}) }, evidence: { fixtureState, ownedGraph } };
}

/** No PREVIEW_ or normal app credential fallback. The session/direct DB must retain transactions. */
export function dedicatedEnvironment(env: NodeJS.ProcessEnv) {
  const direct = env.DEMO_QA_DATABASE_URL;
  if (env.DEMO_QA_SUPABASE_URL !== 'https://esbdrgaonplpvzmtrdhw.supabase.co') throw new Error('The canonical DEMO Auth origin is required.');
  if (!direct || new URL(direct).port === '6543' || new URL(direct).searchParams.get('pgbouncer') === 'true') {
    throw new Error('A dedicated DEMO direct/session database URL is required.');
  }
  return { ...env, PORTAL_QA_TARGET: 'demo', NEXT_PUBLIC_SUPABASE_URL: env.DEMO_QA_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.DEMO_QA_SERVICE_ROLE_KEY, POSTGRES_PRISMA_URL: direct,
    POSTGRES_URL_NON_POOLING: direct, DATABASE_URL: direct };
}

export async function openRuntime(env: NodeJS.ProcessEnv, originalRunId?: string) {
  const dedicated = dedicatedEnvironment(env);
  const target = readPortalQaTarget(dedicated) as PortalQaTarget;
  const live = liveDeps(target, dedicated);
  const journal = createJournal(createPrismaJournalStore(live.prisma));
  try {
    const previous = originalRunId ? await journal.read(originalRunId) : undefined;
    const identity = previous ? previous.identity : identityFromEnvironment(env);
    if (!identity || identity.organizationId !== target.organizationId || identity.projectRef !== 'esbdrgaonplpvzmtrdhw') {
      throw new Error('Journal target does not match the independently verified DEMO target.');
    }
    const owner = `${env.GITHUB_REPOSITORY}/${runIdFor(env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT)}`;
    const plan = previous ? previous.events.find((event: { data?: { operationId?: string; plan?: ReturnType<typeof fixturePlan> } }) => event.data?.operationId === 'fixture-plan')?.data.plan : fixturePlan(identity.runId, identity.organizationId, phaseBlueprintFromEnvironment(env));
    if (!plan || digest(plan) !== identity.planHash) throw new Error('Durable fixture plan is missing or differs from identity.');
    const lifecycle = createLifecycle(journal, identity, owner, plan);
    return { ...live, journal, identity, lifecycle, owner, target, dedicated, plan };
  } catch (error) { await live.close(); throw error; }
}

function latestGraph(state: { events: Array<{ data?: { ownedGraph?: OwnedGraph; observed?: { ownedGraph?: OwnedGraph } } }> }): OwnedGraph {
  const graph = state.events.map(event => event.data?.ownedGraph ?? event.data?.observed?.ownedGraph).filter(Boolean).at(-1);
  if (!graph) throw new Error('No authoritative owned-row graph is available.');
  return graph;
}

type JournalEvent = { kind: string; data?: { operationId?: string; ownedGraph?: OwnedGraph } };
type JournalState = { events: JournalEvent[] };
function verifyLoginEvents(graph: OwnedGraph, fixture: FixtureState, journal: JournalState) {
  const seededIds = journal.events.find(event => event.kind === 'db-committed' && event.data?.operationId === 'role-rows')?.data?.ownedGraph?.MemberEvent?.map(row => row.id) ?? [];
  const counts: Record<string, number> = {};
  for (const event of journal.events) {
    const role = event.kind === 'intent' && event.data?.operationId?.startsWith('app:') ? loginRole(event.data.operationId.slice(4)) as Role | null : null;
    const id = role && fixture.users[role]?.userId;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  assertJournaledLoginEvents(graph, fixture, seededIds, counts);
}

/** Called immediately around one permitted browser API mutation, never retried. */
export async function runAcceptanceAction<T>(env: NodeJS.ProcessEnv, operation: string, call: (observeResponse: (evidence: { status: number }) => Promise<void>, beforeSend: () => Promise<void>) => Promise<T>, verifyApp: (result: T) => boolean, options: { expectedUserId?: string; expectedPhase?: FixturePhase } = {}) {
  assertDispatchContext(env);
  assertAcceptanceAction(operation, env.DEMO_QA_MODE);
  const runtime = await openRuntime(env);
  const { lifecycle, prisma, identity } = runtime;
  try {
    const current = await lifecycle.current();
    const fixture = fixtureStateFromJournal(current) as FixtureState;
    const expectedRole = loginRole(operation) as Role | null;
    if (expectedRole && options.expectedUserId !== fixture.users[expectedRole]?.userId) throw new Error('Login identity differs from the journal-owned fixture.');
    if (runtime.plan.phaseBlueprint) {
      verifyHostedPhaseAuthorization(env, runtime.plan.phaseBlueprint, fixture.phase?.name);
      if (operation.startsWith('browser-login:') && (!options.expectedPhase || canonical(options.expectedPhase) !== canonical(fixture.phase) || operation.split(':')[1] !== fixture.phase?.name)) throw new Error('Browser operation differs from the journaled fixture phase.');
      if (!operation.startsWith('browser-login:') && fixture.phase?.name !== 'unassigned') throw new Error('Application mutations are restricted to the initial phase.');
    } else if (options.expectedPhase) throw new Error('No reviewed synthetic phase plan is active.');
    const before = await readOwnedGraph(prisma, fixture);
    verifyLoginEvents(before, fixture, current);
    if (runtime.plan.phaseBlueprint) assertPhaseRows(runtime.plan.phaseBlueprint, fixture, before);
    const previous = latestGraph(current);
    if (canonical(previous) !== canonical(before)) {
      assertGraphTransition(previous, before, 'member-session', fixture);
      await lifecycle.append('readback', { sessionObserved: true, ownedGraph: before });
    }
    let graph: OwnedGraph | undefined;
    const result = await lifecycle.write(`app:${operation}`, { graphDigest: digest(before) }, { operation }, call, async (value: T) => {
      if (!verifyApp(value)) return false;
      graph = await readOwnedGraph(prisma, fixture);
      verifyLoginEvents(graph, fixture, await lifecycle.current());
      assertGraphTransition(before, graph, loginRole(operation) ? 'member-session' : operation, fixture);
      assertScenarioValue(graph, operation, fixture, value);
      return { operation, appReadbackMatched: true, databaseMatched: true, ownedGraph: graph };
    }, { deferDispatch: true, readKnownFailure: async () => {
      const ownedGraph = await readOwnedGraph(prisma, fixture);
      verifyLoginEvents(ownedGraph, fixture, await lifecycle.current());
      return { operation, ownedGraph, acceptancePassed: false, responseReceived: true };
    } });
    await lifecycle.append('readback', { operation, ownedGraph: graph });
    return { result, identity, journalDigest: (await lifecycle.current()).digest };
  } finally { await runtime.close(); }
}

function assertScenarioValue(graph: OwnedGraph, operation: string, fixture: FixtureState, value: unknown) {
  const memberId = fixture.users.member?.userId;
  const member = graph.User?.find(row => row.id === memberId);
  const profile = graph.Profile?.find(row => row.userId === memberId);
  const record = value as { recordId?: string; timestamp?: string };
  let valid = false;
  const role = loginRole(operation) as Role | null;
  if (role) valid = record.recordId === fixture.users[role]?.userId;
  if (operation === 'member-goal') valid = graph.Goal?.some(row => row.id === record.recordId && row.title === writtenValueFor(fixture.runId, 'member')) ?? false;
  if (operation === 'counselor-note' || operation === 'admin-note') valid = graph.CounselorNote?.some(row => row.id === record.recordId && row.content === writtenValueFor(fixture.runId, operation.split('-')[0])) ?? false;
  if (operation === 'employer-profile') valid = graph.Employer?.some(row => row.id === fixture.employerId && row.companyName === writtenValueFor(fixture.runId, 'employer')) ?? false;
  if (operation === 'partner-profile') valid = graph.Partner?.some(row => row.id === fixture.partnerId && row.name === writtenValueFor(fixture.runId, 'partner')) ?? false;
  if (operation === 'member-location') valid = profile?.city === 'QA City' && profile?.state === 'GA' && profile?.zip === '30301';
  if (operation === 'member-notifications') valid = member?.notificationsUpdates === false && member?.notificationsReminders === false;
  if (operation === 'member-message-read') valid = typeof record.timestamp === 'string' && graph.MessageThread?.some(row => row.memberId === memberId && row.memberLastReadAt === record.timestamp) === true;
  if (!valid) throw new Error('The scenario database value did not match its exact contract.');
}

export async function main(command: string | undefined, env: NodeJS.ProcessEnv) {
  assertDispatchContext(env);
  if ((env.DEMO_QA_MODE === 'recover-cleanup') !== (command === 'recover-cleanup')) throw new Error('Cleanup-only dispatch cannot execute acceptance commands.');
  if (command === 'plan') {
    const identity = identityFromEnvironment(env);
    output(env.FIVE_ROLE_QA_PLAN_FILE, { identity, plan: fixturePlan(identity.runId, identity.organizationId, phaseBlueprintFromEnvironment(env)),
      baselineDeploymentId: env.DEMO_QA_BASELINE_DEPLOYMENT_ID, candidateDeploymentId: env.DEMO_QA_CANDIDATE_DEPLOYMENT_ID });
    browserInput(env, identity);
    return;
  }
  if (!['create', 'readback', 'cleanup', 'recover-cleanup', 'complete-preassessment', 'phase-unassigned', 'phase-assigned-owner', 'phase-approved-profile'].includes(command ?? '')) throw new Error('Unknown acceptance command.');
  if (command === 'create') {
    const plan = read(env.PORTAL_BROWSER_INPUT);
    if (canonical(plan.identity) !== canonical(identityFromEnvironment(env))) throw new Error('Browser preflight plan identity differs from the trusted workflow.');
    await verifyBrowserTargets(plan,
      async (path: string) => JSON.parse(execFileSync('gh', ['api', '--method', 'GET', path], { encoding: 'utf8', timeout: 15_000, windowsHide: true })),
      async (origin: string) => {
        const response = await fetch(`${origin}/api/health`, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: env.DEMO_QA_VERCEL_BYPASS_SECRET ? { 'x-vercel-protection-bypass': env.DEMO_QA_VERCEL_BYPASS_SECRET } : {} });
        return { status: response.status, body: await response.text() };
      });
  }
  const original = command === 'recover-cleanup' ? env.DEMO_QA_ORIGINAL_RUN_ID : undefined;
  if (command === 'recover-cleanup' && !/^\d{1,20}-1$/.test(original ?? '')) throw new Error('Cleanup-only requires the original first-attempt run ID.');
  const runtime = await openRuntime(env, original);
  const { deps, prisma, journal, lifecycle, identity, target, owner } = runtime;
  try {
    if (command === 'create') {
      if (runtime.plan.phaseBlueprint) {
        verifyHostedPhaseAuthorization(env, runtime.plan.phaseBlueprint, 'approved-profile');
        verifyPhaseSource(runtime.plan.phaseBlueprint);
      }
      const probe = await probeDemoServiceKey({ url: runtime.dedicated.NEXT_PUBLIC_SUPABASE_URL, key: runtime.dedicated.SUPABASE_SERVICE_ROLE_KEY });
      if (probe.urlProject !== 'demo' || probe.key !== 'valid') throw new Error('DEMO key read probe failed.');
      if (!env.GITHUB_ENV) throw new Error('Credential handoff file missing.');
      await lifecycle.claim();
      const baseCreate = deps.createAuthUser;
      deps.createAuthUser = input => lifecycle.write(`auth-create:${input.appMetadata.role}`, null,
        { email: input.email, metadata: input.appMetadata }, (observeResponse: (response: { status: number }) => Promise<void>, beforeSend: () => Promise<void>) => runtime.withAuthObservation({ observeResponse, beforeSend }, () => baseCreate(input)), async (id: string) => {
          const actual = await deps.getAuthUser(id);
          return actual && actual.email === input.email && Object.entries(input.appMetadata).every(([key, value]) => actual.appMetadata[key] === value) ? { id, email: input.email, metadata: input.appMetadata } : false;
        }, { deferDispatch: true, readKnownFailure: async () => {
          const actual = await deps.findAuthUserByEmail(input.email);
          if (!actual) return { outcome: 'absent', email: input.email };
          if (!Object.entries(input.appMetadata).every(([key, value]) => actual.appMetadata[key] === value)) throw new Error('Foreign Auth identity cannot be adopted.');
          return { outcome: 'owned', id: actual.id, email: input.email, metadata: input.appMetadata };
        } });
      deps.createRoleRows = async input => {
        const state = await lifecycle.current();
        const result = await journal.atomic(identity.runId, owner, state.revision, 'db-committed', { operationId: 'role-rows', preimage: null },
          (tx: Prisma.TransactionClient) => createAcceptanceRows(tx, target, input, identity.runId, runtime.plan.phaseBlueprint));
        lifecycle.adopt(result.state);
        return result.result;
      };
      const passwords = Object.fromEntries(FIVE_ROLES.map(role => [role, randomBytes(24).toString('base64url')])) as Record<Role, string>;
      const fixture = await createFixtures(target, identity.runId, passwords, deps,
        async state => { await lifecycle.saveFixture(state); output(env.FIVE_ROLE_QA_STATE_FILE, state); },
        async marker => { await lifecycle.append('confirmed', { marker }); });
      const lines = [`FIVE_ROLE_QA_RUN_ID=${identity.runId}`, `FIVE_ROLE_QA_EMPLOYER_RECORD_ID=${fixture.employerId}`, `FIVE_ROLE_QA_PARTNER_RECORD_ID=${fixture.partnerId}`];
      for (const role of FIVE_ROLES as Role[]) {
        console.log(`::add-mask::${passwords[role]}`);
        lines.push(`FIVE_ROLE_QA_${role.toUpperCase()}_ID=${fixture.users[role]!.userId}`, `FIVE_ROLE_QA_${role.toUpperCase()}_EMAIL=${fixture.users[role]!.email}`, `FIVE_ROLE_QA_${role.toUpperCase()}_PASSWORD=${passwords[role]}`);
      }
      appendFileSync(env.GITHUB_ENV, `${lines.join('\n')}\n`);
      output(env.FIVE_ROLE_QA_PLAN_FILE, { identity, plan: runtime.plan, memberId: fixture.users.member!.userId,
        baselineDeploymentId: env.DEMO_QA_BASELINE_DEPLOYMENT_ID, candidateDeploymentId: env.DEMO_QA_CANDIDATE_DEPLOYMENT_ID });
      browserInput(env, identity, fixture.users.member!.userId, fixture.phase);
      return;
    }
    if (command === 'recover-cleanup') {
      const existing = await journal.read(identity.runId);
      const proof = await terminalRunProof(identity, async (id: string) => {
        const response = await fetch(`https://api.github.com/repos/${identity.repository}/actions/runs/${id}`, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } });
        if (!response.ok) throw new Error('Original workflow state is unreadable.');
        return response.json();
      }, existing.owner);
      await journal.handoff(identity.runId, existing.owner, existing.revision, owner, proof);
      // Only positively observed completed Auth creates/deletes can resolve uncertainty.
      // An absent create or present delete may still be executing and stays quarantined.
      let recovered = fixtureStateFromJournal(await lifecycle.current()) as FixtureState;
      for (const pending of pendingOperations(await lifecycle.current())) {
        const operationId = pending.data.operationId as string;
        if (operationId.startsWith('auth-create:')) {
          const role = operationId.slice('auth-create:'.length) as Role;
          const email = fixturePlan(identity.runId, identity.organizationId).users[role]?.email;
          if (!email) throw new Error('Unknown creation intent.');
          const user = await deps.findAuthUserByEmail(email);
          const events = (await lifecycle.current()).events as JournalEvent[];
          const dispatched = events.some(event => event.kind === 'dispatch-started' && event.data?.operationId === operationId);
          const receivedResponse = events.some(event => event.kind === 'response-received' && event.data?.operationId === operationId);
          if (!user && (!dispatched || receivedResponse)) {
            await lifecycle.reconcile(operationId, async () => ({ outcome: 'absent', neverDispatched: !dispatched, receivedResponse, email }));
            delete recovered.pending;
            await lifecycle.saveFixture(recovered);
            continue;
          }
          if (!user || user.appMetadata.run_id !== identity.runId || user.appMetadata.role !== role ||
              user.appMetadata.wap6_five_role_fixture !== true || user.appMetadata.portal_qa_organization_id !== identity.organizationId) {
            throw new Error('Auth creation outcome is still quarantined.');
          }
          await lifecycle.reconcile(operationId, async () => ({ outcome: 'owned', id: user.id, email }));
          recovered.users[role] = { userId: user.id, email };
          delete recovered.pending;
          await lifecycle.saveFixture(recovered);
        } else if (operationId.startsWith('auth-delete:')) {
          const role = operationId.split(':')[1] as Role;
          const user = recovered.users[role];
          if (!user) throw new Error('Unknown Auth deletion identity.');
          const actual = await deps.getAuthUser(user.userId);
          const byEmail = await deps.findAuthUserByEmail(user.email);
          if (!actual && !byEmail) await lifecycle.reconcile(operationId, async () => ({ outcome: 'absent', id: user.userId, email: user.email }));
          else {
            const received = (await lifecycle.current()).events.some((event: JournalEvent) => event.kind === 'response-received' && event.data?.operationId === operationId);
            if (!received || !actual || actual.email !== user.email || byEmail?.id !== user.userId || actual.appMetadata.run_id !== identity.runId || actual.appMetadata.role !== role || actual.appMetadata.wap6_five_role_fixture !== true || actual.appMetadata.portal_qa_organization_id !== identity.organizationId) throw new Error('Auth deletion remains quarantined.');
            await lifecycle.reconcile(operationId, async () => ({ outcome: 'owned', receivedResponse: true, id: user.userId, email: user.email, acceptancePassed: false }));
          }
        } else if (operationId.startsWith('app:')) {
          const state = await lifecycle.current();
          const operation = operationId.slice(4);
          assertAcceptanceAction(operation, 'acceptance');
          const ownedGraph = await readOwnedGraph(prisma, recovered);
          verifyLoginEvents(ownedGraph, recovered, state);
          const received = state.events.some((event: JournalEvent) => event.kind === 'response-received' && event.data?.operationId === operationId);
          const dispatched = state.events.some((event: JournalEvent) => event.kind === 'dispatch-started' && event.data?.operationId === operationId);
          if (!received && dispatched) {
            const previous = latestGraph(state);
            assertGraphTransition(previous, ownedGraph, loginRole(operation) ? 'member-session' : operation, recovered);
            const role = loginRole(operation) as Role | null;
            const member = recovered.users.member?.userId;
            const recordId = role ? recovered.users[role]?.userId : operation === 'member-goal' ? ownedGraph.Goal?.find(row => row.title === writtenValueFor(identity.runId, 'member'))?.id
              : operation.endsWith('-note') ? ownedGraph.CounselorNote?.find(row => row.content === writtenValueFor(identity.runId, operation.split('-')[0]))?.id
                : operation === 'employer-profile' ? recovered.employerId : operation === 'partner-profile' ? recovered.partnerId : undefined;
            if (role && !ownedGraph.MemberEvent?.some(row => row.userId === recordId && row.eventName === 'member_logged_in' && row.sourcePage === '/login' && !previous.MemberEvent?.some(old => old.id === row.id))) throw new Error('Login transport outcome remains unknown.');
            assertScenarioValue(ownedGraph, operation, recovered, { recordId, timestamp: ownedGraph.MessageThread?.find(row => row.memberId === member)?.memberLastReadAt });
          }
          await lifecycle.reconcile(operationId, async () => ({ outcome: 'owned', operation, ownedGraph, acceptancePassed: false, receivedResponse: received, neverDispatched: !dispatched }));
        } else throw new Error('Original request outcome is unresolved; cleanup remains quarantined.');
      }
    }
    const current = await lifecycle.current();
    assertCleanupQuiescent(current);
    const fixture = fixtureStateFromJournal(current) as FixtureState;
    if (command!.startsWith('phase-')) {
      const next = command!.slice('phase-'.length) as PhaseName;
      const blueprint = runtime.plan.phaseBlueprint;
      if (!blueprint || !fixture.phase || fixture.phase.blueprintHash !== phaseBlueprintHash(blueprint)) throw new Error('A reviewed durable phase plan is required.');
      const approval = verifyHostedPhaseAuthorization(env, blueprint, next);
      verifyPhaseSource(blueprint);
      if (current.events.some((event: JournalEvent) => event.data?.operationId === `phase:${next}`)) throw new Error('This phase checkpoint already exists; it cannot be replayed.');
      const before = await readOwnedGraph(prisma, fixture);
      verifyLoginEvents(before, fixture, current);
      assertGraphTransition(latestGraph(current), before, 'member-session', fixture);
      const transition = await journal.atomic(identity.runId, owner, current.revision, 'db-committed', { operationId: `phase:${next}`, preimage: before }, async (tx: Prisma.TransactionClient) => {
        if (next !== 'unassigned') return transitionPhaseRows(tx, fixture, before, blueprint, next, JSON.parse(env.DEMO_QA_PHASE_APPROVAL!));
        if (fixture.phase?.name !== 'unassigned') throw new Error('The unassigned checkpoint cannot overwrite a later phase.');
        assertGraphUnchanged(before, await readOwnedGraph(tx, fixture));
        assertPhaseRows(blueprint, fixture, before);
        const fixtureState: FixtureState = { ...fixture, phase: phaseDescriptor(blueprint, next, before) };
        return { result: fixtureState, evidence: { fixtureState, phase: fixtureState.phase, ownedGraph: before, approval, fixtureSetupOnly: true } };
      });
      lifecycle.adopt(transition.state);
      output(env.FIVE_ROLE_QA_STATE_FILE, transition.result);
      browserInput(env, identity, fixture.users.member!.userId, transition.result.phase);
      return;
    }
    if (command === 'readback') {
      const acceptance = read(env.FIVE_ROLE_ACCEPTANCE_OUTPUT);
      if (canonical(acceptance.identity) !== canonical(identity)) throw new Error('Acceptance identity mismatch.');
      const result = await readbackPersistence(fixture, acceptance, deps);
      const graph = await readOwnedGraph(prisma, fixture);
      verifyLoginEvents(graph, fixture, current);
      assertGraphTransition(latestGraph(current), graph, 'member-session', fixture);
      const state = await lifecycle.append('readback', { roleReadback: result, ownedGraph: graph });
      output(env.FIVE_ROLE_QA_READBACK_OUTPUT, { kind: READBACK_KIND, runId: identity.runId, identity, journalDigest: state.digest, ...result });
      if (!result.success) throw new Error('Database readback failed.');
      return;
    }
    if (command === 'complete-preassessment') {
      const before = await readOwnedGraph(prisma, fixture);
      verifyLoginEvents(before, fixture, current);
      if (canonical(latestGraph(current)) !== canonical(before)) {
        assertGraphTransition(latestGraph(current), before, 'member-session', fixture);
        await lifecycle.append('readback', { sessionObserved: true, ownedGraph: before });
      }
      await journal.atomic(identity.runId, owner, (await lifecycle.current()).revision, 'db-committed', { operationId: 'preassessment-fixture', preimage: { assessmentCompleted: false }, fixtureSetupOnly: true }, async (tx: Prisma.TransactionClient) => {
        const changed = await tx.user.updateMany({ where: { id: fixture.users.member!.userId, organizationId: target.organizationId, assessmentCompleted: false, assessmentCompletedAt: null }, data: { assessmentCompleted: true, assessmentCompletedAt: new Date(), assessmentScore: 80, assessmentScorePct: 80 } });
        if (changed.count !== 1) throw new Error('Assessment fixture compare-and-set failed.');
        const ownedGraph = await readOwnedGraph(tx, fixture);
        assertGraphTransition(before, ownedGraph, 'member-preassessment-completed', fixture);
        return { result: true, evidence: { ownedGraph } };
      });
      return;
    }
    let expected: OwnedGraph;
    try { expected = latestGraph(current); } catch {
      // Before the atomic role-row transaction, public rows must be proven absent.
      expected = await readOwnedGraph(prisma, fixture);
      if (Object.values(expected).some(rows => rows.length)) throw new Error('Unjournaled database creation remains quarantined.');
      await lifecycle.append('readback', { ownedGraph: expected, partialAuthOnly: true });
    }
    const settled = await readOwnedGraph(prisma, fixture);
    verifyLoginEvents(settled, fixture, current);
    assertGraphTransition(expected, settled, 'member-session', fixture);
    if (canonical(expected) !== canonical(settled)) await lifecycle.append('readback', { sessionObserved: true, ownedGraph: settled });
    expected = settled;
    deps.validateCleanup = async () => { assertGraphUnchanged(expected, await readOwnedGraph(prisma, fixture)); };
    const noteIds = expected.CounselorNote?.map(row => row.id) ?? [];
    deps.deleteNotes = async () => {
      const state = await lifecycle.current();
      if (state.events.some((event: JournalEvent) => event.data?.operationId === 'cleanup-db')) return 0;
      const deleted = await journal.atomic(identity.runId, owner, state.revision, 'db-committed',
        { operationId: 'cleanup-db', preimage: expected }, async (tx: Prisma.TransactionClient) => {
          assertGraphUnchanged(expected, await readOwnedGraph(tx, fixture));
          const notes = await tx.counselorNote.deleteMany({ where: { id: { in: noteIds } } });
          if (notes.count !== noteIds.length) throw new Error('Note deletion compare-and-set failed.');
          await deletePhaseRows(tx, fixture, expected);
          for (const role of FIVE_ROLES as Role[]) {
            const user = fixture.users[role];
            if (user) await tx.user.deleteMany({ where: { id: user.userId, email: user.email, organizationId: target.organizationId } });
          }
          if (fixture.partnerId) await tx.partner.deleteMany({ where: { id: fixture.partnerId, organizationId: target.organizationId } });
          const ownedGraph = await readOwnedGraph(tx, fixture);
          if (Object.values(ownedGraph).some(rows => rows.length)) throw new Error('Database fixture absence did not verify.');
          const phaseAbsence = await verifyPhaseAbsence(tx, fixture);
          return { result: notes.count, evidence: { ownedGraph, ...(phaseAbsence ? { phaseAbsence } : {}) } };
        });
      lifecycle.adopt(deleted.state);
      return deleted.result;
    };
    // Database destruction already happened atomically above; these callbacks may only confirm absence.
    deps.deleteUser = async id => { if (await deps.findUserById(id)) throw new Error('Database delete was not committed.'); };
    deps.deletePartner = async id => { if (await deps.findPartner(id)) throw new Error('Partner delete was not committed.'); };
    const deleteAuth = deps.deleteAuthUser;
    deps.deleteAuthUser = async id => {
      const role = (FIVE_ROLES as Role[]).find(key => fixture.users[key]?.userId === id);
      if (!role) throw new Error('Auth deletion does not name a journal-owned identity.');
      const user = fixture.users[role]!;
      // A later cleanup owner may make a new attempt after a known response failure; unknown requests remain pending and block entry.
      await lifecycle.write(`auth-delete:${role}:${env.GITHUB_RUN_ID}`, { id, email: user.email }, null,
        (observeResponse: (response: { status: number }) => Promise<void>, beforeSend: () => Promise<void>) => runtime.withAuthObservation({ observeResponse, beforeSend }, () => deleteAuth(id)), async () =>
          !(await deps.getAuthUser(id)) && !(await deps.findAuthUserByEmail(user.email)) ? { outcome: 'absent', id, email: user.email } : false,
        { cleanup: true, deferDispatch: true, readKnownFailure: async () => {
          const actual = await deps.getAuthUser(id);
          const byEmail = await deps.findAuthUserByEmail(user.email);
          if (!actual && !byEmail) return { outcome: 'absent', id, email: user.email };
          if (!actual || actual.email !== user.email || byEmail?.id !== id || actual.appMetadata.run_id !== identity.runId || actual.appMetadata.wap6_five_role_fixture !== true || actual.appMetadata.role !== role || actual.appMetadata.portal_qa_organization_id !== identity.organizationId) throw new Error('Auth deletion readback is not exactly owned.');
          return { outcome: 'present', id, email: user.email, acceptancePassed: false };
        } });
    };
    // Only journal-confirmed action IDs can authorize deletion; a local acceptance file is not authority.
    const recordIds = { member: expected.Goal?.[0]?.id, counselor: expected.CounselorNote?.find(row => row.authorId === fixture.users.counselor?.userId)?.id,
      admin: expected.CounselorNote?.find(row => row.authorId === fixture.users.admin?.userId)?.id, employer: fixture.employerId, partner: fixture.partnerId };
    const result = await cleanupFixtures(target, fixture, deps, recordIds);
    const state = await lifecycle.append('cleanup-complete', { result, cleanupOnly: command === 'recover-cleanup' });
    output(env.FIVE_ROLE_QA_CLEANUP_OUTPUT, { kind: CLEANUP_KIND, runId: identity.runId, identity, journalDigest: state.digest, success: true, auditRowsRetained: true, cleanupOnly: command === 'recover-cleanup', ...result });
    output(env.FIVE_ROLE_QA_JOURNAL_OUTPUT, { identity, events: state.events, digest: state.digest });
  } catch {
    const failurePath = command === 'readback' ? env.FIVE_ROLE_QA_READBACK_OUTPUT : command === 'cleanup' || command === 'recover-cleanup' ? env.FIVE_ROLE_QA_CLEANUP_OUTPUT : env.FIVE_ROLE_QA_FAILURE_OUTPUT;
    if (failurePath) output(failurePath, { kind: 'demo-acceptance-step-failure', command, identity, runId: identity.runId, success: false, reason: 'step-refused-or-outcome-quarantined', observedAt: new Date().toISOString() });
    try {
      const state = await journal.read(identity.runId);
      if (env.FIVE_ROLE_QA_JOURNAL_OUTPUT) output(env.FIVE_ROLE_QA_JOURNAL_OUTPUT, { identity, events: state.events, digest: state.digest });
    } catch { /* A missing export is never a successful receipt; the DB journal remains authoritative. */ }
    throw new Error('DEMO acceptance step failed; inspect the sanitized receipt and retained journal.');
  } finally { await runtime.close(); }
}
