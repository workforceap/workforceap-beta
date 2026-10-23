'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ComponentProps } from 'react';
import { withPortalReturnTo } from '@/lib/nav/returnContext';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { localizeHref } from '@/lib/i18n/localizeHref';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: string; returnTo?: string };

/** A normal record link that retains the originating workspace's URL state. */
export default function PortalRecordLink({ href, returnTo, ...props }: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search?.toString();
  const origin = returnTo ?? `${pathname ?? ''}${query ? `?${query}` : ''}`;
  const direct = withPortalReturnTo(href, origin);
  // A detail → edit/detail hop carries its existing validated list context.
  // A fresh list always wins over an older returnTo in that list's query.
  const carried = returnTo === undefined && direct === href && search?.get('returnTo');
  const destination = carried ? withPortalReturnTo(href, carried) : direct;
  const locale = splitLocalePrefix(pathname ?? '').locale;
  return <Link {...props} href={locale ? localizeHref(destination, locale) : destination} />;
}
