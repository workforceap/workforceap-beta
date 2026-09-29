/**
 * GET: verified bytes of one archived file. The only read path into the staff-restricted finance archive; no signed or public URL.
 * Contract: docs/BILLING-PACKETS.md "Two-stage API contract (M3)" §5.12.
 * Checks run in the fixed order of twoStageRoute (migration gate, Origin on
 * mutations, admin, tenant, provider org, case ownership).
 */
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { twoStageRoute } from '@/lib/billing/twoStage/api/access';
import { downloadFile } from '@/lib/billing/twoStage/api/documents';

export const dynamic = 'force-dynamic';

type Params = { id: string; caseId: string; artifactId: string };

export const GET = withApiGuc(twoStageRoute<Params>('file GET', { mutation: false, caseRoute: true }, (ctx) => downloadFile(ctx, ctx.params.artifactId)));
