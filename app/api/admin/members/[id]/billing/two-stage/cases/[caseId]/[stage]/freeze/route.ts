/**
 * POST: the verified pre-sign checkpoint (every readiness gate, exact hash, intent text). Writes nothing.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.9.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { freeze } from '@/lib/billing/twoStage/api/documents';
import type { FreezeDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; stage: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('freeze POST', { mutation: true, caseRoute: true }, async (ctx) => json<FreezeDto>(await freeze(ctx, parseStage(ctx.params.stage), await readJsonBody(ctx.request)))),
);
