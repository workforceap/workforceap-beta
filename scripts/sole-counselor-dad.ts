/**
 * Sole-counselor ops for dad (Michael Brown <mbrowncsn@sbcglobal.net>).
 *
 * Modes (never deletes accounts):
 *
 *   # Mike-thread-only (approved narrow cut — default when --mike-threads-only):
 *   # Retarget member threads owned by mabrown040@gmail.com onto dad, and
 *   # create counselor_assignments for those members. Does NOT sweep the
 *   # broader ~121 unassigned pool.
 *   npm run db:sole-counselor-dad -- --mike-threads-only
 *   npm run db:sole-counselor-dad -- --mike-threads-only --apply
 *
 *   # Full pool plan (deactivate other active WAP staff + reassign unassigned):
 *   npm run db:sole-counselor-dad
 *   npm run db:sole-counselor-dad -- --apply
 *   npm run db:sole-counselor-dad -- --apply --deactivate-only
 *   npm run db:sole-counselor-dad -- --apply --reassign-only
 *
 *   # Identities (must still resolve):
 *   --email=mbrowncsn@sbcglobal.net
 *   --from-owner-email=mabrown040@gmail.com   (mike-threads-only)
 */
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_MIKE_THREAD_OWNER_EMAIL,
  DEFAULT_SOLE_COUNSELOR_EMAIL,
  applyMikeThreadHandoff,
  applySoleCounselorOps,
  formatMikeThreadHandoffPlan,
  formatSoleCounselorPlan,
  planMikeThreadHandoff,
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
  const mikeThreadsOnly = process.argv.includes('--mike-threads-only');
  const deactivateOnly = process.argv.includes('--deactivate-only');
  const reassignOnly = process.argv.includes('--reassign-only');
  if (deactivateOnly && reassignOnly) {
    throw new Error('Choose at most one of --deactivate-only / --reassign-only');
  }
  if (mikeThreadsOnly && (deactivateOnly || reassignOnly)) {
    throw new Error('--mike-threads-only cannot combine with --deactivate-only / --reassign-only');
  }
  if (apply && process.argv.includes('--dry-run')) {
    throw new Error('Choose exactly one mode: dry-run (default) or --apply');
  }

  const soleEmail = argValue('--email') ?? DEFAULT_SOLE_COUNSELOR_EMAIL;

  if (mikeThreadsOnly) {
    const fromOwnerEmail = argValue('--from-owner-email') ?? DEFAULT_MIKE_THREAD_OWNER_EMAIL;
    const plan = await planMikeThreadHandoff(prisma, { soleEmail, fromOwnerEmail });
    console.log(apply ? 'APPLY (mike-threads-only)' : 'DRY RUN (mike-threads-only)');
    console.log(formatMikeThreadHandoffPlan(plan));
    if (!apply) {
      console.log('\nNo rows written. Re-run with --mike-threads-only --apply after approval.');
      return;
    }
    const result = await applyMikeThreadHandoff(prisma, plan);
    console.log(
      JSON.stringify(
        {
          assigned: result.assignedMemberIds.length,
          retargetedThreads: result.retargetedThreadIds.length,
          errors: result.errors,
        },
        null,
        2,
      ),
    );
    if (result.errors.length > 0) process.exitCode = 1;
    return;
  }

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
