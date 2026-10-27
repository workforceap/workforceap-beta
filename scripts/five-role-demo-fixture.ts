#!/usr/bin/env npx tsx
/**
 * Disposable five-role DEMO fixtures. The CLI delegates to demo-acceptance-cli:
 * plan, create, readback, cleanup, recover-cleanup and complete-preassessment.
 * AuditLog is authoritative; state files are sanitized convenience exports.
 * All live writes require the dedicated DEMO target and durable coordinator.
 * Pure fixture functions accept explicit dependencies for offline tests.
 */
import { basename } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { assertPortalQaOrganization } from './lib/portal-qa-guard.cjs';
import { main } from './lib/demo-acceptance-cli';
export { main } from './lib/demo-acceptance-cli';
import {
  emailFor,
  FIVE_ROLES,
  partnerSlugFor,
  RUN_ID,
  seededValueFor,
  writtenValueFor,
} from './lib/five-role-acceptance.mjs';

export type Role = 'member' | 'counselor' | 'admin' | 'employer' | 'partner';
const ROLES = FIVE_ROLES as readonly Role[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FIXTURE_FLAG = 'wap6_five_role_fixture';

export interface PortalQaTarget { organizationId: string; organizationSlug: string; databaseUrl: string }
export interface RecordedUser { userId: string; email: string }
export interface FixtureState {
  runId: string;
  organizationId: string;
  users: Partial<Record<Role, RecordedUser>>;
  partnerId?: string;
  employerId?: string;
  /**
   * The write in flight, saved BEFORE it is sent: a role while its Auth user is
   * being created, `role-rows` while the database transaction runs. A crash
   * or a lost response leaves it set, so cleanup knows to look the object up
   * by its exact email or slug.
   */
  pending?: Role | 'role-rows';
}
export interface CreationMarker { runId: string; organizationId: string; emails: Record<Role, string> }
export interface FixtureDeps {
  findOrganization(id: string): Promise<{ id: string; slug: string; active: boolean } | null>;
  countActivePortalQaOrganizations(): Promise<number>;
  findUserIdByEmail(email: string): Promise<string | null>;
  findUserById(id: string): Promise<{ id: string; email: string; organizationId: string } | null>;
  createAuthUser(input: { email: string; password: string; fullName: string; appMetadata: Record<string, unknown> }): Promise<string>;
  /** null ONLY on an explicit `user_not_found`; every other error throws. */
  getAuthUser(id: string): Promise<{ id: string; email: string | null; appMetadata: Record<string, unknown> } | null>;
  /** The Auth user with exactly this email, or null when none exists; errors throw. */
  findAuthUserByEmail(email: string): Promise<{ id: string; email: string | null; appMetadata: Record<string, unknown> } | null>;
  deleteAuthUser(id: string): Promise<void>;
  /** One transaction: users, role rows, partner, employer, counselor and assignment. */
  createRoleRows(input: {
    organizationId: string;
    users: Record<Role, RecordedUser>;
    partner: { slug: string; name: string; referralCode: string };
    employerCompanyName: string;
  }): Promise<{ partnerId: string; employerId: string }>;
  deleteUser(id: string): Promise<void>;
  findPartner(id: string): Promise<{ id: string; organizationId: string; slug: string; name: string } | null>;
  /** The partner with this (globally unique) slug, in any organization. */
  findPartnerBySlug(slug: string): Promise<{ id: string; organizationId: string; slug: string; name: string } | null>;
  deletePartner(id: string): Promise<void>;
  /** Notes whose member is `memberId`, or whose author is one of `authorIds`. */
  countNotes(scope: { memberId: string | null; authorIds: string[] }): Promise<number>;
  listNotes(scope: { memberId: string | null; authorIds: string[] }): Promise<Array<{ id: string; memberId: string | null; authorId: string | null; content: string }>>;
  validateCleanup?(state: FixtureState): Promise<void>;
  deleteNotes(scope: { memberId: string | null; authorIds: string[] }): Promise<number>;
  findGoal(id: string): Promise<{ id: string; userId: string; title: string } | null>;
  findNote(id: string): Promise<{ id: string; memberId: string | null; authorId: string | null; content: string } | null>;
  findEmployer(id: string): Promise<{ id: string; userId: string; companyName: string } | null>;
  sleep?(ms: number): Promise<void>;
}

function isRecordedUser(value: unknown, runId: string, role: Role): value is RecordedUser {
  const v = value as Partial<RecordedUser> | null;
  return Boolean(v) && typeof v!.userId === 'string' && UUID.test(v!.userId) && v!.email === emailFor(runId, role);
}

/** A state file this run wrote: a first-attempt run ID and only well-formed synthetic users. */
export function isFixtureState(value: unknown): value is FixtureState {
  const v = value as Partial<FixtureState> | null;
  if (!v || typeof v.runId !== 'string' || !RUN_ID.test(v.runId) || typeof v.organizationId !== 'string') return false;
  if (!v.users || typeof v.users !== 'object') return false;
  for (const [role, user] of Object.entries(v.users)) {
    if (!ROLES.includes(role as Role) || !isRecordedUser(user, v.runId, role as Role)) return false;
  }
  for (const key of ['partnerId', 'employerId'] as const) {
    if (v[key] !== undefined && !(typeof v[key] === 'string' && UUID.test(v[key]!))) return false;
  }
  if (v.pending !== undefined && v.pending !== 'role-rows' && !ROLES.includes(v.pending as Role)) return false;
  return true;
}

/**
 * The dispatch inputs must name the exact, active fixture organization. Before
 * creating, it must also be the only active portal-qa-* organization.
 */
async function assertOrganization(target: PortalQaTarget, deps: FixtureDeps, { requireOnly }: { requireOnly: boolean }) {
  assertPortalQaOrganization(await deps.findOrganization(target.organizationId), target);
  if (requireOnly && (await deps.countActivePortalQaOrganizations()) !== 1) {
    throw new Error('Expected exactly one active portal-qa-* organization. No fixture writes are allowed.');
  }
}

/**
 * Create the five users. The marker (run ID and emails, no secrets) is
 * written before the first Auth call. The state is written before every write
 * (with `pending` naming it) and after it (with the returned ID), so a failure
 * or a lost response part-way always leaves enough for cleanup: exact IDs, or
 * the exact email or slug of the one write that may have landed.
 */
export async function createFixtures(
  target: PortalQaTarget,
  runId: string,
  passwords: Record<Role, string>,
  deps: FixtureDeps,
  onState: (state: FixtureState) => unknown | Promise<unknown>,
  onMarker: (marker: CreationMarker) => unknown | Promise<unknown>,
): Promise<FixtureState> {
  const emails = Object.fromEntries(ROLES.map((role) => [role, emailFor(runId, role)])) as Record<Role, string>;
  if (new Set(Object.values(passwords)).size !== ROLES.length || ROLES.some((role) => !passwords[role] || passwords[role].length < 24)) {
    throw new Error('Each synthetic user needs its own generated password.');
  }
  await assertOrganization(target, deps, { requireOnly: true });
  for (const role of ROLES) {
    if (await deps.findUserIdByEmail(emails[role]) || await deps.findAuthUserByEmail(emails[role])) {
      throw new Error(`The synthetic ${role} for this run already exists. Nothing was changed.`);
    }
  }
  await onMarker({ runId, organizationId: target.organizationId, emails });
  const state: FixtureState = { runId, organizationId: target.organizationId, users: {} };
  for (const role of ROLES) {
    state.pending = role;
    await onState(structuredClone(state));
    const userId = await deps.createAuthUser({
      email: emails[role],
      password: passwords[role],
      fullName: `WAP-6 QA ${role}`,
      appMetadata: { [FIXTURE_FLAG]: true, run_id: runId, role, portal_qa_organization_id: target.organizationId },
    });
    if (!UUID.test(userId)) throw new Error('Auth returned a user ID that is not a UUID.');
    state.users[role] = { userId, email: emails[role] };
    delete state.pending;
    await onState(structuredClone(state));
  }
  state.pending = 'role-rows';
  await onState(structuredClone(state));
  const { partnerId, employerId } = await deps.createRoleRows({
    organizationId: target.organizationId,
    users: state.users as Record<Role, RecordedUser>,
    partner: { slug: partnerSlugFor(runId), name: seededValueFor(runId, 'partner'), referralCode: `QA-WAP6-${runId}` },
    employerCompanyName: seededValueFor(runId, 'employer'),
  });
  state.partnerId = partnerId;
  state.employerId = employerId;
  delete state.pending;
  await onState(structuredClone(state));
  return state;
}

export interface AcceptanceRecords { runId?: unknown; roles?: Partial<Record<Role, { recordId?: unknown }>> }

/**
 * Read-only: find every row the spec wrote by the ID the acceptance receipt
 * recorded, and check owner and value. A role with no recorded ID is
 * `found: false`. Employer and partner rows are the fixture's own IDs.
 */
export async function readbackPersistence(state: FixtureState, acceptance: AcceptanceRecords | null, deps: FixtureDeps) {
  const users = state.users as Record<Role, RecordedUser>;
  const recorded = (role: Role) => {
    const value = acceptance?.roles?.[role]?.recordId;
    return typeof value === 'string' && UUID.test(value) ? value : null;
  };
  const roles = {} as Record<Role, { userId: string | null; recordId: string | null; found: boolean; ownerMatched: boolean; valueMatched: boolean }>;
  const member = users.member?.userId ?? null;

  const goalId = recorded('member');
  const goal = goalId ? await deps.findGoal(goalId) : null;
  roles.member = {
    userId: member, recordId: goalId, found: Boolean(goal),
    ownerMatched: Boolean(goal && member && goal.userId === member),
    valueMatched: goal?.title === writtenValueFor(state.runId, 'member'),
  };
  for (const role of ['counselor', 'admin'] as const) {
    const noteId = recorded(role);
    const note = noteId ? await deps.findNote(noteId) : null;
    roles[role] = {
      userId: users[role]?.userId ?? null, recordId: noteId, found: Boolean(note),
      ownerMatched: Boolean(note && member && note.memberId === member && note.authorId === users[role]?.userId),
      valueMatched: note?.content === writtenValueFor(state.runId, role),
    };
  }
  const employer = state.employerId ? await deps.findEmployer(state.employerId) : null;
  roles.employer = {
    userId: users.employer?.userId ?? null, recordId: state.employerId ?? null, found: Boolean(employer),
    ownerMatched: Boolean(employer && employer.userId === users.employer?.userId),
    valueMatched: employer?.companyName === writtenValueFor(state.runId, 'employer'),
  };
  const partner = state.partnerId ? await deps.findPartner(state.partnerId) : null;
  roles.partner = {
    userId: users.partner?.userId ?? null, recordId: state.partnerId ?? null, found: Boolean(partner),
    ownerMatched: Boolean(partner && partner.organizationId === state.organizationId && partner.slug === partnerSlugFor(state.runId)),
    valueMatched: partner?.name === writtenValueFor(state.runId, 'partner'),
  };
  const recordsMatchAcceptance = (['employer', 'partner'] as const).every((role) => recorded(role) === roles[role].recordId);
  const success = acceptance?.runId === state.runId && recordsMatchAcceptance
    && ROLES.every((role) => roles[role].found && roles[role].ownerMatched && roles[role].valueMatched);
  return { success, roles };
}

async function withRetry<T>(_deps: FixtureDeps, call: () => Promise<T>): Promise<T> {
  // Reads and deletes are attempted once. Uncertain writes require durable reconciliation.
  return call();
}
function stranded(state: FixtureState, step: string): Error {
  const ids = ROLES.flatMap((role) => (state.users[role] ? [`${role}=${state.users[role]!.userId}`] : [])).join(' ');
  return new Error(
    `Synthetic five-role cleanup failed at "${step}". Remaining rows were kept for a rerun of cleanup. `
      + `Manual cleanup IDs: runId=${state.runId} ${ids} partnerId=${state.partnerId ?? 'none'} `
      + `(unrecorded users: look up the exact emails wap6-qa-${state.runId}-<role>@example.com; partner slug ${partnerSlugFor(state.runId)}).`,
  );
}

type AuthUser = { id: string; email: string | null; appMetadata: Record<string, unknown> };

/** Only this run's own synthetic Auth user for this role and organization. */
function isOwnAuthUser(user: AuthUser, state: FixtureState, role: Role) {
  return user.email?.toLowerCase() === emailFor(state.runId, role)
    && user.appMetadata[FIXTURE_FLAG] === true
    && user.appMetadata.run_id === state.runId
    && user.appMetadata.role === role
    && user.appMetadata.portal_qa_organization_id === state.organizationId;
}

/** Record IDs the spec reported writing (only used for read-only absence checks). */
export type AcceptanceRecordIds = Partial<Record<Role, string>>;

export function acceptanceRecordIds(acceptance: AcceptanceRecords | null | undefined): AcceptanceRecordIds {
  const ids: AcceptanceRecordIds = {};
  for (const role of ROLES) {
    const value = acceptance?.roles?.[role]?.recordId;
    if (typeof value === 'string' && UUID.test(value)) ids[role] = value;
  }
  return ids;
}

/**
 * Remove this run's fixtures and prove each one is gone.
 *
 * Every role is resolved first: a recorded user by its ID, and a role the
 * state does not record (its Auth call may have landed with the response
 * lost) by its exact synthetic email. Either must be this run's flagged
 * fixture, for this role and organization, or cleanup refuses and deletes
 * nothing. The partner is found by its recorded ID or, when the database
 * transaction's result was lost, by its exact per-run slug.
 *
 * Order: notes (they use SET NULL and would outlive the users), Auth users,
 * database users (role, profile, employer, counselor, assignment, partner
 * link, goal and event rows cascade), then the partner. Each absence is
 * checked by a real lookup after the delete (by ID and by email or slug), and
 * so are the goal, both notes and the employer row the spec reported. Any
 * failure throws with the exact IDs.
 */
export async function cleanupFixtures(
  target: PortalQaTarget,
  state: FixtureState,
  deps: FixtureDeps,
  recordIds: AcceptanceRecordIds = {},
) {
  if (!isFixtureState(state) || state.organizationId !== target.organizationId) {
    throw new Error('Refusing cleanup: the recorded state is not a synthetic five-role fixture of this organization.');
  }
  await assertOrganization(target, deps, { requireOnly: false });
  await deps.validateCleanup?.(state);

  const resolved = {} as Record<Role, { userId: string | null; email: string; auth: boolean; db: boolean; recoveredByEmail: boolean }>;
  for (const role of ROLES) {
    const email = emailFor(state.runId, role);
    const recorded = state.users[role];
    if (recorded) {
      const dbUser = await deps.findUserById(recorded.userId);
      if (dbUser && (dbUser.email.toLowerCase() !== email || dbUser.organizationId !== target.organizationId)) {
        throw new Error(`Refusing cleanup: the database user recorded as the ${role} is not this run's synthetic user.`);
      }
      let authUser: AuthUser | null;
      try {
        authUser = await withRetry(deps, () => deps.getAuthUser(recorded.userId));
      } catch {
        throw stranded(state, `${role} Auth lookup`);
      }
      if (authUser && !isOwnAuthUser(authUser, state, role)) {
        throw new Error(`Refusing cleanup: the Auth user recorded as the ${role} is not this run's synthetic user.`);
      }
      resolved[role] = { userId: recorded.userId, email, auth: Boolean(authUser), db: Boolean(dbUser), recoveredByEmail: false };
      continue;
    }
    // Not recorded: the Auth create may have succeeded with its response lost.
    let authUser: AuthUser | null;
    try {
      authUser = await withRetry(deps, () => deps.findAuthUserByEmail(email));
    } catch {
      throw stranded(state, `${role} Auth lookup by email`);
    }
    if (authUser && !isOwnAuthUser(authUser, state, role)) {
      throw new Error(`Refusing cleanup: an Auth user with this run's ${role} email is not this run's flagged fixture.`);
    }
    const dbUserId = await deps.findUserIdByEmail(email);
    if (dbUserId && dbUserId !== authUser?.id) {
      throw new Error(`Refusing cleanup: a database user with this run's ${role} email is not the recovered Auth user.`);
    }
    const dbUser = dbUserId ? await deps.findUserById(dbUserId) : null;
    if (dbUser && dbUser.organizationId !== target.organizationId) {
      throw new Error(`Refusing cleanup: the database user with this run's ${role} email is in another organization.`);
    }
    resolved[role] = { userId: authUser?.id ?? null, email, auth: Boolean(authUser), db: Boolean(dbUser), recoveredByEmail: true };
  }

  const slug = partnerSlugFor(state.runId);
  const byId = state.partnerId ? await deps.findPartner(state.partnerId) : null;
  const bySlug = await deps.findPartnerBySlug(slug);
  for (const candidate of [byId, bySlug]) {
    if (candidate && (candidate.organizationId !== target.organizationId || candidate.slug !== slug)) {
      throw new Error('Refusing cleanup: the partner organization is not this run\'s synthetic partner.');
    }
  }
  if (byId && bySlug && byId.id !== bySlug.id) {
    throw new Error('Refusing cleanup: the recorded partner ID and this run\'s partner slug name different rows.');
  }
  const partner = byId ?? bySlug;

  const noteScope = {
    memberId: resolved.member.userId,
    authorIds: (['counselor', 'admin'] as const).flatMap((role) => (resolved[role].userId ? [resolved[role].userId!] : [])),
  };
  let notesDeleted = 0;
  const scopedNotes = await deps.listNotes(noteScope);
  for (const note of scopedNotes) {
    const role = (['counselor', 'admin'] as const).find(candidate => resolved[candidate].userId === note.authorId);
    if (!role || note.memberId !== noteScope.memberId || note.content !== writtenValueFor(state.runId, role) ||
        recordIds[role] !== note.id) throw new Error('Unexpected note relationship or value; cleanup refused.');
  }
  if (noteScope.memberId || noteScope.authorIds.length) {
    try {
      notesDeleted = await withRetry(deps, () => deps.deleteNotes(noteScope));
    } catch {
      throw stranded(state, 'note delete');
    }
  }
  const notesAbsent = noteScope.memberId || noteScope.authorIds.length ? (await deps.countNotes(noteScope)) === 0 : true;
  if (!notesAbsent) throw stranded(state, 'notes still present');

  const users = {} as Record<Role, Record<string, unknown>>;
  for (const role of ROLES) {
    const { userId, email, auth, recoveredByEmail } = resolved[role];
    if (auth && userId) {
      try {
        await withRetry(deps, () => deps.deleteAuthUser(userId));
      } catch {
        throw stranded(state, `${role} Auth delete`);
      }
    }
    try {
      if (userId && (await withRetry(deps, () => deps.getAuthUser(userId)))) throw stranded(state, `${role} Auth user still present`);
      if (await withRetry(deps, () => deps.findAuthUserByEmail(email))) throw stranded(state, `${role} Auth user still present by email`);
    } catch (error) {
      if ((error as Error).message.startsWith('Synthetic five-role cleanup failed')) throw error;
      throw stranded(state, `${role} Auth absence check`);
    }
    users[role] = { userId, email, recoveredByEmail, authUserDeleted: auth, authAbsenceVerified: true };
  }
  for (const role of ROLES) {
    const { userId, email, db } = resolved[role];
    if (db && userId) {
      try {
        await withRetry(deps, () => deps.deleteUser(userId));
      } catch {
        throw stranded(state, `${role} database delete`);
      }
    }
    if ((userId && (await deps.findUserById(userId))) || (await deps.findUserIdByEmail(email))) {
      throw stranded(state, `${role} database user still present`);
    }
    Object.assign(users[role], { databaseUserDeleted: db, databaseAbsenceVerified: true });
  }

  if (partner) {
    try {
      await withRetry(deps, () => deps.deletePartner(partner.id));
    } catch {
      throw stranded(state, 'partner delete');
    }
  }
  const partnerAbsent = !(state.partnerId && (await deps.findPartner(state.partnerId))) && !(await deps.findPartnerBySlug(slug));
  if (!partnerAbsent) throw stranded(state, 'partner still present');

  // Per-record absence of what the spec wrote, by exact ID (null = no ID to check).
  const absent = async (id: string | undefined, find: (id: string) => Promise<unknown>, what: string) => {
    if (!id) return { recordId: null, absenceVerified: null };
    if (await find(id)) throw stranded(state, `${what} still present`);
    return { recordId: id, absenceVerified: true };
  };
  const records = {
    member: await absent(recordIds.member, deps.findGoal, 'goal'),
    counselor: await absent(recordIds.counselor, deps.findNote, 'counselor note'),
    admin: await absent(recordIds.admin, deps.findNote, 'admin note'),
    employer: await absent(state.employerId, deps.findEmployer, 'employer row'),
    partner: await absent(partner?.id ?? state.partnerId, deps.findPartner, 'partner'),
  };

  const complete = ROLES.every((role) => state.users[role]) && Boolean(state.partnerId && state.employerId) && !state.pending;
  return {
    fixturesCreated: complete ? true : 'partial',
    users,
    partner: {
      partnerId: partner?.id ?? state.partnerId ?? null,
      recoveredBySlug: Boolean(!byId && bySlug),
      deleted: Boolean(partner),
      absenceVerified: partnerAbsent,
    },
    notes: { deleted: notesDeleted, absenceVerified: notesAbsent },
    records,
  };
}

export async function createRoleRowsIn(tx: Prisma.TransactionClient, target: PortalQaTarget, { organizationId, users, partner, employerCompanyName }: Parameters<FixtureDeps['createRoleRows']>[0]) {
      assertPortalQaOrganization(
        await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, slug: true, active: true } }),
        target,
      );
      const role = async (name: Role) => (await tx.role.findUniqueOrThrow({ where: { name } })).id;
      const partnerRow = await tx.partner.create({
        data: {
          organizationId, name: partner.name, slug: partner.slug, referralCode: partner.referralCode,
          status: 'active', active: true,
          notifyOnEnrollment: false, notifyOnCourse: false, notifyOnCertified: false, notifyOnPlaced: false,
        },
        select: { id: true },
      });
      const base = (r: Role) => ({ id: users[r].userId, organizationId, email: users[r].email, fullName: `WAP-6 QA ${r}` });
      await tx.user.create({
        data: { ...base('member'), userRoles: { create: { roleId: await role('member') } }, profile: { create: { consentTerms: true } } },
      });
      await tx.user.create({
        data: {
          ...base('counselor'),
          userRoles: { create: { roleId: await role('counselor') } },
          profile: { create: { consentTerms: true, role: 'counselor' } },
          counselorProfile: { create: { affiliation: 'wap_staff', active: true } },
        },
      });
      const counselor = await tx.counselor.findUniqueOrThrow({ where: { userId: users.counselor.userId }, select: { id: true } });
      await tx.counselorAssignment.create({ data: { counselorId: counselor.id, memberId: users.member.userId, active: true } });
      await tx.user.create({
        data: {
          ...base('admin'),
          userRoles: { create: { roleId: await role('admin') } },
          profile: { create: { consentTerms: true, role: 'admin' } },
        },
      });
      const employerUser = await tx.user.create({
        data: {
          ...base('employer'),
          userRoles: { create: { roleId: await role('employer') } },
          profile: { create: { consentTerms: true } },
          employer: {
            create: {
              organizationId, companyName: employerCompanyName, contactName: 'WAP-6 QA employer',
              contactEmail: users.employer.email, tier: 'basic', status: 'active',
            },
          },
        },
        select: { employer: { select: { id: true } } },
      });
      await tx.user.create({
        data: {
          ...base('partner'),
          userRoles: { create: { roleId: await role('partner') } },
          profile: { create: { consentTerms: true } },
          partnerUser: { create: { partnerId: partnerRow.id } },
        },
      });
      return { partnerId: partnerRow.id, employerId: employerUser.employer!.id };
}

export function liveDeps(target: PortalQaTarget, env: NodeJS.ProcessEnv) {
  const prisma = new PrismaClient({ datasourceUrl: target.databaseUrl });
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin !== 'https://esbdrgaonplpvzmtrdhw.supabase.co' || !/^\/auth\/v1\/admin\/users(?:\/[0-9a-f-]+)?$/.test(url.pathname)) throw new Error('Unexpected Auth admin destination.');
      return fetch(input, { ...init, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    } },
  });
  const noteWhere = ({ memberId, authorIds }: { memberId: string | null; authorIds: string[] }) => ({
    OR: [...(memberId ? [{ memberId }] : []), ...(authorIds.length ? [{ authorId: { in: authorIds } }] : [])],
  });
  const deps: FixtureDeps = {
    findOrganization: (id) => prisma.organization.findUnique({ where: { id }, select: { id: true, slug: true, active: true } }),
    countActivePortalQaOrganizations: () =>
      prisma.organization.count({ where: { active: true, slug: { startsWith: 'portal-qa-' } } }),
    findUserIdByEmail: async (email) =>
      (await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }))?.id ?? null,
    findUserById: (id) => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, organizationId: true } }),
    createAuthUser: async ({ email, password, fullName, appMetadata }) => {
      const { data, error } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: appMetadata,
      });
      if (error || !data.user) throw new Error('Synthetic user Auth creation failed. No other account was changed.');
      return data.user.id;
    },
    findAuthUserByEmail: async (email) => {
      // Exact, case-insensitive match in Supabase Auth's own table; read-only.
      const rows = await prisma.$queryRaw<Array<{ id: string; email: string | null; raw_app_meta_data: unknown }>>`
        SELECT id::text AS id, email, raw_app_meta_data FROM auth.users WHERE lower(email) = lower(${email})`;
      if (rows.length > 1) throw new Error('More than one Auth user has this synthetic email.');
      const row = rows[0];
      if (!row) return null;
      const meta = row.raw_app_meta_data && typeof row.raw_app_meta_data === 'object' ? row.raw_app_meta_data as Record<string, unknown> : {};
      return { id: row.id, email: row.email, appMetadata: meta };
    },
    getAuthUser: async (id) => {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (error) {
        if (error.code === 'user_not_found') return null;
        throw new Error('Synthetic user Auth lookup failed.');
      }
      if (!data.user) throw new Error('Synthetic user Auth lookup returned no user and no error.');
      return { id: data.user.id, email: data.user.email ?? null, appMetadata: data.user.app_metadata ?? {} };
    },
    deleteAuthUser: async (id) => {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw new Error('Synthetic user Auth deletion failed.');
    },
    createRoleRows: (input) => prisma.$transaction(tx => createRoleRowsIn(tx, target, input)),
    deleteUser: async (id) => { await prisma.user.delete({ where: { id } }); },
    findPartner: (id) => prisma.partner.findUnique({ where: { id }, select: { id: true, organizationId: true, slug: true, name: true } }),
    findPartnerBySlug: (slug) => prisma.partner.findUnique({ where: { slug }, select: { id: true, organizationId: true, slug: true, name: true } }),
    deletePartner: async (id) => { await prisma.partner.delete({ where: { id } }); },
    countNotes: (scope) => prisma.counselorNote.count({ where: noteWhere(scope) }),
    listNotes: (scope) => prisma.counselorNote.findMany({ where: noteWhere(scope), select: { id: true, memberId: true, authorId: true, content: true } }),
    validateCleanup: async () => { throw new Error('Cleanup requires the durable graph comparison coordinator.'); },
    deleteNotes: async () => { throw new Error('Cleanup requires exact journal-owned note IDs.'); },
    findGoal: (id) => prisma.goal.findUnique({ where: { id }, select: { id: true, userId: true, title: true } }),
    findNote: (id) => prisma.counselorNote.findUnique({ where: { id }, select: { id: true, memberId: true, authorId: true, content: true } }),
    findEmployer: (id) => prisma.employer.findUnique({ where: { id }, select: { id: true, userId: true, companyName: true } }),
  };
  return { deps, prisma, close: () => prisma.$disconnect() };
}

if (basename(process.argv[1] ?? '') === 'five-role-demo-fixture.ts') {
  main(process.argv[2], process.env).catch(() => {
    console.error('DEMO acceptance step failed; inspect sanitized receipts and retained journal.');
    process.exitCode = 1;
  });
}
