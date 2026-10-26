'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { kitTableHref } from '@/components/portal/kit/kitTableUrlState';

const STAGES = ['all', 'applied', 'enrolled', 'in_training', 'certified', 'placed'] as const;
const MOBILE_VIEWS = ['all', 'active', 'placed', 'atRisk'] as const;
export type PartnerReferralMobileView = (typeof MOBILE_VIEWS)[number];

/**
 * Both responsive referral lists retain their existing filter definitions.
 * Store the controls in the URL so opening a member and returning restores
 * the view. Native history updates keep this filtering local to the loaded,
 * partner-scoped rows rather than requesting a different data population.
 */
export function usePartnerReferralListContext() {
  const searchParams = useSearchParams();
  const currentQuery = searchParams?.toString() ?? '';
  const [query, setQuery] = useState(() => new URLSearchParams(currentQuery));

  useEffect(() => setQuery(new URLSearchParams(currentQuery)), [currentQuery]);

  const update = useCallback((filters: Record<string, string>) => {
    const href = kitTableHref(window.location.pathname, window.location.search, { filters });
    // Next copies its own history state and synchronizes useSearchParams for
    // external updates. Passing its internal state back would bypass that
    // synchronization and leave record links with the previous filter query.
    window.history.replaceState(null, '', `${href}${window.location.hash}`);
    setQuery(new URLSearchParams(window.location.search));
  }, []);

  const rawStage = query.get('stage');
  const rawView = query.get('referralView');
  return {
    search: query.get('search') ?? '',
    stage: STAGES.find((value) => value === rawStage) ?? 'all',
    mobileView: MOBILE_VIEWS.find((value) => value === rawView) ?? 'all',
    setSearch: (value: string) => update({ search: value }),
    setStage: (value: string) => update({ stage: value === 'all' ? '' : value }),
    setMobileView: (value: PartnerReferralMobileView) => update({ referralView: value === 'all' ? '' : value }),
    clearDesktop: () => update({ search: '', stage: '' }),
  };
}
