/**
 * WAP-182 item 1: `user_roles` is the source of truth for role resolution
 * (lib/auth/roles.ts `getProfileRole`). Accounts that were promoted by editing
 * `profiles.role` alone have no `user_roles` row, so the resolver would keep
 * falling back to the profile. This script inserts the matching row for every
 * active user (`deleted_at IS NULL`) whose profile names a role but who has
 * NO `user_roles` row at all. Dry run by default; pass --apply to write.
 *
 *   npm run db:backfill:user-roles            # plan only (first 20 candidate ids)
 *   npm run db:backfill:user-roles -- --apply # insert the rows
 *
 * Never touches an account whose profile role and existing `user_roles`
 * disagree: those are printed separately as "conflicts, needs Mike"
 * (WAP-182 item 2). A `member` profile is the column default and never
 * conflicts with rows that name a real role (demo partner / employer logins).
 *
 * Idempotent: after --apply every candidate has a row, so a re-run plans
 * nothing. Exit code 0 on success (conflicts are informational), 1 on error.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

import { normalizeRoleName } from '../lib/auth/roleAccess';

export type UserRoleSnapshot = {
  id: string;
  profileRole: string | null | undefined;
  userRoleNames: readonly string[];
};

export type BackfillPlan = {
  /** Active users with a profile role and no `user_roles` row: rows to insert. */
  inserts: { userId: string; role: string }[];
  /** Profile role present but the existing rows name something else. Untouched. */
  conflicts: { userId: string; profileRole: string; userRoleNames: string[] }[];
  /** Existing rows already include the profile role (or the profile is the `member` default). */
  consistent: number;
  /** No profile row / empty role: nothing to derive. */
  noProfileRole: number;
};

export function planUserRoleBackfill(users: readonly UserRoleSnapshot[]): BackfillPlan {
  const plan: BackfillPlan = { inserts: [], conflicts: [], consistent: 0, noProfileRole: 0 };
  for (const user of users) {
    const profileRole = normalizeRoleName(user.profileRole);
    if (!profileRole) {
      plan.noProfileRole += 1;
      continue;
    }
    const rows = user.userRoleNames.map(normalizeRoleName).filter(Boolean);
    if (rows.length === 0) {
      plan.inserts.push({ userId: user.id, role: profileRole });
      continue;
    }
    if (rows.includes(profileRole) || profileRole === 'member') {
      plan.consistent += 1;
      continue;
    }
    plan.conflicts.push({ userId: user.id, profileRole, userRoleNames: rows });
  }
  return plan;
}

export function countByRole(inserts: readonly { role: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { role } of inserts) counts[role] = (counts[role] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

const DRY_RUN_ID_PREVIEW = 20;

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        profile: { select: { role: true } },
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    const plan = planUserRoleBackfill(
      users.map((user) => ({
        id: user.id,
        profileRole: user.profile?.role,
        userRoleNames: user.userRoles.map((entry) => entry.role.name),
      })),
    );

    console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${users.length} active user(s) scanned.`);
    console.log(`  already consistent: ${plan.consistent}`);
    console.log(`  no profile role:    ${plan.noProfileRole}`);
    console.log(`  rows to insert:     ${plan.inserts.length}`);
    for (const [role, count] of Object.entries(countByRole(plan.inserts))) {
      console.log(`    ${role}: ${count}`);
    }
    if (!apply && plan.inserts.length > 0) {
      console.log(`  first ${Math.min(DRY_RUN_ID_PREVIEW, plan.inserts.length)} candidate id(s):`);
      for (const entry of plan.inserts.slice(0, DRY_RUN_ID_PREVIEW)) {
        console.log(`    ${entry.userId} -> ${entry.role}`);
      }
    }

    if (plan.conflicts.length > 0) {
      console.log(`  conflicts, needs Mike (WAP-182 item 2): ${plan.conflicts.length} — not touched`);
      for (const conflict of plan.conflicts) {
        console.log(`    ${conflict.userId}: profiles.role=${conflict.profileRole} user_roles=[${conflict.userRoleNames.join(', ')}]`);
      }
    } else {
      console.log('  conflicts: none');
    }

    if (!apply) {
      console.log('No rows written. Re-run with --apply to insert the user_roles rows.');
      return;
    }

    const roleIds = new Map<string, string>();
    for (const role of Object.keys(countByRole(plan.inserts))) {
      const row = await prisma.role.upsert({ where: { name: role }, create: { name: role }, update: {}, select: { id: true } });
      roleIds.set(role, row.id);
    }
    const result = await prisma.userRole.createMany({
      data: plan.inserts.map((entry) => ({ userId: entry.userId, roleId: roleIds.get(entry.role)! })),
      skipDuplicates: true,
    });
    console.log(JSON.stringify({ mode: 'apply', inserted: result.count, byRole: countByRole(plan.inserts), conflicts: plan.conflicts.length }));
  } finally {
    await prisma.$disconnect();
  }
}

function isDirectInvocation(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(path.resolve(entry)).href === import.meta.url);
}

if (isDirectInvocation()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'user_roles backfill failed');
    process.exitCode = 1;
  });
}
