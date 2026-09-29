/**
 * POST: send one copy per required role, idempotently. Hard-disabled: 503 while any send gate is off, and every gate defaults off.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.14.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { sendStage } from '@/lib/billing/twoStage/api/stageActions';
import type { SendDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; stage: string };

/** Two or three copies in sequence, each with the wrapper's own bounded retries. */
export const maxDuration = 60;

export const POST = withApiGuc(
  twoStageRoute<Params>('send POST', { mutation: true, caseRoute: true }, async (ctx) => {
    const stage = parseStage(ctx.params.stage);
    const body = await readJsonBody(ctx.request);
    return json<SendDto>(await sendStage(ctx, stage, body));
  }),
);
