/**
 * Member identity shown in the portal shell (WAP-101).
 *
 * The shell used to carry only a generic "My account" chip plus Sign out, so
 * the only place a member could see *who* was signed in was the sign-out
 * affordance. This builds the name / initials / avatar block from the saved
 * `User.fullName`, `User.email` and the signed profile-photo URL — nothing is
 * inferred beyond falling back to the email when no name is on file.
 */

export type MemberShellIdentity = {
  /** Display name: saved full name, else the email, else "Member". */
  name: string;
  /** Account email when it differs from the display name, else null. */
  email: string | null;
  /** One or two uppercase letters for the initials avatar. */
  initials: string;
  /** Signed or public profile photo URL; null shows initials. */
  avatarUrl: string | null;
  /** Where the identity block links (profile & settings). */
  href: string;
};

export const MEMBER_IDENTITY_HREF = '/dashboard/profile';

/**
 * "Alex Rivera" → "AR"; "alex" → "A"; falls back to the email's first letter;
 * "?" when nothing usable is saved. Never returns lowercase or more than two chars.
 */
export function memberInitials(name: string | null | undefined, email?: string | null): string {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length >= 2) {
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  }
  if (words.length === 1) return words[0][0].toUpperCase();
  const emailStart = (email ?? '').trim()[0];
  return emailStart ? emailStart.toUpperCase() : '?';
}

export function buildMemberShellIdentity(input: {
  fullName: string | null | undefined;
  email: string | null | undefined;
  avatarUrl?: string | null;
}): MemberShellIdentity {
  const fullName = input.fullName?.trim() || '';
  const email = input.email?.trim() || '';
  const name = fullName || email || 'Member';
  return {
    name,
    email: email && email !== name ? email : null,
    initials: memberInitials(fullName, email),
    avatarUrl: input.avatarUrl?.trim() || null,
    href: MEMBER_IDENTITY_HREF,
  };
}
