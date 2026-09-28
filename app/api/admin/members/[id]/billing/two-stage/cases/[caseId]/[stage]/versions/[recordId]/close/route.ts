/**
 * POST: void or supersede a version (audited).
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.17.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { closeVersion } from '@/lib/billing/twoStage/api/stageActions';
import type { CloseDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; stage: string; recordId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('close POST', { mutation: true, caseRoute: true }, async (ctx) =>
    json<CloseDto>(await closeVersion(ctx, parseStage(ctx.params.stage), ctx.params.recordId, await readJsonBody(ctx.request))),
  ),
);
