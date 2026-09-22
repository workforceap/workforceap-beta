import Link from 'next/link';
import { MEMBER_PROGRAM_HREF } from '@/lib/member/memberProgramHref';

/**
 * Truthful empty-state copy for My Certificates. Nothing writes a
 * UserCertification from a Coursera completion today (lib/member/courseCompletion.ts
 * records progress, points and emails only), so this copy must not promise an
 * automatic sync. Members add certificates themselves; the team verifies them.
 */
export const CERTIFICATES_EMPTY_LEAD =
  'No certificates are recorded yet. Add a certificate you have earned below; our team verifies it before it counts as earned.';
export const CERTIFICATES_EMPTY_COURSERA =
  'Completed Coursera courses show in My program and are not added here automatically yet.';
export const CERTIFICATES_EMPTY_DESCRIPTION = `${CERTIFICATES_EMPTY_LEAD} ${CERTIFICATES_EMPTY_COURSERA}`;

export default function CertificationsEmptyNotice() {
  return (
    <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
      {CERTIFICATES_EMPTY_LEAD} Completed Coursera courses show in{' '}
      <Link href={MEMBER_PROGRAM_HREF} style={{ color: 'var(--color-blue)', fontWeight: 600 }}>
        My program
      </Link>{' '}
      and are not added here automatically yet.
    </p>
  );
}
