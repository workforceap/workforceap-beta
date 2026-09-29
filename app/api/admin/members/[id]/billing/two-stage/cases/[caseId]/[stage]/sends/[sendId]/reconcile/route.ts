/**
 * POST: a person settles an unknown copy with evidence (audited). Never automatic.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.16.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { reconcile } from '@/lib/billing/twoStage/api/stageActions';
import type { ReconcileDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; stage: string; sendId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('reconcile POST', { mutation: true, caseRoute: true }, async (ctx) =>
    json<ReconcileDto>(await reconcile(ctx, parseStage(ctx.params.stage), ctx.params.sendId, await readJsonBody(ctx.request))),
  ),
);
