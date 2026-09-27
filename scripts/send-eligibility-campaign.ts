#!/usr/bin/env node
/**
 * WS5 non-CHS eligibility questionnaire campaign (soft Sept 14 reminder).
 *
 * Usage:
 *   node --import tsx scripts/send-eligibility-campaign.ts --dry-run
 *   node --import tsx scripts/send-eligibility-campaign.ts --limit 50
 *
 * Excludes Concordia High School (CHS) partner referrals.
 * Does NOT disable accounts — reminder language only.
 *
 * Prefer the admin API when possible:
 *   POST /api/admin/members/send-eligibility-campaign
 *   { "dryRun": true } | { "limit": 50 }
 */

import { prisma } from '../lib/db/prisma';
import { sendEligibilityLink } from '../lib/email';
import {
  buildEligibilityCampaignWhere,
  eligibilityCampaignSelect,
  ELIGIBILITY_SOFT_DEADLINE_LABEL,
} from '../lib/admin/eligibilityDatasheet';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const all = argv.includes('--all'); // include members who already screened
  const limitIdx = argv.indexOf('--limit');
  const limit =
    limitIdx >= 0 && argv[limitIdx + 1] ? Math.max(1, Number(argv[limitIdx + 1]) || 100) : 100;
  return { dryRun, missingScreeningOnly: !all, limit: Math.min(limit, 500) };
}

async function main() {
  const { dryRun, missingScreeningOnly, limit } = parseArgs(process.argv.slice(2));
  const where = buildEligibilityCampaignWhere({ missingScreeningOnly });
  const recipients = await prisma.user.findMany({
    where,
    take: limit,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: eligibilityCampaignSelect,
  });

  console.log(
    JSON.stringify(
      {
        softDeadline: ELIGIBILITY_SOFT_DEADLINE_LABEL,
        lockout: false,
        dryRun,
        missingScreeningOnly,
        recipientCount: recipients.length,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    for (const r of recipients.slice(0, 25)) {
      console.log(`  - ${r.email} (${r.fullName ?? '—'})`);
    }
    if (recipients.length > 25) console.log(`  … and ${recipients.length - 25} more`);
    process.exit(0);
  }

  const url = `${SITE_URL}/dashboard/eligibility`;
  let sent = 0;
  for (const member of recipients) {
    if (!member.email) continue;
    const result = await sendEligibilityLink({
      to: member.email,
      recipientUserId: member.id,
      name: member.fullName,
      url,
      orgId: member.organizationId,
      softDeadlineReminder: true,
    });
    if (result.ok) {
      sent += 1;
      console.log(`sent ${member.email}`);
    } else {
      console.error(`fail ${member.email}: ${result.error}`);
    }
  }
  console.log(`Done. sent=${sent} attempted=${recipients.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
