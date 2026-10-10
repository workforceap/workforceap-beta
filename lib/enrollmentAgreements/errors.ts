export class EnrollmentAgreementError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function requireEnrollmentAgreementsEnabled(): void {
  if (process.env.ENROLLMENT_AGREEMENTS_ENABLED !== 'true') {
    throw new EnrollmentAgreementError(503, 'ENROLLMENT_AGREEMENTS_UNAVAILABLE', 'Enrollment agreements are not available yet. Please contact the team.');
  }
}

export function enrollmentAgreementErrorResponse(error: unknown): Response {
  if (error instanceof EnrollmentAgreementError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
  // Do not expose filenames, member data, SQL, keys, or provider diagnostics.
  return Response.json({ error: 'Enrollment agreements are temporarily unavailable. Please try again later.', code: 'ENROLLMENT_AGREEMENTS_UNAVAILABLE' }, {
    status: 503, headers: { 'Cache-Control': 'private, no-store' },
  });
}
