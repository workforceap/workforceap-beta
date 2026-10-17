import type { Prisma, PrismaClient } from '@prisma/client';
import {
  FIXTURE_EMAIL_DOMAINS,
  FIXTURE_LOCAL_PART_PREFIXES,
  FIXTURE_LOCAL_PART_SUFFIX,
  WORKFORCEAP_SENDING_DOMAIN,
  hasFixtureLocalPart,
} from '@/lib/email/fixtureEmailPatterns';
import {
  MEMBER_ONLY_EXCLUDED_EMAILS,
  NON_MEMBER_PROFILE_ROLES,
} from '@/lib/admin/memberOnlyWhere';
import { assignMemberCounselor } from '@/lib/counselor/assignment';
import { WAP_STAFF_COUNSELOR_AFFILIATION } from '@/lib/counselor/autoAssign';
import { CRON_SCOPED_LOOKUP_CAP } from '@/lib/db/scanCaps';

/** Default dad / sole-counselor identity confirmed in prod read-only audits. */
export const DEFAULT_SOLE_COUNSELOR_EMAIL = 'mbrowncsn@sbcglobal.net';

/** Mike's super_admin account that still owns legacy member threads (no counselor row). */
export const DEFAULT_MIKE_THREAD_OWNER_EMAIL = 'mabrown040@gmail.com';

export type SoleCounselorIdentity = {
  counselorId: string;
  userId: string;
  email: string;
  fullName: string | null;
  organizationId: string;
  active: boolean;
  affiliation: string;
};

export type CounselorDeactivatePlanRow = {
  counselorId: string;
  userId: string;
  email: string;
  fullName: string | null;
  activeCaseload: number;
};

export type MemberReassignPlanRow = {
  memberId: string;
  email: string;
  fullName: string | null;
  organizationId: string;
  threadOwnerEmail: string | null;
  reason: 'unassigned';
};

export type SoleCounselorSkipRow = {
  memberId: string;
  email: string;
  fullName: string | null;
  reason: 'partner_referred' | 'fixture' | 'staff_account' | 'self' | 'wrong_org';
};

export type SoleCounselorPlan = {
  sole: SoleCounselorIdentity;
  otherActiveWapStaff: CounselorDeactivatePlanRow[];
  alreadyInactiveOthers: CounselorDeactivatePlanRow[];
  reassign: MemberReassignPlanRow[];
  skipped: SoleCounselorSkipRow[];
  mikeOwnedThreadCount: number;
};

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Local WAP-24 marker (same contract as lib/tenant/withTenantScope.crossTenantOK).
 * Kept here so the ops script does not import the `server-only` tenant module.
 * Call sites still filter by `organizationId` from the resolved sole counselor.
 */
async function crossTenantOK<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Fixture / QA emails that must not join a live counselor caseload. */
export function isOpsFixtureEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if ((MEMBER_ONLY_EXCLUDED_EMAILS as readonly string[]).includes(normalized)) return true;
  const at = normalized.lastIndexOf('@');
  if (at < 0) return true;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if ((FIXTURE_EMAIL_DOMAINS as readonly string[]).includes(domain)) return true;
  if (hasFixtureLocalPart(local)) return true;
  if (local.endsWith(FIXTURE_LOCAL_PART_SUFFIX) && domain === WORKFORCEAP_SENDING_DOMAIN) return true;
  for (const prefix of FIXTURE_LOCAL_PART_PREFIXES) {
    if (local.startsWith(prefix)) return true;
  }
  return false;
}

export async function resolveSoleCounselorByEmail(
  db: Db,
  email: string,
): Promise<SoleCounselorIdentity | null> {
  const normalized = normalizeEmail(email);
  const row = await db.counselor.findFirst({
    where: {
      affiliation: WAP_STAFF_COUNSELOR_AFFILIATION,
      user: { email: { equals: normalized, mode: 'insensitive' }, deletedAt: null },
    },
    select: {
      id: true,
      userId: true,
      active: true,
      affiliation: true,
      user: { select: { email: true, fullName: true, organizationId: true } },
    },
  });
  if (!row?.user.organizationId) return null;
  return {
    counselorId: row.id,
    userId: row.userId,
    email: row.user.email,
    fullName: row.user.fullName,
    organizationId: row.user.organizationId,
    active: row.active,
    affiliation: row.affiliation,
  };
}

async function loadActiveCaseloadByCounselorId(
  db: Db,
  counselorIds: string[],
): Promise<Map<string, number>> {
  if (counselorIds.length === 0) return new Map();
  const loads = await db.counselorAssignment.groupBy({
    by: ['counselorId'],
    where: { active: true, counselorId: { in: counselorIds } },
    _count: { _all: true },
  });
  return new Map(loads.map((row) => [row.counselorId, row._count._all]));
}

async function isStaffAccount(db: Db, userId: string): Promise<boolean> {
  const [counselor, profile, userRoles] = await Promise.all([
    db.counselor.findFirst({ where: { userId, active: true }, select: { id: true } }),
    db.profile.findUnique({ where: { userId }, select: { role: true } }),
    db.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true } } },
    }),
  ]);
  if (counselor) return true;
  const profileRole = profile?.role ?? '';
  if ((NON_MEMBER_PROFILE_ROLES as readonly string[]).includes(profileRole)) return true;
  return userRoles.some((entry) =>
    (NON_MEMBER_PROFILE_ROLES as readonly string[]).includes(entry.role.name),
  );
}

async function hasPartnerReferral(db: Db, memberId: string): Promise<boolean> {
  const referral = await db.partnerReferral.findFirst({
    where: { memberId },
    select: { id: true },
  });
  return referral !== null;
}

/**
 * Plan the reversible sole-counselor cutover:
 * 1) deactivate other active WAP staff counselors (leave partner / ambassador alone)
 * 2) assign eligible unassigned members onto the sole counselor (also retargets threads)
 *
 * Does not delete accounts. Partner-referred, fixture, and staff accounts are skipped.
 */
export async function planSoleCounselorOps(
  db: Db,
  input: { soleEmail: string },
): Promise<SoleCounselorPlan> {
  const sole = await resolveSoleCounselorByEmail(db, input.soleEmail);
  if (!sole) {
    throw new Error(
      `No WAP staff counselor found for email ${normalizeEmail(input.soleEmail)}. Confirm dad's identity before applying.`,
    );
  }
  if (!sole.active) {
    throw new Error(
      `Counselor ${sole.email} exists but counselors.active=false. Reactivate that row before making them sole.`,
    );
  }

  const otherWap = await db.counselor.findMany({
    where: {
      affiliation: WAP_STAFF_COUNSELOR_AFFILIATION,
      id: { not: sole.counselorId },
      user: { organizationId: sole.organizationId, deletedAt: null },
    },
    select: {
      id: true,
      userId: true,
      active: true,
      user: { select: { email: true, fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const caseload = await loadActiveCaseloadByCounselorId(
    db,
    otherWap.map((row) => row.id),
  );
  const toRow = (row: (typeof otherWap)[number]): CounselorDeactivatePlanRow => ({
    counselorId: row.id,
    userId: row.userId,
    email: row.user.email,
    fullName: row.user.fullName,
    activeCaseload: caseload.get(row.id) ?? 0,
  });
  const otherActiveWapStaff = otherWap.filter((row) => row.active).map(toRow);
  const alreadyInactiveOthers = otherWap.filter((row) => !row.active).map(toRow);

  // Org-filtered via sole.organizationId; crossTenantOK marks the ops read for WAP-24.
  // Page with CRON_SCOPED_LOOKUP_CAP so we never hydrate an unbounded scan.
  const unassigned: Array<{
    id: string;
    email: string;
    fullName: string | null;
    organizationId: string;
    messageThreadsAsMember: Array<{ counselorUserId: string | null; counselor: { email: string } | null }>;
  }> = [];
  let cursorId: string | null = null;
  for (;;) {
    const page = await crossTenantOK(() =>
      db.user.findMany({
        where: {
          organizationId: sole.organizationId,
          deletedAt: null,
          AND: [
            { id: { not: sole.userId } },
            ...(cursorId ? [{ id: { gt: cursorId } }] : []),
          ],
          OR: [
            { profile: { role: 'member' } },
            { userRoles: { some: { role: { name: 'member' } } } },
          ],
          counselorAssignments: { none: { active: true } },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          organizationId: true,
          messageThreadsAsMember: {
            take: 1,
            select: { counselorUserId: true, counselor: { select: { email: true } } },
          },
        },
        orderBy: { id: 'asc' },
        take: CRON_SCOPED_LOOKUP_CAP,
      }),
    );
    unassigned.push(...page);
    if (page.length < CRON_SCOPED_LOOKUP_CAP) break;
    cursorId = page[page.length - 1]?.id ?? null;
    if (!cursorId) break;
  }

  const reassign: MemberReassignPlanRow[] = [];
  const skipped: SoleCounselorSkipRow[] = [];
  let mikeOwnedThreadCount = 0;

  for (const member of unassigned) {
    const threadOwnerEmail = member.messageThreadsAsMember[0]?.counselor?.email ?? null;
    if (threadOwnerEmail && normalizeEmail(threadOwnerEmail) !== normalizeEmail(sole.email)) {
      mikeOwnedThreadCount += 1;
    }

    if (isOpsFixtureEmail(member.email)) {
      skipped.push({
        memberId: member.id,
        email: member.email,
        fullName: member.fullName,
        reason: 'fixture',
      });
      continue;
    }
    if (member.organizationId !== sole.organizationId) {
      skipped.push({
        memberId: member.id,
        email: member.email,
        fullName: member.fullName,
        reason: 'wrong_org',
      });
      continue;
    }
    if (await hasPartnerReferral(db, member.id)) {
      skipped.push({
        memberId: member.id,
        email: member.email,
        fullName: member.fullName,
        reason: 'partner_referred',
      });
      continue;
    }
    if (await isStaffAccount(db, member.id)) {
      skipped.push({
        memberId: member.id,
        email: member.email,
        fullName: member.fullName,
        reason: 'staff_account',
      });
      continue;
    }
    if (member.id === sole.userId) {
      skipped.push({
        memberId: member.id,
        email: member.email,
        fullName: member.fullName,
        reason: 'self',
      });
      continue;
    }

    reassign.push({
      memberId: member.id,
      email: member.email,
      fullName: member.fullName,
      organizationId: member.organizationId,
      threadOwnerEmail,
      reason: 'unassigned',
    });
  }

  return {
    sole,
    otherActiveWapStaff,
    alreadyInactiveOthers,
    reassign,
    skipped,
    mikeOwnedThreadCount,
  };
}

export type ApplySoleCounselorResult = {
  deactivatedCounselorIds: string[];
  assignedMemberIds: string[];
  errors: Array<{ memberId?: string; counselorId?: string; message: string }>;
};

/**
 * Apply a previously planned cutover. Reversible: reactivation +
 * `assignMemberCounselor` handoffs undo it. Never deletes users.
 */
export async function applySoleCounselorOps(
  prisma: PrismaClient,
  plan: SoleCounselorPlan,
  options: { deactivateOthers: boolean; reassignUnassigned: boolean },
): Promise<ApplySoleCounselorResult> {
  const deactivatedCounselorIds: string[] = [];
  const assignedMemberIds: string[] = [];
  const errors: ApplySoleCounselorResult['errors'] = [];

  if (options.deactivateOthers) {
    for (const row of plan.otherActiveWapStaff) {
      try {
        await prisma.counselor.update({
          where: { id: row.counselorId },
          data: { active: false },
        });
        deactivatedCounselorIds.push(row.counselorId);
      } catch (error) {
        errors.push({
          counselorId: row.counselorId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (options.reassignUnassigned) {
    for (const row of plan.reassign) {
      try {
        await prisma.$transaction(async (tx) => {
          await assignMemberCounselor(tx, {
            memberId: row.memberId,
            organizationId: row.organizationId,
            counselorUserId: plan.sole.userId,
          });
        });
        assignedMemberIds.push(row.memberId);
      } catch (error) {
        errors.push({
          memberId: row.memberId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { deactivatedCounselorIds, assignedMemberIds, errors };
}

export function formatSoleCounselorPlan(plan: SoleCounselorPlan): string {
  const lines: string[] = [];
  lines.push(
    `Sole counselor: ${plan.sole.fullName ?? '(no name)'} <${plan.sole.email}> ` +
      `(counselorId=${plan.sole.counselorId}, userId=${plan.sole.userId}, org=${plan.sole.organizationId})`,
  );
  lines.push(
    `Other active WAP staff to deactivate: ${plan.otherActiveWapStaff.length}`,
  );
  for (const row of plan.otherActiveWapStaff) {
    lines.push(
      `  - ${row.fullName ?? '(no name)'} <${row.email}> caseload=${row.activeCaseload}`,
    );
  }
  lines.push(
    `Already-inactive other WAP staff (no change): ${plan.alreadyInactiveOthers.length}`,
  );
  for (const row of plan.alreadyInactiveOthers) {
    lines.push(`  - ${row.fullName ?? '(no name)'} <${row.email}>`);
  }
  lines.push(`Unassigned members to assign to sole counselor: ${plan.reassign.length}`);
  lines.push(
    `  (of which threads currently owned by someone else: ${plan.mikeOwnedThreadCount})`,
  );
  for (const row of plan.reassign.slice(0, 25)) {
    lines.push(
      `  - ${row.fullName ?? '(no name)'} <${row.email}>` +
        (row.threadOwnerEmail ? ` threadOwner=${row.threadOwnerEmail}` : ''),
    );
  }
  if (plan.reassign.length > 25) {
    lines.push(`  … ${plan.reassign.length - 25} more`);
  }
  lines.push(`Skipped: ${plan.skipped.length}`);
  const byReason = new Map<string, number>();
  for (const row of plan.skipped) {
    byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
  }
  for (const [reason, count] of [...byReason.entries()].sort()) {
    lines.push(`  - ${reason}: ${count}`);
  }
  return lines.join('\n');
}

export type MikeThreadMoveRow = {
  threadId: string;
  memberId: string;
  email: string;
  fullName: string | null;
  organizationId: string;
  /** Full assignMemberCounselor handoff (caseload + thread owner). */
  action: 'assign_and_retarget' | 'retarget_thread_only';
  skipReason?: 'self' | 'fixture' | 'staff_account' | 'deleted' | 'wrong_org';
};

export type MikeThreadHandoffPlan = {
  sole: SoleCounselorIdentity;
  fromOwnerEmail: string;
  fromOwnerUserId: string;
  move: MikeThreadMoveRow[];
  skipped: MikeThreadMoveRow[];
};

/**
 * Narrow cut: only member threads still owned by Mike's admin account
 * (`mabrown040@gmail.com` by default). Does **not** sweep the broader
 * unassigned-member pool. Partner-referred members on Mike's threads are
 * included (Mike asked for his threads, not a self-serve-only filter).
 *
 * Dad's own member thread (if Mike owns it) is retargeted only — never
 * assigned as counselor-of-self.
 */
export async function planMikeThreadHandoff(
  db: Db,
  input: { soleEmail: string; fromOwnerEmail: string },
): Promise<MikeThreadHandoffPlan> {
  const sole = await resolveSoleCounselorByEmail(db, input.soleEmail);
  if (!sole) {
    throw new Error(
      `No WAP staff counselor found for email ${normalizeEmail(input.soleEmail)}. Confirm dad's identity before applying.`,
    );
  }
  if (!sole.active) {
    throw new Error(
      `Counselor ${sole.email} exists but counselors.active=false. Reactivate that row before making them sole.`,
    );
  }

  // Email lookup for the legacy thread owner (Mike); marked for WAP-24.
  const fromOwner = await crossTenantOK(() =>
    db.user.findFirst({
      where: {
        email: { equals: normalizeEmail(input.fromOwnerEmail), mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true, email: true },
    }),
  );
  if (!fromOwner) {
    throw new Error(
      `Thread owner not found for email ${normalizeEmail(input.fromOwnerEmail)}.`,
    );
  }

  const threads = await crossTenantOK(() =>
    db.messageThread.findMany({
      where: {
        kind: 'member',
        counselorUserId: fromOwner.id,
        memberId: { not: null },
      },
      select: {
        id: true,
        memberId: true,
        member: {
          select: {
            id: true,
            email: true,
            fullName: true,
            organizationId: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: CRON_SCOPED_LOOKUP_CAP,
    }),
  );

  const move: MikeThreadMoveRow[] = [];
  const skipped: MikeThreadMoveRow[] = [];

  for (const thread of threads) {
    const member = thread.member;
    if (!member || !thread.memberId) continue;

    const base: MikeThreadMoveRow = {
      threadId: thread.id,
      memberId: member.id,
      email: member.email,
      fullName: member.fullName,
      organizationId: member.organizationId,
      action: 'assign_and_retarget',
    };

    if (member.deletedAt) {
      skipped.push({ ...base, action: 'retarget_thread_only', skipReason: 'deleted' });
      continue;
    }
    if (member.organizationId !== sole.organizationId) {
      skipped.push({ ...base, action: 'retarget_thread_only', skipReason: 'wrong_org' });
      continue;
    }
    if (member.id === sole.userId) {
      // Dad's own member thread: take Mike off ownership, do not create self-assignment.
      move.push({ ...base, action: 'retarget_thread_only', skipReason: 'self' });
      continue;
    }
    if (isOpsFixtureEmail(member.email)) {
      skipped.push({ ...base, action: 'retarget_thread_only', skipReason: 'fixture' });
      continue;
    }
    if (await isStaffAccount(db, member.id)) {
      // Staff accounts on Mike's inbox: retarget only (no caseload row).
      move.push({ ...base, action: 'retarget_thread_only', skipReason: 'staff_account' });
      continue;
    }

    move.push(base);
  }

  return {
    sole,
    fromOwnerEmail: fromOwner.email,
    fromOwnerUserId: fromOwner.id,
    move,
    skipped,
  };
}

export type ApplyMikeThreadHandoffResult = {
  assignedMemberIds: string[];
  retargetedThreadIds: string[];
  errors: Array<{ memberId?: string; threadId?: string; message: string }>;
};

/**
 * Apply the Mike-thread-only handoff. Reversible by reassigning threads back
 * to Mike's user id (or clearing ownership) via admin tools / SQL.
 */
export async function applyMikeThreadHandoff(
  prisma: PrismaClient,
  plan: MikeThreadHandoffPlan,
): Promise<ApplyMikeThreadHandoffResult> {
  const assignedMemberIds: string[] = [];
  const retargetedThreadIds: string[] = [];
  const errors: ApplyMikeThreadHandoffResult['errors'] = [];

  for (const row of plan.move) {
    try {
      if (row.action === 'assign_and_retarget') {
        await prisma.$transaction(async (tx) => {
          await assignMemberCounselor(tx, {
            memberId: row.memberId,
            organizationId: row.organizationId,
            counselorUserId: plan.sole.userId,
          });
        });
        assignedMemberIds.push(row.memberId);
        retargetedThreadIds.push(row.threadId);
      } else {
        await prisma.messageThread.updateMany({
          where: {
            id: row.threadId,
            counselorUserId: plan.fromOwnerUserId,
          },
          data: { counselorUserId: plan.sole.userId },
        });
        retargetedThreadIds.push(row.threadId);
      }
    } catch (error) {
      errors.push({
        memberId: row.memberId,
        threadId: row.threadId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { assignedMemberIds, retargetedThreadIds, errors };
}

export function formatMikeThreadHandoffPlan(plan: MikeThreadHandoffPlan): string {
  const lines: string[] = [];
  lines.push(
    `Sole counselor: ${plan.sole.fullName ?? '(no name)'} <${plan.sole.email}> ` +
      `(userId=${plan.sole.userId})`,
  );
  lines.push(
    `From thread owner: <${plan.fromOwnerEmail}> (userId=${plan.fromOwnerUserId})`,
  );
  lines.push(`Threads to move: ${plan.move.length}`);
  const assignCount = plan.move.filter((r) => r.action === 'assign_and_retarget').length;
  const retargetOnly = plan.move.filter((r) => r.action === 'retarget_thread_only').length;
  lines.push(`  - assign_and_retarget: ${assignCount}`);
  lines.push(`  - retarget_thread_only: ${retargetOnly}`);
  for (const row of plan.move.slice(0, 40)) {
    lines.push(
      `  - [${row.action}] ${row.fullName ?? '(no name)'} <${row.email}>` +
        (row.skipReason ? ` (${row.skipReason})` : ''),
    );
  }
  if (plan.move.length > 40) lines.push(`  … ${plan.move.length - 40} more`);
  lines.push(`Skipped (left on Mike): ${plan.skipped.length}`);
  for (const row of plan.skipped) {
    lines.push(
      `  - ${row.fullName ?? '(no name)'} <${row.email}> (${row.skipReason ?? 'n/a'})`,
    );
  }
  return lines.join('\n');
}
