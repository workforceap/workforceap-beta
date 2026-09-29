/**
 * POST: sign one version (executive signer only). Hard-disabled: 503 while any sign gate is off, and every gate defaults off.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.13.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { signStage } from '@/lib/billing/twoStage/api/stageActions';
import type { SignDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; stage: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('sign POST', { mutation: true, caseRoute: true }, async (ctx) => {
    const stage = parseStage(ctx.params.stage);
    const body = await readJsonBody(ctx.request);
    return json<SignDto>(await signStage(ctx, stage, body));
  }),
);
