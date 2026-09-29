'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isMarketingChromeHidden } from '@/lib/nav/marketing-chrome';
import { recordMarketingNavDecision } from '@/lib/observability/portalHydrationClientTrace';

/** Code-split MainNav (~ThemeToggle/LanguageToggle/chrome) away from `/dashboard`/portal routes that never render it */
const MainNav = dynamic(() => import('./MainNav'), {
  loading: () => <div className="main-nav-layout-spacer" aria-hidden="true" />,
});

type ConditionalMarketingNavProps = {
  /** Server-detected paid `/apply` landing (UTM-driven). */
  forceHidden?: boolean;
};

/**
 * Renders MainNav only on public marketing routes.
 * Hidden inside any portal (one-shell rule) so portal nav is the only chrome.
 * Spacer reserves in-flow height so fixed nav does not cover page content (all breakpoints).
 */
export default function ConditionalMarketingNav({ forceHidden = false }: ConditionalMarketingNavProps) {
  const pathname = usePathname();
  const hidden = forceHidden || isMarketingChromeHidden(pathname);
  recordMarketingNavDecision(pathname, hidden);

  useEffect(() => {
    const root = document.documentElement;
    if (hidden) {
      root.classList.remove('has-marketing-main-nav');
      return;
    }
    root.classList.add('has-marketing-main-nav');
    return () => root.classList.remove('has-marketing-main-nav');
  }, [hidden]);

  if (hidden) return null;
  return (
    <>
      <MainNav />
      <div className="main-nav-layout-spacer" aria-hidden="true" />
    </>
  );
}
