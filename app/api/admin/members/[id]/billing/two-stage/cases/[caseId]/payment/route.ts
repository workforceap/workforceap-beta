/**
 * GET: payment tracking for the case (an expected follow-up window, never a due date).
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.15.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json } from '@/lib/billing/twoStage/api/http';
import { payment } from '@/lib/billing/twoStage/api/documents';
import type { PaymentDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string };

export const GET = withApiGuc(twoStageRoute<Params>('payment GET', { mutation: false, caseRoute: true }, async (ctx) => json<PaymentDto>(await payment(ctx))));
