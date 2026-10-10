import { withApiGuc } from '@/lib/db/withRequestGuc';
import { checkResumeUploadRateLimit } from '@/lib/rate-limit';
import { requireAgreementActor, requireAgreementMemberAccess } from '@/lib/enrollmentAgreements/access';
import { EnrollmentAgreementError, enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { agreementJson, readAgreementMultipart, requireSameOrigin } from '@/lib/enrollmentAgreements/http';
import { readAgreementPdf } from '@/lib/enrollmentAgreements/pdf';
import { createAgreementSubmission, getAgreementSummary } from '@/lib/enrollmentAgreements/service';
import { ENROLLMENT_TEMPLATE_VERSION } from '@/lib/enrollmentAgreements/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApiGuc(async (request: Request) => {
  try {
    const actor = await requireAgreementActor();
    const memberId = new URL(request.url).searchParams.get('memberId') ?? actor.id;
    return agreementJson(await getAgreementSummary(actor, memberId));
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});

export const POST = withApiGuc(async (request: Request) => {
  try {
    const actor = await requireAgreementActor();
    requireSameOrigin(request);
    // Reuse the bounded upload limiter with an independent agreement key.
    if (!(await checkResumeUploadRateLimit(`enrollment-agreement:${actor.id}`)).success) {
      throw new EnrollmentAgreementError(429, 'UPLOAD_RATE_LIMIT', 'Too many uploads. Wait a few minutes before trying again.');
    }
    const form = await readAgreementMultipart(request);
    const file = form.get('file');
    const memberId = form.get('memberId') ?? actor.id;
    const templateVersion = form.get('templateVersion');
    if (!file || typeof file === 'string' || typeof memberId !== 'string' || (templateVersion !== ENROLLMENT_TEMPLATE_VERSION && templateVersion !== 'previous') || form.getAll('file').length !== 1) {
      throw new EnrollmentAgreementError(400, 'INVALID_UPLOAD', 'Choose one PDF and its agreement version.');
    }
    await requireAgreementMemberAccess(actor, memberId, 'upload');
    const bytes = await readAgreementPdf(file);
    const result = await createAgreementSubmission(actor, { memberId, templateVersion, bytes });
    return agreementJson({ id: result.id, status: 'pending' }, 201);
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});
