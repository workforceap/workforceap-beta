/**
 * GET: where the organization's approved signature image stands (metadata
 * only; the image is never served). POST (multipart: PNG `file`, `attestation`):
 * the designated signer, signed in as himself, approves his signature image or
 * replaces the active one. The image is organization-level; it lives under a
 * member only so the route runs the same access checks as every billing route.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.20.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { json, readMultipartBody } from '@/lib/billing/twoStage/api/http';
import { getSignature, uploadSignature } from '@/lib/billing/twoStage/api/signature';
import type { SignatureStatusDto, SignatureUploadDto } from '@/lib/billing/twoStage/dto';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export const GET = withApiGuc(
  twoStageRoute<Params>('signature GET', { mutation: false, caseRoute: false }, async (ctx) => json<SignatureStatusDto>(await getSignature(ctx))),
);

export const POST = withApiGuc(
  twoStageRoute<Params>('signature POST', { mutation: true, caseRoute: false }, async (ctx) => {
    const upload = await readMultipartBody(ctx.request);
    const result = await uploadSignature(ctx, upload);
    return json<SignatureUploadDto>(result.body, result.status);
  }),
);
