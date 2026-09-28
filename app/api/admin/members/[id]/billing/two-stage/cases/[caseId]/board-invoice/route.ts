/**
 * POST (multipart: PDF `file`): an optional board invoice, stored byte for byte.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.11.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readMultipartBody } from '@/lib/billing/twoStage/api/http';
import { uploadBoardInvoice } from '@/lib/billing/twoStage/api/evidence';
import type { BoardInvoiceUploadDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('board invoice POST', { mutation: true, caseRoute: true }, async (ctx) => json<BoardInvoiceUploadDto>(await uploadBoardInvoice(ctx, await readMultipartBody(ctx.request)), 201)),
);
