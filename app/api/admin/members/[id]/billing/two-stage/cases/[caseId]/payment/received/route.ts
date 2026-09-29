/**
 * POST: record the payment received, with evidence.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.15.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { paymentReceived } from '@/lib/billing/twoStage/api/documents';
import type { PaymentDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('payment received POST', { mutation: true, caseRoute: true }, async (ctx) => json<PaymentDto>(await paymentReceived(ctx, await readJsonBody(ctx.request)), 201)),
);
