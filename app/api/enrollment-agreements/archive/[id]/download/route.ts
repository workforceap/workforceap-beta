import { withApiGuc } from '@/lib/db/withRequestGuc';
import { requireAgreementArchiveActor } from '@/lib/enrollmentAgreements/access';
import { getArchivedAgreementForRead } from '@/lib/enrollmentAgreements/archive';
import { recordAgreementAudit } from '@/lib/enrollmentAgreements/audit';
import { enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { agreementPdfResponse, readStoredAgreementPdf } from '@/lib/enrollmentAgreements/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withApiGuc(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const actor = await requireAgreementArchiveActor();
    const row = await getArchivedAgreementForRead(actor, (await params).id);
    const bytes = await readStoredAgreementPdf(row);
    // Every archive download is staff access, including an admin's own old record.
    await recordAgreementAudit(actor, 'downloaded', { id: row.id, memberId: row.subjectMemberId }, true);
    return agreementPdfResponse(bytes, `enrollment-agreement-${row.id}.pdf`);
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});
