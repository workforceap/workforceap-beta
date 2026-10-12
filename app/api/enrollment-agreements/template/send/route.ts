import { z } from 'zod';
import { checkEnrollmentTemplateSendRateLimit } from '@/lib/rate-limit';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { requireAgreementActor, requireAgreementMemberAccess } from '@/lib/enrollmentAgreements/access';
import { EnrollmentAgreementError, enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { agreementJson, readBoundedBody, requireSameOrigin } from '@/lib/enrollmentAgreements/http';
import { getTemplateSendView, sendApprovedTemplate } from '@/lib/enrollmentAgreements/templateSend';
import { ENROLLMENT_TEMPLATE_VERSION } from '@/lib/enrollmentAgreements/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sendSchema = z.object({
  memberId: z.string().uuid(),
  operationId: z.string().uuid(),
  templateVersion: z.literal(ENROLLMENT_TEMPLATE_VERSION),
  recipientEmail: z.string().email().max(320),
  expectedLatestOperationId: z.string().uuid().nullable(),
}).strict();

export const GET = withApiGuc(async (request: Request) => {
  try {
    const actor = await requireAgreementActor();
    const memberId = new URL(request.url).searchParams.get('memberId');
    if (!memberId) throw new EnrollmentAgreementError(400, 'INVALID_ID', 'Choose a student.');
    return agreementJson(await getTemplateSendView(actor, memberId));
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});

export const POST = withApiGuc(async (request: Request) => {
  try {
    const actor = await requireAgreementActor();
    requireSameOrigin(request);
    const bytes = await readBoundedBody(request, 2048);
    let body: unknown;
    try { body = JSON.parse(Buffer.from(bytes).toString('utf8')); }
    catch { throw new EnrollmentAgreementError(400, 'INVALID_SEND', 'Check the student and template before sending.'); }
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) throw new EnrollmentAgreementError(400, 'INVALID_SEND', 'Check the student and template before sending.');
    await requireAgreementMemberAccess(actor, parsed.data.memberId, 'send');
    if (!(await checkEnrollmentTemplateSendRateLimit(actor.id, parsed.data.memberId, request)).success) {
      throw new EnrollmentAgreementError(429, 'SEND_RATE_LIMIT', 'Too many form sends or retries. Wait before trying again.');
    }
    return agreementJson(await sendApprovedTemplate(actor, parsed.data.memberId, parsed.data.operationId,
      parsed.data.recipientEmail, parsed.data.expectedLatestOperationId));
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});
