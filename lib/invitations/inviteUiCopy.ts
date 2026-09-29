/** Translate recognized public API messages; unknown provider/debug text stays private. */
const INVITATION_ERROR_KEYS = {
  'Enter the email address the invitation was sent to and your login code.': 'codeRequired',
  'Too many attempts. Please try again in an hour.': 'rateLimited',
  'No open invitation matches that email and login code. Check both, or ask your WorkforceAP contact to resend it.': 'codeMismatch',
  'Invalid or missing token': 'invalidLink',
  'Invitation not found': 'invalidLink',
  'Already accepted': 'alreadyAccepted',
  'Invitation no longer valid': 'invalidLink',
  'Invitation has expired': 'expired',
  'Name is required': 'nameRequired',
  'Name and password (min 8 chars) are required for new accounts': 'newAccountRequired',
  'Account signup is temporarily unavailable. If this continues, contact support.': 'signupUnavailable',
} as const;

export type InvitationErrorKey = typeof INVITATION_ERROR_KEYS[keyof typeof INVITATION_ERROR_KEYS]
  | 'loadFailed' | 'codeFailed' | 'acceptFailed' | 'curriculumPending'
  | 'accountRecoveryRequired' | 'identityReviewRequired' | 'generic';

export function invitationErrorKey(error: unknown, fallback: InvitationErrorKey, code?: unknown): InvitationErrorKey {
  if (code === 'CURRICULUM_MIGRATION_PENDING') return 'curriculumPending';
  if (code === 'INVITE_ACCOUNT_RECOVERY_REQUIRED') return 'accountRecoveryRequired';
  if (code === 'INVITE_IDENTITY_REVIEW_REQUIRED') return 'identityReviewRequired';
  return typeof error === 'string' && Object.hasOwn(INVITATION_ERROR_KEYS, error)
    ? INVITATION_ERROR_KEYS[error as keyof typeof INVITATION_ERROR_KEYS]
    : fallback;
}

export function invitationRoleKey(role: unknown): 'admin' | 'partner' | 'counselor' | 'member' | 'employer' | 'invitedUser' {
  return role === 'admin' || role === 'partner' || role === 'counselor' || role === 'member' || role === 'employer'
    ? role : 'invitedUser';
}
