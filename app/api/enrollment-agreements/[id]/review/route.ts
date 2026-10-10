import { z } from 'zod';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { requireAgreementActor } from '@/lib/enrollmentAgreements/access';
import { EnrollmentAgreementError, enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { agreementJson, readBoundedBody, requireSameOrigin } from '@/lib/enrollmentAgreements/http';
import { reviewAgreementSubmission } from '@/lib/enrollmentAgreements/service';
import { ENROLLMENT_REVIEW_NOTE_MAX } from '@/lib/enrollmentAgreements/types';

const reviewSchema = z.object({
  action: z.enum(['verify', 'request_correction']),
  reviewNote: z.string().trim().max(ENROLLMENT_REVIEW_NOTE_MAX).optional(),
  attestSignatures: z.boolean().optional(),
}).strict();
export const runtime = 'nodejs';

export const POST = withApiGuc(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const actor = await requireAgreementActor();
    requireSameOrigin(request);
    const bytes = await readBoundedBody(request, 8192);
    let body: unknown;
    try { body = JSON.parse(Buffer.from(bytes).toString('utf8')); }
    catch { throw new EnrollmentAgreementError(400, 'INVALID_REVIEW', 'The review form could not be read.'); }
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) throw new EnrollmentAgreementError(400, 'INVALID_REVIEW', 'Check the review action and correction note.');
    await reviewAgreementSubmission(actor, { id: (await params).id, ...parsed.data, reviewNote: parsed.data.reviewNote || null });
    return agreementJson({ success: true });
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});
