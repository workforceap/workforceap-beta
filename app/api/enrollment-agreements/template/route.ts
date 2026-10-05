import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { requireAgreementActor } from '@/lib/enrollmentAgreements/access';
import { EnrollmentAgreementError, enrollmentAgreementErrorResponse } from '@/lib/enrollmentAgreements/errors';
import { agreementPdfResponse, agreementSha256 } from '@/lib/enrollmentAgreements/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withApiGuc(async () => {
  try {
    await requireAgreementActor();
    const bytes = await readFile(path.join(process.cwd(), 'assets/enrollment/workforceap-enrollment-2026.pdf'));
    if (agreementSha256(bytes) !== 'dee5087ba4503c3d38dfb10c8e149a630f5c8b72e3c9d8a045a306737afff3a5') {
      throw new EnrollmentAgreementError(503, 'TEMPLATE_UNAVAILABLE', 'The enrollment template is temporarily unavailable.');
    }
    return agreementPdfResponse(bytes, 'WorkforceAP-Enrollment-2026.pdf');
  } catch (error) { return enrollmentAgreementErrorResponse(error); }
});
