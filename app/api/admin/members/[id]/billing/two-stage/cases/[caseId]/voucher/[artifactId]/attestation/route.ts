/**
 * POST (designated signer only): the voucher data entry for that exact file.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.10.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { attestVoucher } from '@/lib/billing/twoStage/api/evidence';
import type { VoucherUploadDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; artifactId: string };

export const POST = withApiGuc(
  twoStageRoute<Params>('voucher attestation POST', { mutation: true, caseRoute: true }, async (ctx) =>
    json<Omit<VoucherUploadDto, 'reused'>>(await attestVoucher(ctx, ctx.params.artifactId, await readJsonBody(ctx.request)), 201),
  ),
);
