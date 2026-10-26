'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { resolvePortalReturnTo } from '@/lib/nav/returnContext';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { localizeHref } from '@/lib/i18n/localizeHref';

type Props = { fallbackHref: string; fallbackLabel: string; className?: string; style?: CSSProperties };

/** Explicit list return; browser Back remains available for ordinary history. */
export default function PortalBackLink({ fallbackHref, fallbackLabel, className, style }: Props) {
  const params = useSearchParams();
  const pathname = usePathname();
  const t = useTranslations('portalWorkspaces');
  const locale = splitLocalePrefix(pathname ?? '').locale;
  const fallback = locale ? localizeHref(fallbackHref, locale) : fallbackHref;
  const href = resolvePortalReturnTo(params?.get('returnTo'), fallback);
  return <Link href={href} className={className} style={style}>{href === fallback ? fallbackLabel : t('backToResults')}</Link>;
}
