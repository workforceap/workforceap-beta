#!/usr/bin/env npx tsx
/**
 * Per-run disposable DEMO member for the Resume Build acceptance lane
 * (docs/RESUME-DEMO-ACCEPTANCE.md, .github/workflows/resume-demo-acceptance.yml).
 *
 *   create   make ONE new member `resume-qa-<run id>-<attempt>@example.com` in
 *            the dedicated portal-qa-* organization of the DEMO project, with a
 *            password generated for this run only (never printed; handed to
 *            later workflow steps through GITHUB_ENV with a log mask).
 *   cleanup  remove exactly that member by its recorded ID: its own storage
 *            objects (lib/gdpr/deleteUserStorage.ts, scoped to that ID's
 *            prefixes in `member-resumes` and `member-files`), then its Prisma
 *            user (profile and member rows cascade) and its Auth user. Nothing
 *            is matched by pattern. Per-bucket counts before/after go to
 *            RESUME_QA_CLEANUP_OUTPUT.
 *
 * Audit rows (AuditLog/AuditEvent) that name the synthetic actor are kept by
 * design; this is not a full erasure.
 *
 * Target and organization checks reuse scripts/lib/portal-qa-guard.cjs
 * (readPortalQaTarget, assertPortalQaOrganization) and run before any client
 * is constructed. It never reads or changes another account.
 *
 * Environment: PORTAL_QA_TARGET=demo, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, POSTGRES_PRISMA_URL (or DATABASE_URL), optional
 * POSTGRES_URL_NON_POOLING, PORTAL_QA_ORGANIZATION_ID, PORTAL_QA_ORGANIZATION_SLUG,
 * RESUME_QA_STATE_FILE (optional RESUME_QA_MARKER_FILE, RESUME_QA_STAGE_FILE,
 * RESUME_QA_CLEANUP_OUTPUT); `create` also needs GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT,
 * GITHUB_ENV. `cleanup` reads the marker/state/stage files before the target
 * guard, so a create that stopped at the guard still gets an informational
 * receipt without any DEMO URL or client (see resolveCleanupInput).
 */
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import {
  deleteUserStorageObjects,
  MEMBER_RESUME_BUCKET,
  MEMBER_STORAGE_PREFIXES,
  type MemberStorageAdmin,
} from '../lib/gdpr/deleteUserStorage';
import { assertPortalQaOrganization, readPortalQaTarget } from './lib/portal-qa-guard.cjs';
import { probeDemoServiceKey } from './lib/demo-service-key-probe.cjs';
import { claimEnrollmentAgreementErasure } from '../lib/enrollmentAgreements/operationLock';
export const RESUME_QA_EMAIL = /^resume-qa-\d{1,20}-\d{1,4}@example\.com$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PortalQaTarget { organizationId: string; organizationSlug: string; databaseUrl: string }
export interface FixtureState { userId: string; email: string; organizationId: string; runId: string }
export interface CreationMarker { runId: string; email: string; organizationId: string }

export type CleanupInput =
  | { kind: 'state'; state: FixtureState }
  | { kind: 'stopped-before-clients'; failedStage: PreClientStage };

/**
 * Progress `create` records in the stage file (RESUME_QA_STAGE_FILE):
 * - `target-guard` is written before anything else, while no client or Auth
 *   call is possible;
 * - `key-probe` once the target guard passed, while the one read-only
 *   DEMO key probe runs (no client, no write);
 * - `clients` once the key is valid, before any client is built.
 * No secrets, only the stage and the synthetic email.
 */
type PreClientStage = 'target-guard' | 'key-probe';
export interface CreateStage { stage: PreClientStage | 'clients'; email?: string }
const PRE_CLIENT_STAGES: readonly string[] = ['target-guard', 'key-probe'];

function readJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isFixtureState(value: unknown): value is FixtureState {
  const v = value as Partial<FixtureState> | null;
  return Boolean(v) && typeof v!.userId === 'string' && typeof v!.email === 'string'
    && typeof v!.organizationId === 'string' && typeof v!.runId === 'string';
}

/**
 * Decide what cleanup may do from the marker, state and stage files.
 * - A valid state: clean up exactly that recorded member.
 * - No marker, no state, and a stage file that still says `target-guard`:
 *   create stopped before any client or Auth call in this run, so cleanup only
 *   writes an INFORMATIONAL receipt. That is "no marker found", never proof
 *   that no member exists.
 * - Anything else (a marker without a readable state, or no marker once create
 *   was past the target guard or left no stage): fail closed with exact-email
 *   recovery steps. Nothing is ever deleted by pattern.
 */
export function resolveCleanupInput(markerText: string | null, stateText: string | null, stageText: string | null = null): CleanupInput {
  const state = readJson(stateText);
  if (isFixtureState(state)) return { kind: 'state', state };
  const stage = readJson(stageText) as Partial<CreateStage> | null | undefined;
  if (markerText === null && stateText === null && typeof stage?.stage === 'string' && PRE_CLIENT_STAGES.includes(stage.stage)) {
    return { kind: 'stopped-before-clients', failedStage: stage.stage as PreClientStage };
  }
  const marker = readJson(markerText) as Partial<CreationMarker> | null | undefined;
  const email = [marker?.email, stage?.email].find((value): value is string => typeof value === 'string' && RESUME_QA_EMAIL.test(value))
    ?? (markerText === null ? '<not recorded: resume-qa-<run id>-<run attempt>@example.com>' : '<unreadable marker>');
  throw new Error(
    'Refusing cleanup: a synthetic member may have been created but its recorded ID is missing or unreadable. '
      + `Manual recovery: in the DEMO project, look up the Auth user and the users row by the exact email ${email}, `
      + 'confirm app_metadata.resume_acceptance_fixture is true, then remove that exact ID: its member-resumes/<id>/ and '
      + 'member-files prefixes, the Auth user, then the users row. Never delete by pattern.',
  );
}

export interface FixtureDeps {
  findOrganization(id: string): Promise<{ id: string; slug: string; active: boolean } | null>;
  /** Number of active organizations whose slug starts with `portal-qa-`. */
  countActivePortalQaOrganizations(): Promise<number>;
  findUserIdByEmail(email: string): Promise<string | null>;
  findUserById(id: string): Promise<{
    id: string; email: string; organizationId: string;
    resumeOriginalPath: string | null; resumeEnhancedPath: string | null;
  } | null>;
  createMember(input: { id: string; organizationId: string; email: string; fullName: string }): Promise<void>;
  deleteUser(id: string): Promise<void>;
  createAuthUser(input: { email: string; password: string; fullName: string; appMetadata: Record<string, unknown> }): Promise<string>;
  /**
   * The Auth user, or null ONLY on an explicit `user_not_found` answer. Every other
   * error (5xx, permission, network) must throw, so cleanup fails closed.
   */
  getAuthUser(id: string): Promise<{ id: string; email: string | null; appMetadata: Record<string, unknown> } | null>;
  deleteAuthUser(id: string): Promise<void>;
  /** Backoff between bounded retries; injectable so tests do not wait. */
  sleep?(ms: number): Promise<void>;
  /** Database-scoped erasure fence; omitted callers retain the storage helper's real default. */
  claimAgreementErasure?(memberId: string): Promise<void>;
  /** Storage admin client; objects are only ever listed and removed under this member's own ID prefixes. */
  storage: MemberStorageAdmin;
}

const NOT_FOUND = /not found|does not exist|no such file|bucket not found/i;

/**
 * Objects under the member's own prefixes (MEMBER_STORAGE_PREFIXES), counted
 * per bucket. Counts only: paths are never returned or logged. Any listing
 * error other than "not found" throws.
 */
export async function countMemberStorageObjects(storage: MemberStorageAdmin, userId: string) {
  const counts: Record<string, number> = {};
  for (const { bucket, prefixFor } of MEMBER_STORAGE_PREFIXES) {
    const api = storage.storage.from(bucket);
    const dirs = [prefixFor(userId)];
    counts[bucket] ??= 0;
    while (dirs.length) {
      const dir = dirs.pop()!;
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await api.list(dir, { limit: 100, offset });
        if (error) {
          if (NOT_FOUND.test(error.message ?? '')) break;
          throw new Error(`Listing ${bucket} for the synthetic member failed.`);
        }
        const items = data ?? [];
        for (const item of items) {
          if (!item.name || item.name === '.' || item.name === '..') continue;
          if (item.id == null) dirs.push(`${dir}/${item.name}`);
          else counts[bucket] += 1;
        }
        if (items.length < 100) break;
      }
    }
  }
  return counts;
}

export function syntheticIdentity(runId: string, attempt: string) {
  if (!/^\d{1,20}$/.test(runId) || !/^\d{1,4}$/.test(attempt)) {
    throw new Error('GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT must be numeric.');
  }
  return {
    email: `resume-qa-${runId}-${attempt}@example.com`,
    fullName: 'Resume QA Synthetic Member',
    runId: `${runId}-${attempt}`,
  };
}

/** 32 URL-safe characters from 24 random bytes; generated per run, never printed. */
export function generatePassword(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * The dispatch inputs must name the exact, active fixture organization. Before
 * creating, it must also be the only active portal-qa-* organization, so a
 * stale or second fixture organization can never receive the member. The
 * organization itself is only read, never changed.
 */
async function assertOrganization(target: PortalQaTarget, deps: FixtureDeps, { requireOnly }: { requireOnly: boolean }) {
  assertPortalQaOrganization(await deps.findOrganization(target.organizationId), target);
  if (requireOnly && (await deps.countActivePortalQaOrganizations()) !== 1) {
    throw new Error('Expected exactly one active portal-qa-* organization. No fixture writes are allowed.');
  }
}

export async function createFixture(
  target: PortalQaTarget,
  identity: ReturnType<typeof syntheticIdentity>,
  password: string,
  deps: FixtureDeps,
  onAuthCreated: (state: FixtureState) => void,
  onBeforeAuthCreate: (marker: CreationMarker) => void = () => {},
): Promise<FixtureState> {
  if (!RESUME_QA_EMAIL.test(identity.email)) throw new Error('Refusing a non-synthetic acceptance identity.');
  await assertOrganization(target, deps, { requireOnly: true });
  if (await deps.findUserIdByEmail(identity.email)) {
    throw new Error('The synthetic acceptance member for this run already exists. Nothing was changed.');
  }
  // Durable marker (no secrets) BEFORE the Auth call, so a crash between the
  // Auth create and the state write can never read as "nothing was created".
  onBeforeAuthCreate({ runId: identity.runId, email: identity.email, organizationId: target.organizationId });
  const userId = await deps.createAuthUser({
    email: identity.email,
    password,
    fullName: identity.fullName,
    appMetadata: {
      resume_acceptance_fixture: true,
      run_id: identity.runId,
      portal_qa_organization_id: target.organizationId,
    },
  });
  const state: FixtureState = { userId, email: identity.email, organizationId: target.organizationId, runId: identity.runId };
  // Record the exact Auth ID before the database write, so cleanup can remove
  // it even when the Prisma step fails.
  onAuthCreated(state);
  await deps.createMember({ id: userId, organizationId: target.organizationId, email: identity.email, fullName: identity.fullName });
  return state;
}

export const CLEANUP_RETRY_DELAYS_MS = [1_000, 3_000] as const;

/** A small fixed number of attempts with backoff; the last error is rethrown. */
async function withRetry<T>(deps: FixtureDeps, call: () => Promise<T>): Promise<T> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= CLEANUP_RETRY_DELAYS_MS.length) throw error;
      await sleep(CLEANUP_RETRY_DELAYS_MS[attempt]);
    }
  }
}

function strandedError(state: FixtureState, step: string): Error {
  return new Error(
    `Synthetic member cleanup failed at "${step}". Remaining rows were kept for a rerun of cleanup. `
      + `Manual cleanup IDs: userId=${state.userId} runId=${state.runId} organizationId=${state.organizationId}.`,
  );
}

/**
 * Order: verify every lookup (Auth lookups fail closed), remove the member's
 * own storage and prove its prefixes are empty, delete the Auth user and prove
 * it is gone (explicit not-found), and only then delete the Prisma user and
 * prove it is gone. Any failure throws with the exact recorded IDs and leaves
 * the Prisma row in place so rerunning cleanup can finish.
 */
export async function cleanupFixture(target: PortalQaTarget, state: FixtureState, deps: FixtureDeps) {
  if (!UUID.test(state.userId) || !RESUME_QA_EMAIL.test(state.email) || state.organizationId !== target.organizationId) {
    throw new Error('Refusing cleanup: the recorded state is not a synthetic acceptance member of this organization.');
  }
  // Exact organization only: a second portal-qa org appearing mid-run must not
  // strand the member this run created.
  await assertOrganization(target, deps, { requireOnly: false });

  const dbUser = await deps.findUserById(state.userId);
  if (dbUser && (dbUser.email.toLowerCase() !== state.email || dbUser.organizationId !== target.organizationId)) {
    throw new Error('Refusing cleanup: the database user with the recorded ID is not the synthetic member.');
  }
  let authUser: Awaited<ReturnType<FixtureDeps['getAuthUser']>>;
  try {
    authUser = await withRetry(deps, () => deps.getAuthUser(state.userId));
  } catch {
    throw strandedError(state, 'Auth lookup');
  }
  if (authUser && (authUser.email?.toLowerCase() !== state.email || authUser.appMetadata.resume_acceptance_fixture !== true)) {
    throw new Error('Refusing cleanup: the Auth user with the recorded ID is not the synthetic member.');
  }

  // Storage first, via the GDPR helper scoped to this exact user ID: it lists
  // only the member's own prefixes, keeps extra paths only when they are owned
  // by that ID, and fails closed on any error other than "not found".
  const before = await countMemberStorageObjects(deps.storage, state.userId);
  const extraPaths = [dbUser?.resumeOriginalPath, dbUser?.resumeEnhancedPath]
    .filter((path): path is string => Boolean(path))
    .map((path) => ({ bucket: MEMBER_RESUME_BUCKET, path }));
  const removed = await deleteUserStorageObjects(state.userId, {
    supabaseAdmin: deps.storage,
    extraPaths,
    claimAgreementErasure: deps.claimAgreementErasure,
  });
  if (!removed.ok) {
    throw new Error(`Synthetic member storage cleanup failed after removing ${removed.deleted.length} object(s); database and Auth rows were kept for a retry. Manual cleanup IDs: userId=${state.userId} runId=${state.runId}.`);
  }
  const after = await countMemberStorageObjects(deps.storage, state.userId);
  if (Object.values(after).some((count) => count > 0)) {
    throw strandedError(state, 'storage prefixes not empty');
  }

  if (authUser) {
    try {
      await withRetry(deps, () => deps.deleteAuthUser(state.userId));
    } catch {
      throw strandedError(state, 'Auth delete');
    }
  }
  let authStillPresent: Awaited<ReturnType<FixtureDeps['getAuthUser']>>;
  try {
    authStillPresent = await withRetry(deps, () => deps.getAuthUser(state.userId));
  } catch {
    throw strandedError(state, 'Auth absence check');
  }
  if (authStillPresent) throw strandedError(state, 'Auth user still present');

  if (dbUser) {
    try {
      await withRetry(deps, () => deps.deleteUser(state.userId));
    } catch {
      throw strandedError(state, 'database delete');
    }
  }
  // Explicit post-delete lookup by the exact ID.
  if (await deps.findUserById(state.userId)) throw strandedError(state, 'database user still present');

  return {
    storage: { before, removed: removed.deleted.length, after },
    authAbsenceVerified: true,
    prismaUserAbsenceVerified: true,
    authUserDeleted: Boolean(authUser),
    databaseUserDeleted: Boolean(dbUser),
  };
}

/**
 * Supabase Auth's explicit user-not-found answer: AuthApiError.code
 * `user_not_found` (@supabase/auth-js ErrorCode). A bare HTTP 404 without that
 * code (for example a misrouted admin endpoint) is NOT treated as absent.
 */
export function isAuthNotFound(error: { status?: number; code?: string } | null | undefined): boolean {
  return error?.code === 'user_not_found';
}

/** Constructor seam permits mock-only verification of the validated DEMO target. */
export function liveDeps(
  target: PortalQaTarget,
  env: NodeJS.ProcessEnv,
  { createPrismaClient = () => new PrismaClient({ datasourceUrl: target.databaseUrl }) }: {
    createPrismaClient?: (databaseUrl: string) => PrismaClient;
  } = {},
) {
  const prisma = createPrismaClient(target.databaseUrl);
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const deps: FixtureDeps = {
    findOrganization: (id) => prisma.organization.findUnique({ where: { id }, select: { id: true, slug: true, active: true } }),
    countActivePortalQaOrganizations: () =>
      prisma.organization.count({ where: { active: true, slug: { startsWith: 'portal-qa-' } } }),
    findUserIdByEmail: async (email) =>
      (await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }))?.id ?? null,
    findUserById: async (id) => {
      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, organizationId: true, profile: { select: { resumeOriginalPath: true, resumeEnhancedPath: true } } },
      });
      return user && {
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        resumeOriginalPath: user.profile?.resumeOriginalPath ?? null,
        resumeEnhancedPath: user.profile?.resumeEnhancedPath ?? null,
      };
    },
    createMember: async ({ id, organizationId, email, fullName }) => {
      await prisma.$transaction(async (tx) => {
        const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, slug: true, active: true } });
        assertPortalQaOrganization(org, target);
        const memberRole = await tx.role.findUniqueOrThrow({ where: { name: 'member' } });
        await tx.user.create({
          data: {
            id, organizationId, email, fullName,
            userRoles: { create: { roleId: memberRole.id } },
            profile: { create: { consentTerms: true } },
          },
        });
      });
    },
    deleteUser: async (id) => { await prisma.user.delete({ where: { id } }); },
    createAuthUser: async ({ email, password, fullName, appMetadata }) => {
      const { data, error } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: appMetadata,
      });
      if (error || !data.user) throw new Error('Synthetic member Auth creation failed. No other account was changed.');
      return data.user.id;
    },
    getAuthUser: async (id) => {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (error) {
        // Only an explicit not-found means "absent"; anything else fails closed.
        if (isAuthNotFound(error)) return null;
        throw new Error('Synthetic member Auth lookup failed.');
      }
      if (!data.user) throw new Error('Synthetic member Auth lookup returned no user and no error.');
      return { id: data.user.id, email: data.user.email ?? null, appMetadata: data.user.app_metadata ?? {} };
    },
    deleteAuthUser: async (id) => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw new Error('Synthetic member Auth deletion failed.');
    },
    storage: supabase as unknown as MemberStorageAdmin,
    // Both capability and fence SQL must use this exact guarded DEMO client,
    // never the application's ambient/default database (including fallback envs).
    claimAgreementErasure: (id) => claimEnrollmentAgreementErasure(id, prisma),
  };
  return { deps, close: () => prisma.$disconnect() };
}

/** The CLI (exported for the mocked tests). */
export async function main(
  command: string | undefined,
  env: NodeJS.ProcessEnv,
  { fetchImpl = globalThis.fetch }: { fetchImpl?: typeof fetch } = {},
) {
  const stateFile = env.RESUME_QA_STATE_FILE?.trim();
  if (!stateFile) throw new Error('Set RESUME_QA_STATE_FILE.');
  const markerFile = env.RESUME_QA_MARKER_FILE?.trim() || `${stateFile}.marker`;
  const stageFile = env.RESUME_QA_STAGE_FILE?.trim() || `${stateFile}.stage`;

  if (command === 'create') {
    // First, before anything can fail: no client or Auth call is possible yet.
    writeFileSync(stageFile, JSON.stringify({ stage: 'target-guard' } satisfies CreateStage));
    const target = readPortalQaTarget(env) as PortalQaTarget;
    // Hard gate before any marker, client or Auth write: one read-only probe
    // to the hardcoded DEMO origin must accept this service key.
    writeFileSync(stageFile, JSON.stringify({ stage: 'key-probe' } satisfies CreateStage));
    const keyCheck = await probeDemoServiceKey({ url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl });
    if (keyCheck.urlProject !== 'demo' || keyCheck.key !== 'valid') {
      throw new Error(`The DEMO service key check did not pass (urlProject ${keyCheck.urlProject}, key ${keyCheck.key}); nothing was created.`);
    }
    if (!env.GITHUB_ENV) throw new Error('create hands the credentials to later steps through GITHUB_ENV.');
    const identity = syntheticIdentity(env.GITHUB_RUN_ID ?? '', env.GITHUB_RUN_ATTEMPT ?? '');
    // Past the guard: from here on a missing marker can no longer be read as
    // "nothing was attempted", so cleanup fails closed without one.
    writeFileSync(stageFile, JSON.stringify({ stage: 'clients', email: identity.email } satisfies CreateStage));
    const password = generatePassword();
    console.log(`::add-mask::${password}`);
    const { deps, close } = liveDeps(target, env);
    try {
      const state = await createFixture(
        target, identity, password, deps,
        (created) => { writeFileSync(stateFile, JSON.stringify(created)); },
        (marker) => { writeFileSync(markerFile, JSON.stringify(marker)); },
      );
      // The spec checks it signed in as exactly this member and records the
      // ID, email and run ID so the final verifier can match the cleanup receipt.
      appendFileSync(
        env.GITHUB_ENV,
        `RESUME_ACCEPTANCE_MEMBER_EMAIL=${state.email}\nRESUME_ACCEPTANCE_MEMBER_PASSWORD=${password}\n`
          + `RESUME_ACCEPTANCE_MEMBER_ID=${state.userId}\nRESUME_ACCEPTANCE_RUN_ID=${state.runId}\n`,
      );
      console.log(`Created synthetic acceptance member ${state.userId} for run ${state.runId}.`);
    } finally {
      await close();
    }
    return;
  }

  if (command === 'cleanup') {
    const output = env.RESUME_QA_CLEANUP_OUTPUT?.trim();
    const writeReceipt = (receipt: Record<string, unknown>) => {
      if (!output) return;
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, `${JSON.stringify({ auditRowsRetained: true, ...receipt }, null, 2)}\n`);
    };
    const readIfPresent = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
    let input: CleanupInput;
    try {
      input = resolveCleanupInput(readIfPresent(markerFile), readIfPresent(stateFile), readIfPresent(stageFile));
    } catch (error) {
      writeReceipt({ success: false, memberCreated: 'unknown', error: (error as Error).message });
      throw error;
    }
    // Decided from the local files alone, before the target guard, so it needs
    // no DEMO URL or client. Informational only: the combined verifier still
    // fails the run, and this receipt is never proof that no member exists.
    if (input.kind === 'stopped-before-clients') {
      writeReceipt({
        success: true,
        // Means "no marker found in a run whose create stopped before any
        // client (at the target guard or the read-only key probe)", NOT
        // "proven absent". Kept because the verifier keys on it.
        memberCreated: false,
        markerFound: false,
        memberCreationAttempted: 'not-observed',
        informationalOnly: true,
        failedStage: input.failedStage,
      });
      console.log(`create stopped at ${input.failedStage} before any client or Auth write; no marker was found and nothing was cleaned up (informational receipt).`);
      return;
    }
    const { state } = input;
    let target: PortalQaTarget;
    try {
      target = readPortalQaTarget(env) as PortalQaTarget;
    } catch (error) {
      // A member may exist but the target cannot be proven DEMO: touch nothing,
      // and record the exact IDs for a reviewed manual cleanup.
      writeReceipt({
        success: false, memberCreated: true, userId: state.userId, email: state.email, runId: state.runId,
        error: (error as Error).message,
      });
      throw error;
    }
    const { deps, close } = liveDeps(target, env);
    try {
      const result = await cleanupFixture(target, state, deps);
      // success only when storage prefixes are empty and Auth and Prisma absence are verified.
      writeReceipt({ success: true, memberCreated: true, userId: state.userId, email: state.email, runId: state.runId, ...result });
      console.log(`Cleaned up synthetic acceptance member ${state.userId}: ${JSON.stringify(result)}. Audit rows are retained by design.`);
    } catch (error) {
      writeReceipt({
        success: false, memberCreated: true, userId: state.userId, email: state.email, runId: state.runId,
        error: error instanceof Error && Object.getPrototypeOf(error) === Error.prototype ? error.message : 'cleanup failed',
      });
      throw error;
    } finally {
      await close();
    }
    return;
  }

  throw new Error('Usage: resume-demo-member.ts create|cleanup');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2], process.env).catch((error: unknown) => {
    // Only this script's and the guard's own plain Errors are printed; they
    // never include URLs, keys or passwords. Client errors (Prisma, Supabase)
    // can carry connection details, so only their class name is shown.
    const plain = error instanceof Error && Object.getPrototypeOf(error) === Error.prototype;
    console.error(plain ? (error as Error).message : `Synthetic acceptance member step failed (${error instanceof Error ? error.name : 'unknown error'}).`);
    process.exitCode = 1;
  });
}
