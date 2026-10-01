import { withApiGuc } from '@/lib/db/withRequestGuc';
import { requireAgreementActor } from '@/lib/enrollmentAgreements/access';
import { EnrollmentAgreementError, enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { agreementJson } from '@/lib/enrollmentAgreements/http';
import { getAgreementCoverage } from '@/lib/enrollmentAgreements/service';
import type { EnrollmentAgreementCoverageStatus } from '@/lib/enrollmentAgreements/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withApiGuc(async (request: Request) => {
  try {
    const actor = await requireAgreementActor();
    const query = new URL(request.url).searchParams;
    const status = query.get('status') ?? 'all';
    const pageText = query.get('page') ?? '1';
    if (!['all', 'missing', 'pending', 'verified', 'needs_correction'].includes(status) || !/^[1-9]\d{0,4}$/.test(pageText)) {
      throw new EnrollmentAgreementError(400, 'INVALID_FILTER', 'Choose a valid agreement status and page.');
    }
    return agreementJson(await getAgreementCoverage(actor, status as EnrollmentAgreementCoverageStatus | 'all', Number(pageText)));
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});
