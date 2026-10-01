/**
 * POST (multipart: attestation, optional PDF file): a quote issued manually before this system.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.6.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, parseJsonField, readMultipartBody } from '@/lib/billing/twoStage/api/http';
import { attestExternalQuote } from '@/lib/billing/twoStage/api/evidence';
import type { ExternalQuoteDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('external quote POST', { mutation: true, caseRoute: true }, async (ctx) => {
    const upload = await readMultipartBody(ctx.request);
    return json<ExternalQuoteDto>(await attestExternalQuote(ctx, upload, parseJsonField(upload.fields, 'attestation')), 201);
  }),
);
