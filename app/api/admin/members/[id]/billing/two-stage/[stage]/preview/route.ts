/** Read-only PDFs for any authorized member, including incomplete J5/J6 cases. */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { parseStage, twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { readJsonBody } from '@/lib/billing/twoStage/api/http';
import { memberDocumentPreview } from '@/lib/billing/twoStage/api/memberPreview';

export const dynamic = 'force-dynamic';
type Params = { id: string; stage: string };

export const GET = withApiGuc(twoStageRoute<Params>('member preview GET', { mutation: false, caseRoute: false, readOnlyPreview: true }, (ctx) => memberDocumentPreview(ctx, parseStage(ctx.params.stage))));
export const POST = withApiGuc(twoStageRoute<Params>('member preview POST', { mutation: true, caseRoute: false, readOnlyPreview: true }, async (ctx) => memberDocumentPreview(ctx, parseStage(ctx.params.stage), await readJsonBody(ctx.request))));
