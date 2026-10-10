/**
 * Shared contact checks for the apply flow (applicant + parent/guardian).
 *
 * Staff were getting mistyped phone numbers and emails, so the form now
 * requires a real-looking 10-digit US number and a well-formed email, and
 * flags common provider-domain typos (gmial.com, gmail.con, ...). These are
 * plausibility checks, not proof the number or inbox belongs to the person.
 */

/** NANP: digits only, with a leading country code "1" dropped. */
export function usPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('1') ? digits.slice(1) : digits;
}

/** Format while typing: "(512) 555-0100", never more than 10 digits. */
export function formatUsPhoneInput(value: string): string {
  // US area codes never start with 1, so a leading 1 is always the country code.
  const raw = value.replace(/\D/g, '');
  const digits = (raw.startsWith('1') ? raw.slice(1) : raw).slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export type PhoneIssue = 'required' | 'digits' | 'invalid';

export function usPhoneIssue(value: string): PhoneIssue | null {
  if (!value.trim()) return 'required';
  const digits = usPhoneDigits(value);
  if (digits.length !== 10) return 'digits';
  // Area code and exchange cannot start with 0 or 1.
  if (/^[01]/.test(digits) || /^[01]/.test(digits.slice(3))) return 'invalid';
  // One repeated digit (555-555-5555, 999-999-9999) is never a real line.
  if (/^(\d)\1{9}$/.test(digits)) return 'invalid';
  return null;
}

export type EmailIssue = 'required' | 'invalid' | 'typo';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

/** Misspellings of the providers most applicants use. */
const DOMAIN_TYPOS = new Set([
  'gmial.com', 'gmai.com', 'gamil.com', 'gnail.com', 'gmaill.com', 'gmail.co', 'gmail.con', 'gmail.cm', 'gmail.om', 'gmal.com',
  'yahooo.com', 'yaho.com', 'yahoo.con', 'yahoo.co', 'yhoo.com',
  'hotmial.com', 'hotmal.com', 'hotmail.con', 'hotmail.co', 'hotmai.com',
  'outlok.com', 'outlook.con', 'outlook.co', 'outloo.com',
  'icloud.co', 'icloud.con', 'iclod.com',
  'aol.co', 'aol.con',
]);

export function emailIssue(value: string): EmailIssue | null {
  const email = value.trim();
  if (!email) return 'required';
  if (!EMAIL_SHAPE.test(email) || email.includes('..')) return 'invalid';
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  if (domain.startsWith('.') || domain.endsWith('.')) return 'invalid';
  if (DOMAIN_TYPOS.has(domain)) return 'typo';
  return null;
}
