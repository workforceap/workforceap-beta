import { withApiGuc } from '@/lib/db/withRequestGuc';
import { requireAgreementArchiveActor } from '@/lib/enrollmentAgreements/access';
import { getAgreementArchive } from '@/lib/enrollmentAgreements/archive';
import { EnrollmentAgreementError, enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { agreementJson } from '@/lib/enrollmentAgreements/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withApiGuc(async (request: Request) => {
  try {
    const actor = await requireAgreementArchiveActor();
    const params = new URL(request.url).searchParams;
    const page = params.get('page') ?? '1';
    const query = (params.get('query') ?? '').trim();
    if (!/^[1-9]\d{0,4}$/.test(page) || query.length > 120) {
      throw new EnrollmentAgreementError(400, 'INVALID_FILTER', 'Enter a name or original account ID and a valid page.');
    }
    return agreementJson(await getAgreementArchive(actor, query, Number(page)));
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});
