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
 * RESUME_QA_STATE_FILE; `create` also needs GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_ENV.
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
export const RESUME_QA_EMAIL = /^resume-qa-\d{1,20}-\d{1,4}@example\.com$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PortalQaTarget { organizationId: string; organizationSlug: string; databaseUrl: string }
export interface FixtureState { userId: string; email: string; organizationId: string; runId: string }

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
  getAuthUser(id: string): Promise<{ id: string; email: string | null; appMetadata: Record<string, unknown> } | null>;
  deleteAuthUser(id: string): Promise<void>;
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
): Promise<FixtureState> {
  if (!RESUME_QA_EMAIL.test(identity.email)) throw new Error('Refusing a non-synthetic acceptance identity.');
  await assertOrganization(target, deps, { requireOnly: true });
  if (await deps.findUserIdByEmail(identity.email)) {
    throw new Error('The synthetic acceptance member for this run already exists. Nothing was changed.');
  }
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
  const authUser = await deps.getAuthUser(state.userId);
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
  const removed = await deleteUserStorageObjects(state.userId, { supabaseAdmin: deps.storage, extraPaths });
  if (!removed.ok) {
    throw new Error(`Synthetic member storage cleanup failed after removing ${removed.deleted.length} object(s); database and Auth rows were kept for a retry.`);
  }
  const after = await countMemberStorageObjects(deps.storage, state.userId);
  if (Object.values(after).some((count) => count > 0)) {
    throw new Error('Synthetic member storage objects remain after cleanup; database and Auth rows were kept for a retry.');
  }
  if (dbUser) await deps.deleteUser(state.userId);
  if (authUser) await deps.deleteAuthUser(state.userId);
  return {
    storage: { before, removed: removed.deleted.length, after },
    databaseUserDeleted: Boolean(dbUser),
    authUserDeleted: Boolean(authUser),
  };
}

function liveDeps(target: PortalQaTarget, env: NodeJS.ProcessEnv) {
  const prisma = new PrismaClient({ datasourceUrl: target.databaseUrl });
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
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null, appMetadata: data.user.app_metadata ?? {} };
    },
    deleteAuthUser: async (id) => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw new Error('Synthetic member Auth deletion failed.');
    },
    storage: supabase as unknown as MemberStorageAdmin,
  };
  return { deps, close: () => prisma.$disconnect() };
}

async function main(command: string | undefined, env: NodeJS.ProcessEnv) {
  const target = readPortalQaTarget(env) as PortalQaTarget;
  const stateFile = env.RESUME_QA_STATE_FILE?.trim();
  if (!stateFile) throw new Error('Set RESUME_QA_STATE_FILE.');

  if (command === 'create') {
    if (!env.GITHUB_ENV) throw new Error('create hands the credentials to later steps through GITHUB_ENV.');
    const identity = syntheticIdentity(env.GITHUB_RUN_ID ?? '', env.GITHUB_RUN_ATTEMPT ?? '');
    const password = generatePassword();
    console.log(`::add-mask::${password}`);
    const { deps, close } = liveDeps(target, env);
    try {
      const state = await createFixture(target, identity, password, deps, (created) => {
        writeFileSync(stateFile, JSON.stringify(created));
      });
      appendFileSync(env.GITHUB_ENV, `RESUME_ACCEPTANCE_MEMBER_EMAIL=${state.email}\nRESUME_ACCEPTANCE_MEMBER_PASSWORD=${password}\n`);
      console.log(`Created synthetic acceptance member ${state.userId} for run ${state.runId}.`);
    } finally {
      await close();
    }
    return;
  }

  if (command === 'cleanup') {
    if (!existsSync(stateFile)) {
      console.log('No synthetic acceptance member was recorded; nothing to clean up.');
      return;
    }
    const state = JSON.parse(readFileSync(stateFile, 'utf8')) as FixtureState;
    const { deps, close } = liveDeps(target, env);
    try {
      const result = await cleanupFixture(target, state, deps);
      const output = env.RESUME_QA_CLEANUP_OUTPUT?.trim();
      if (output) mkdirSync(dirname(output), { recursive: true });
      if (output) writeFileSync(output, `${JSON.stringify({ ...result, auditRowsRetained: true }, null, 2)}\n`);
      console.log(`Cleaned up synthetic acceptance member ${state.userId}: ${JSON.stringify(result)}. Audit rows are retained by design.`);
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
