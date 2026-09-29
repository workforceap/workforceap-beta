/**
 * GET: the member's J5/J6 billing cases. POST: open a case for one program.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.1-5.2.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { listCases, openCase } from '@/lib/billing/twoStage/api/documents';
import type { ListCasesDto, OpenCaseDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export const GET = withApiGuc(twoStageRoute<Params>('cases GET', { mutation: false, caseRoute: false }, async (ctx) => json<ListCasesDto>(await listCases(ctx))));

export const POST = withApiGuc(
  twoStageRoute<Params>('cases POST', { mutation: true, caseRoute: false }, async (ctx) => json<OpenCaseDto>(await openCase(ctx, await readJsonBody(ctx.request)), 201)),
);
