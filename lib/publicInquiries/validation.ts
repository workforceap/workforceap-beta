export type PublicInquiryKind = 'contact' | 'sponsorship' | 'careers';

export type PublicInquiryInput = {
  kind: PublicInquiryKind;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  topic: string;
  message: string;
  organizationName?: string;
  interestArea?: string;
  roleTitle?: string;
  seats?: number;
  smsPreferred: boolean;
  submissionId?: string;
  turnstileToken?: string;
};

export const INQUIRY_LIMITS = { name: 100, email: 254, phone: 80, label: 200, message: 10000 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validInquiryEmail(value: string): boolean {
  return value.length <= INQUIRY_LIMITS.email && EMAIL_RE.test(value);
}

export function validSubmissionId(value: unknown): boolean {
  return value === undefined || value === '' || (typeof value === 'string' && UUID_RE.test(value));
}

function text(o: Record<string, unknown>, key: string): string {
  return typeof o[key] === 'string' ? o[key].trim() : '';
}

/** All persisted strings are bounded before either persistence or notification. */
export function parseContactInquiry(body: unknown): PublicInquiryInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const kind = o.source === 'sponsorship' ? 'sponsorship' : 'contact';
  const firstName = text(o, 'first_name');
  const lastName = text(o, 'last_name');
  const email = text(o, 'email');
  const phone = text(o, 'phone');
  const topic = kind === 'sponsorship' ? 'Sponsorship inquiry' : text(o, 'topic');
  const organizationName = text(o, 'organization');
  const interestArea = text(o, 'interest');
  const notes = text(o, 'message');
  const message = notes || (kind === 'sponsorship' ? 'Please contact me about the sponsorship option selected above.' : '');
  const seatsText = o.seats === undefined || o.seats === '' ? '' : String(o.seats);
  const seats = seatsText ? Number(seatsText) : undefined;
  if (!firstName || firstName.length > INQUIRY_LIMITS.name || !lastName || lastName.length > INQUIRY_LIMITS.name
    || !validInquiryEmail(email) || !topic || topic.length > INQUIRY_LIMITS.label
    || !message || message.length > INQUIRY_LIMITS.message || phone.length > INQUIRY_LIMITS.phone
    || organizationName.length > INQUIRY_LIMITS.label || interestArea.length > INQUIRY_LIMITS.label
    || !validSubmissionId(o.submission_id)
    || (seats !== undefined && (!Number.isInteger(seats) || seats < 1 || seats > 100000))
    || (kind === 'sponsorship' && (!organizationName || !interestArea))) return null;
  return {
    kind, firstName, lastName, email, phone: phone || undefined, topic, message,
    organizationName: organizationName || undefined, interestArea: interestArea || undefined,
    seats, smsPreferred: o.sms_preferred === true || o.sms_preferred === 'true',
    submissionId: text(o, 'submission_id') || undefined,
    turnstileToken: text(o, 'cf_turnstile_response') || undefined,
  };
}
