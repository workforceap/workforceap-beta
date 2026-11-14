/**
 * POST multipart (PDF `file`, optional `attestation`) for vouchers up to ~4 MB, or
 * POST JSON `{ action: prepare|complete, sha256, byteLength, fileName }` for larger
 * vouchers (client uploads to signed storage, then completes).
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.10.
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { apiError, json, parseJsonField, readJsonBody, readMultipartBody } from '@/lib/billing/twoStage/api/http';
import {
  completeVoucherDirectUpload,
  prepareVoucherDirectUpload,
  uploadVoucher,
} from '@/lib/billing/twoStage/api/evidence';
import type { VoucherDirectPrepareDto, VoucherUploadDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('voucher POST', { mutation: true, caseRoute: true }, async (ctx) => {
    const contentType = ctx.request.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.startsWith('application/json')) {
      const body = await readJsonBody(ctx.request);
      const action = typeof (body as { action?: unknown })?.action === 'string' ? (body as { action: string }).action : '';
      if (action === 'prepare') {
        return json<VoucherDirectPrepareDto>(await prepareVoucherDirectUpload(ctx, body), 200);
      }
      if (action === 'complete') {
        return json<VoucherUploadDto>(await completeVoucherDirectUpload(ctx, body), 201);
      }
      throw apiError(422, 'VALIDATION_FAILED', 'Unknown action.', { field: 'action' });
    }
    const upload = await readMultipartBody(ctx.request);
    const attestation = upload.fields.has('attestation') ? parseJsonField(upload.fields, 'attestation') : undefined;
    return json<VoucherUploadDto>(await uploadVoucher(ctx, upload, attestation), 201);
  }),
);
