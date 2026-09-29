/**
 * GET: the DRAFT PDF of the exact saved version. Never blocked by open gates or holds; blocker codes travel in X-Billing-Blocker-Codes.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.8.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { draftPreview } from '@/lib/billing/twoStage/api/documents';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; stage: string };

export const GET = withApiGuc(twoStageRoute<Params>('draft preview GET', { mutation: false, caseRoute: true }, (ctx) => draftPreview(ctx, parseStage(ctx.params.stage))));
