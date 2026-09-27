/**
 * Exact recipient sets: J5 goes to the counselor and the student (2); J6 goes
 * to board finance, the counselor and the student (3). No cc, no bcc, no
 * admin copy. Addresses must be distinct so each role receives its own copy.
 */
import type { BillingStage } from './constants';

export type RecipientRole = 'student' | 'counselor' | 'finance';

export const STAGE_RECIPIENT_ROLES: Readonly<Record<BillingStage, readonly RecipientRole[]>> = Object.freeze({
  j5: Object.freeze(['counselor', 'student'] as const),
  j6: Object.freeze(['finance', 'counselor', 'student'] as const),
});

export type Contact = { name: string; email: string };
export type Recipient = { role: RecipientRole; name: string; email: string };

export type RecipientResult = { ok: true; recipients: Recipient[] } | { ok: false; errors: string[] };

const EMAIL = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length <= 254 && EMAIL.test(trimmed);
}

const ROLE_LABEL: Record<RecipientRole, string> = { student: 'Student', counselor: 'Counselor', finance: 'Board finance' };

function build(stage: BillingStage, contacts: Partial<Record<RecipientRole, Contact | null | undefined>>): RecipientResult {
  const errors: string[] = [];
  const recipients: Recipient[] = [];
  for (const role of STAGE_RECIPIENT_ROLES[stage]) {
    const contact = contacts[role];
    const name = contact?.name?.trim() ?? '';
    const email = contact?.email ?? '';
    if (!name) errors.push(`${ROLE_LABEL[role]} name is required.`);
    if (!isPlausibleEmail(email)) errors.push(`${ROLE_LABEL[role]} email is missing or not valid.`);
    recipients.push({ role, name, email: normalizeEmail(email) });
  }
  const seen = new Map<string, RecipientRole>();
  for (const r of recipients) {
    if (!r.email) continue;
    const prior = seen.get(r.email);
    if (prior) errors.push(`${ROLE_LABEL[prior]} and ${ROLE_LABEL[r.role]} share ${r.email}; each recipient needs their own address.`);
    else seen.set(r.email, r.role);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, recipients };
}

/** Exactly the counselor and the student. */
export function j5Recipients(args: { student: Contact; counselor: Contact }): RecipientResult {
  return build('j5', args);
}

/** Exactly board finance, the counselor and the student. */
export function j6Recipients(args: { finance: Contact; counselor: Contact; student: Contact }): RecipientResult {
  return build('j6', args);
}
