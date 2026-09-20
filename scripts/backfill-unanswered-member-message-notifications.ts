/**
 * WAP-168 fix 2: back-fill staff notifications for member messages that were
 * sent before the admin fallback notification existed (2026-09-18) and have
 * still not been answered. Dry run by default; pass --apply to write rows.
 *
 *   npm run db:backfill:unanswered-messages            # plan only
 *   npm run db:backfill:unanswered-messages -- --apply # create notifications
 *
 * Idempotent: a thread is skipped once any staff `message` notification
 * exists at or after its latest member message, so re-running after --apply
 * plans nothing.
 */
import { PrismaClient } from '@prisma/client';
import {
  applyUnansweredBackfill,
  planUnansweredBackfill,
  prismaNotificationWriter,
} from '../lib/messages/unansweredBackfill';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const plan = await planUnansweredBackfill(prisma);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${plan.length} unanswered member thread(s) with no staff notification.`);
  for (const entry of plan) {
    console.log(
      `- thread ${entry.threadId} member ${entry.memberId} last wrote ${entry.memberLastMessageAt.toISOString()} ` +
        `-> ${entry.route} (${entry.recipientUserIds.length} recipient(s))`,
    );
  }
  if (!apply) {
    console.log('No rows written. Re-run with --apply to create the notifications.');
    return;
  }
  const result = await applyUnansweredBackfill(plan, prismaNotificationWriter(prisma));
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
