'use client';

import { useLinkStatus } from 'next/link';
import { useTranslations } from 'next-intl';

/** Native Link transition feedback; current-page selection changes only on arrival. */
export default function NavigationPending() {
  const { pending } = useLinkStatus();
  const t = useTranslations('nav');

  if (!pending) return null;

  return (
    <span className="workspace-navigation-pending" role="status">
      <span className="wa-sr-only">{t('menuLoading')}</span>
    </span>
  );
}
