/**
 * GET: the exact statement. POST (designated signer principal only): Michael's receiving signature on that exact voucher sha256.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.10a.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readJsonBody } from '@/lib/billing/twoStage/api/http';
import { attestReceiptSignature, receiptStatementFor } from '@/lib/billing/twoStage/api/evidence';
import type { VoucherReceiptAttestationDto, VoucherReceiptStatementDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; artifactId: string };

export const GET = withApiGuc(
  twoStageRoute<Params>('receipt statement GET', { mutation: false, caseRoute: true }, async (ctx) => json<VoucherReceiptStatementDto>(await receiptStatementFor(ctx, ctx.params.artifactId))),
);

export const POST = withApiGuc(
  twoStageRoute<Params>('receipt attestation POST', { mutation: true, caseRoute: true }, async (ctx) =>
    json<VoucherReceiptAttestationDto>(await attestReceiptSignature(ctx, ctx.params.artifactId, await readJsonBody(ctx.request)), 201),
  ),
);
