import { withApiGuc } from '@/lib/db/withRequestGuc';
import { requireAgreementActor } from '@/lib/enrollmentAgreements/access';
import { enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { getAgreementForRead } from '@/lib/enrollmentAgreements/service';
import { agreementPdfResponse, readStoredAgreementPdf } from '@/lib/enrollmentAgreements/storage';
import { recordAgreementAudit } from '@/lib/enrollmentAgreements/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withApiGuc(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const actor = await requireAgreementActor();
    const row = await getAgreementForRead(actor, (await params).id);
    const bytes = await readStoredAgreementPdf(row);
    if (actor.id !== row.subjectMemberId) await recordAgreementAudit(actor, 'downloaded', { id: row.id, memberId: row.subjectMemberId }, true);
    return agreementPdfResponse(bytes, `enrollment-agreement-${row.id}.pdf`);
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});
