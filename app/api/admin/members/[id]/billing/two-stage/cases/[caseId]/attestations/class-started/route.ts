/**
 * POST: J6 class-started attestation (actual start, confirmed end).
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.5.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { attestClassStarted } from '@/lib/billing/twoStage/api/evidence';
import type { ClassStartedDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('class started POST', { mutation: true, caseRoute: true }, async (ctx) => json<ClassStartedDto>(await attestClassStarted(ctx, await readJsonBody(ctx.request)), 201)),
);
