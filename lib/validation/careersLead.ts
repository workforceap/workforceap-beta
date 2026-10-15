import { INQUIRY_LIMITS, validInquiryEmail, validSubmissionId } from '@/lib/publicInquiries/validation';

export type CareersLeadFieldKey =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'interest_area'
  | 'message'
  | 'role_title'
  | 'submission_id';

export type CareersLeadErrorCode = 'required' | 'invalid_email' | 'too_short' | 'too_long' | 'invalid';

export type CareersLeadPayload = {
  firstName: string;
  lastName: string;
  email: string;
  interestArea?: string;
  message: string;
  roleTitle?: string;
  turnstileToken?: string;
  submissionId?: string;
};

const INTEREST_AREAS = new Set(['counselor', 'engineering', 'operations', 'other']);

export function validateCareersLeadPayload(body: unknown):
  | { ok: true; data: CareersLeadPayload }
  | {
      ok: false;
      fieldErrors: Partial<Record<CareersLeadFieldKey, CareersLeadErrorCode>>;
    } {
  if (!body || typeof body !== 'object') {
    return { ok: false, fieldErrors: {} };
  }

  const o = body as Record<string, unknown>;
  const firstName = typeof o.first_name === 'string' ? o.first_name.trim() : '';
  const lastName = typeof o.last_name === 'string' ? o.last_name.trim() : '';
  const email = typeof o.email === 'string' ? o.email.trim() : '';
  const message = typeof o.message === 'string' ? o.message.trim() : '';
  const roleTitle = typeof o.role_title === 'string' ? o.role_title.trim() || undefined : undefined;
  const interestAreaRaw = typeof o.interest_area === 'string' ? o.interest_area.trim() : '';
  const interestArea = INTEREST_AREAS.has(interestAreaRaw) ? interestAreaRaw : undefined;
  const turnstileToken =
    typeof o.cf_turnstile_response === 'string' ? o.cf_turnstile_response.trim() || undefined : undefined;

  const fieldErrors: Partial<Record<CareersLeadFieldKey, CareersLeadErrorCode>> = {};

  if (!firstName) fieldErrors.first_name = 'required';
  if (!lastName) fieldErrors.last_name = 'required';
  if (!email) {
    fieldErrors.email = 'required';
  } else if (!validInquiryEmail(email)) {
    fieldErrors.email = 'invalid_email';
  }
  if (!message) {
    fieldErrors.message = 'required';
  } else if (message.length < 20) {
    fieldErrors.message = 'too_short';
  }
  if (firstName.length > INQUIRY_LIMITS.name) fieldErrors.first_name = 'too_long';
  if (lastName.length > INQUIRY_LIMITS.name) fieldErrors.last_name = 'too_long';
  if (message.length > INQUIRY_LIMITS.message) fieldErrors.message = 'too_long';
  if ((roleTitle?.length ?? 0) > INQUIRY_LIMITS.label) fieldErrors.role_title = 'too_long';
  if (!validSubmissionId(o.submission_id)) fieldErrors.submission_id = 'invalid';

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      firstName,
      lastName,
      email,
      interestArea,
      message,
      roleTitle,
      turnstileToken,
      submissionId: typeof o.submission_id === 'string' ? o.submission_id || undefined : undefined,
    },
  };
}
