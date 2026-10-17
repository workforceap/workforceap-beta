/**
 * Make one WAP staff counselor the sole assignment-pool counselor (reversible).
 *
 * Confirmed dad identity (prod read-only, 2026-10): Michael Brown
 * <mbrowncsn@sbcglobal.net> — active wap_staff counselor.
 *
 * What this does (never deletes accounts):
 *  1. Deactivates other *active* WAP staff counselor rows (`counselors.active=false`)
 *  2. Assigns eligible unassigned members onto that counselor (updates
 *     counselor_assignments + message_threads.counselor_user_id)
 *
 * Skips partner-referred members, fixture/QA emails, and staff accounts.
 * Partner / community_ambassador / independent counselors are left alone.
 *
 *   # plan only (default — safe against production):
 *   npm run db:sole-counselor-dad
 *
 *   # write the plan:
 *   npm run db:sole-counselor-dad -- --apply
 *
 *   # only one half of the plan:
 *   npm run db:sole-counselor-dad -- --apply --deactivate-only
 *   npm run db:sole-counselor-dad -- --apply --reassign-only
 *
 *   # override identity (must still be an active wap_staff counselor):
 *   npm run db:sole-counselor-dad -- --email=mbrowncsn@sbcglobal.net
 *
 * Do NOT point this at production until Mike explicitly approves the dry-run plan.
 */
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_SOLE_COUNSELOR_EMAIL,
  applySoleCounselorOps,
  formatSoleCounselorPlan,
  planSoleCounselorOps,
} from '../lib/counselor/soleCounselorOps';

const prisma = new PrismaClient();

function argValue(flag: string): string | null {
  const prefix = `${flag}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const deactivateOnly = process.argv.includes('--deactivate-only');
  const reassignOnly = process.argv.includes('--reassign-only');
  if (deactivateOnly && reassignOnly) {
    throw new Error('Choose at most one of --deactivate-only / --reassign-only');
  }
  if (apply && process.argv.includes('--dry-run')) {
    throw new Error('Choose exactly one mode: dry-run (default) or --apply');
  }

  const soleEmail = argValue('--email') ?? DEFAULT_SOLE_COUNSELOR_EMAIL;
  const plan = await planSoleCounselorOps(prisma, { soleEmail });

  console.log(apply ? 'APPLY' : 'DRY RUN');
  console.log(formatSoleCounselorPlan(plan));

  if (!apply) {
    console.log('\nNo rows written. Re-run with --apply after Mike approves this plan.');
    return;
  }

  const deactivateOthers = !reassignOnly;
  const reassignUnassigned = !deactivateOnly;
  const result = await applySoleCounselorOps(prisma, plan, {
    deactivateOthers,
    reassignUnassigned,
  });

  console.log(
    JSON.stringify(
      {
        deactivated: result.deactivatedCounselorIds.length,
        assigned: result.assignedMemberIds.length,
        errors: result.errors,
      },
      null,
      2,
    ),
  );
  if (result.errors.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
