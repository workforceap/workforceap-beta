import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { withCronLogging } from '@/lib/cron/withCronLogging';
import { logCronRun } from '@/lib/admin/logCronRun';
import { runMilestoneCascadeDraftTick } from '@/lib/milestoneCascade/runDraftTick';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 300;

/**
 * Hourly cron that drafts counselor-reviewable cascades from milestone events.
 *
 * Reads:  milestone_cascades WHERE status='pending_draft'
 * Writes: status → 'awaiting_approval' (success) or 'expired' (terminal fail)
 *
 * The kill switch is `WorkflowDiagnostic` toggle on
 * key='milestone_cascade_draft' — handled by withCronLogging.
 */

const WORKFLOW_KEY = 'milestone_cascade_draft';

async function handle(_req: NextRequest) {
  const result = await runMilestoneCascadeDraftTick({ batchSize: 25 });

  await logCronRun(
    WORKFLOW_KEY,
    {
      candidates: result.candidates,
      drafted: result.drafted,
      failedRetryable: result.failedRetryable,
      failedTerminal: result.failedTerminal,
    },
    'ok',
  );

  return NextResponse.json(result);
}

export const GET = withCronLogging(WORKFLOW_KEY, handle);
export const POST = withCronLogging(WORKFLOW_KEY, handle);
