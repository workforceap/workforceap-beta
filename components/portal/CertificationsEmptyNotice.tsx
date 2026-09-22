import { useTranslations } from 'next-intl';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';
import { MEMBER_PROGRAM_HREF } from '@/lib/member/memberProgramHref';

/** Anchor of the self-add form on the legacy My Certificates page. */
export const CERTIFICATES_ADD_FORM_ID = 'add-certificate';

/**
 * Truthful empty state for My Certificates (`empty.certificates` in
 * messages/*.json). Since the 2026-09-22 product review (item 4) a
 * Coursera-reported course completion creates a `pending` UserCertification
 * (lib/certifications/pendingFromCompletion.ts), so a member with no rows
 * either has no completion reported yet or is looking at a course that
 * finished before the change. Staff verify every row before it counts as
 * earned; members can still add a certificate themselves — the primary
 * action jumps to that form, the ghost link opens My program.
 */
export default function CertificationsEmptyNotice({
  headingAs = 'h3',
  addFormId = CERTIFICATES_ADD_FORM_ID,
}: {
  headingAs?: 'h2' | 'h3' | 'h4';
  /** Both legacy layouts render their own form, so each passes its own anchor id. */
  addFormId?: string;
}) {
  const t = useTranslations('empty');
  return (
    <KitEmptyState
      kind="first"
      headingAs={headingAs}
      title={t('certificates.title')}
      description={t('certificates.body')}
      primaryAction={{ href: `#${addFormId}`, label: t('certificates.action') }}
      secondaryAction={{ href: MEMBER_PROGRAM_HREF, label: t('certificates.secondary') }}
    />
  );
}
