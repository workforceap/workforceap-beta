/**
 * POST: J5 readiness attestation (student ready, counselor request, class start).
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.4.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { attestJ5Readiness } from '@/lib/billing/twoStage/api/evidence';
import type { AttestationDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('j5 readiness POST', { mutation: true, caseRoute: true }, async (ctx) => json<AttestationDto>(await attestJ5Readiness(ctx, await readJsonBody(ctx.request)), 201)),
);
