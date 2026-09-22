import Link from 'next/link';
import { MEMBER_PROGRAM_HREF } from '@/lib/member/memberProgramHref';

/**
 * Truthful empty-state copy for My Certificates. Since the 2026-09-22 product
 * review (item 4) a Coursera-reported course completion creates a `pending`
 * UserCertification (lib/certifications/pendingFromCompletion.ts), so a
 * member with no rows either has no completion reported yet or is looking at
 * a course that finished before the change. Staff verify every row before it
 * counts as earned; members can still add a certificate themselves.
 */
export const CERTIFICATES_EMPTY_LEAD =
  'No certificates are recorded yet. When Coursera reports a completed course we add it here as a pending certificate; our team verifies it before it counts as earned.';
export const CERTIFICATES_EMPTY_COURSERA =
  'Completed Coursera courses show in My program, and you can also add a certificate you earned elsewhere below.';
export const CERTIFICATES_EMPTY_DESCRIPTION = `${CERTIFICATES_EMPTY_LEAD} ${CERTIFICATES_EMPTY_COURSERA}`;

export default function CertificationsEmptyNotice() {
  return (
    <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
      {CERTIFICATES_EMPTY_LEAD} Completed Coursera courses show in{' '}
      <Link href={MEMBER_PROGRAM_HREF} style={{ color: 'var(--color-blue)', fontWeight: 600 }}>
        My program
      </Link>
      , and you can also add a certificate you earned elsewhere below.
    </p>
  );
}
