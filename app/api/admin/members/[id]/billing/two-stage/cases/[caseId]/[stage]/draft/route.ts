/**
 * PUT: persist a J5/J6 draft version. Only a complete, validated set is saved (422 DRAFT_INCOMPLETE otherwise).
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.7.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { parseDraftPatch, saveDraft } from '@/lib/billing/twoStage/api/draft';
import type { DraftSaveDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; stage: string };

export const PUT = withApiGuc(
  twoStageRoute<Params>('draft PUT', { mutation: true, caseRoute: true }, async (ctx) => {
    const stage = parseStage(ctx.params.stage);
    const saved = await saveDraft(ctx, stage, parseDraftPatch(stage, await readJsonBody(ctx.request)));
    return json<DraftSaveDto>(saved.body, saved.status);
  }),
);
