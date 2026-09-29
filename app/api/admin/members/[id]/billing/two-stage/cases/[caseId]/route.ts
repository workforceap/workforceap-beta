/**
 * GET: the authoritative case summary (readiness, blockers, gates, #2706 readiness keys).
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.3.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json } from '@/lib/billing/twoStage/api/http';
import { caseSummary } from '@/lib/billing/twoStage/api/documents';
import type { CaseSummaryDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string };

export const GET = withApiGuc(twoStageRoute<Params>('case GET', { mutation: false, caseRoute: true }, async (ctx) => json<CaseSummaryDto>(await caseSummary(ctx))));
