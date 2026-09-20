/**
 * Soft-deleted accounts keep their `users` row for DELETED_ACCOUNT_RETENTION_DAYS
 * (see lib/retention/config.ts) so an admin can restore an accidental deletion
 * from /admin/users/deleted. The sign-in email is rewritten to this marker so
 * the address is released from the unique constraint immediately while the
 * original stays recoverable for that window only; the row is hard-purged
 * afterwards. The three-year audit log never receives the original address
 * (lib/member/anonymizeMember.ts).
 */
const MAX_EMAIL_LENGTH = 255;
const DELETED_EMAIL_SUFFIX = '@deleted.invalid';
const DELETED_EMAIL_RE = /^deleted_[0-9a-f-]{36}_\d+_(.+)@deleted\.invalid$/i;
const DELETED_EMAIL_MARKER_RE = /^deleted_[0-9a-f-]{36}_\d+_/i;

export function buildDeletedEmail(userId: string, timestampMs: number, email: string): string | null {
  const deletedEmail = `deleted_${userId}_${timestampMs}_${email}${DELETED_EMAIL_SUFFIX}`;
  return deletedEmail.length <= MAX_EMAIL_LENGTH ? deletedEmail : null;
}

export function parseDeletedEmail(email: string): string | null {
  return email.match(DELETED_EMAIL_RE)?.[1] ?? null;
}

export function isDeletedEmail(email: string): boolean {
  return email.endsWith(DELETED_EMAIL_SUFFIX);
}

export function isDeletedEmailMarker(email: string): boolean {
  return DELETED_EMAIL_MARKER_RE.test(email);
}
