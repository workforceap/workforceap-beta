import { useTranslations } from 'next-intl';
import { UserSearch, ShieldOff } from 'lucide-react';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';
import { COUNSELOR_ROSTER_EMPTY } from '@/lib/counselor/inboxEmptyState';

/**
 * The counselor roster with nothing to list (/counselor/students, /counselor/overview).
 * Two situations, both `unavailable` — the counselor cannot create the rows:
 *  - `unassigned`         an active counselor with no active assignments
 *                         (an admin assigns members) — info tone
 *  - `noCounselorRecord`  an admin viewing the counselor portal without a
 *                         counselor row; the roster queries only assignments,
 *                         so it is empty by construction — info tone, admin route
 * Copy from `empty.counselor.roster*`; server-safe (next-intl RSC hook).
 */
export default function CounselorRosterEmpty({
  variant,
  headingAs = 'h3',
  className,
}: {
  variant: 'unassigned' | 'noCounselorRecord';
  headingAs?: 'h2' | 'h3' | 'h4';
  className?: string;
}) {
  const t = useTranslations('empty');
  if (variant === 'noCounselorRecord') {
    const copy = COUNSELOR_ROSTER_EMPTY.noCounselorRecord;
    return (
      <KitEmptyState
        framed
        kind={copy.kind}
        tone={copy.tone}
        headingAs={headingAs}
        className={className}
        data-testid="counselor-roster-empty"
        data-variant={variant}
        icon={<ShieldOff size={13} aria-hidden="true" />}
        title={t('counselor.rosterNoCounselorRecord.title')}
        description={t('counselor.rosterNoCounselorRecord.body')}
        primaryAction={{ label: t('counselor.rosterNoCounselorRecord.action'), href: copy.primaryHref }}
      />
    );
  }
  const copy = COUNSELOR_ROSTER_EMPTY.unassigned;
  return (
    <KitEmptyState
      framed
      kind={copy.kind}
      tone={copy.tone}
      headingAs={headingAs}
      className={className}
      data-testid="counselor-roster-empty"
      data-variant={variant}
      icon={<UserSearch size={13} aria-hidden="true" />}
      title={t('counselor.roster.title')}
      description={t('counselor.roster.body')}
      primaryAction={{ label: t('counselor.roster.action'), href: copy.primaryHref }}
      secondaryAction={{ label: t('counselor.roster.secondary'), href: copy.secondaryHref }}
    />
  );
}
