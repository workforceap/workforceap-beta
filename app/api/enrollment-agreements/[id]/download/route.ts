import { withApiGuc } from '@/lib/db/withRequestGuc';
import { requireAgreementActor } from '@/lib/enrollmentAgreements/access';
import { enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { getAgreementForRead } from '@/lib/enrollmentAgreements/service';
import { agreementPdfResponse, readStoredAgreementPdf } from '@/lib/enrollmentAgreements/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withApiGuc(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const actor = await requireAgreementActor();
    const row = await getAgreementForRead(actor, (await params).id);
    return agreementPdfResponse(await readStoredAgreementPdf(row), `enrollment-agreement-${row.id}.pdf`);
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});
