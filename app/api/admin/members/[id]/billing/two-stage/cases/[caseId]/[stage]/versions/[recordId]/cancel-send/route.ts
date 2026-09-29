/**
 * POST: the audited partial-send cancellation of a signed version some roles received.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.18.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { cancelPartialSend } from '@/lib/billing/twoStage/api/stageActions';
import type { CancelSendDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; stage: string; recordId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('cancel send POST', { mutation: true, caseRoute: true }, async (ctx) =>
    json<CancelSendDto>(await cancelPartialSend(ctx, parseStage(ctx.params.stage), ctx.params.recordId, await readJsonBody(ctx.request))),
  ),
);
