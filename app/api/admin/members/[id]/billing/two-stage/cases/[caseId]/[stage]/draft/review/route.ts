/**
 * POST: validate a partial draft (any subset of fields) and report per-field errors and blockers. Never writes.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.7.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { parseDraftPatch, reviewDraft } from '@/lib/billing/twoStage/api/draft';
import type { DraftReviewDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; stage: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('draft review POST', { mutation: true, caseRoute: true }, async (ctx) => {
    const stage = parseStage(ctx.params.stage);
    return json<DraftReviewDto>(await reviewDraft(ctx, stage, parseDraftPatch(stage, await readJsonBody(ctx.request))));
  }),
);
