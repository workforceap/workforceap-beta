/**
 * POST (multipart: PDF `file`, optional `attestation`): store the original board-signed voucher byte for byte.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.10.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, parseJsonField, readMultipartBody } from '@/lib/billing/twoStage/api/http';
import { uploadVoucher } from '@/lib/billing/twoStage/api/evidence';
import type { VoucherUploadDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('voucher POST', { mutation: true, caseRoute: true }, async (ctx) => {
    const upload = await readMultipartBody(ctx.request);
    const attestation = upload.fields.has('attestation') ? parseJsonField(upload.fields, 'attestation') : undefined;
    return json<VoucherUploadDto>(await uploadVoucher(ctx, upload, attestation), 201);
  }),
);
