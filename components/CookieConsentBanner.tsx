'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { useLocaleFromPath } from '@/lib/i18n/client';
import { localizeHref } from '@/lib/i18n/localizeHref';
import { detectGpc, pushConsentToGtag, readConsent, writeConsent } from '@/lib/consent/state';
import { COOKIE_CONSENT_RESERVE_VAR } from '@/lib/consent/reserve';
import styles from './CookieConsentBanner.module.css';

/** Authenticated workspaces — staff/member chrome, not a consent surface. */
const PORTAL_PREFIXES = [
  '/admin', '/dashboard', '/counselor', '/employer', '/partner', '/group',
  '/dev/staff', '/dev/member',
];

/**
 * Auth screens (app/(auth)) center a form in 100vh. A fixed bar there covered
 * the submit at 1280x900 and the remember-me checkbox at 390x844, and body
 * padding cannot move content inside a viewport-centered box. On these routes
 * the notice renders in flow after the page instead, and the screens shrink
 * by `--cookie-consent-reserve` so nothing interactive paints under it.
 */
const AUTH_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password', '/setup-mfa', '/verify-mfa'];

function matchesPrefix(pathname: string | null, prefixes: readonly string[]): boolean {
  const { pathnameWithoutLocale } = splitLocalePrefix(pathname ?? '/');
  return prefixes.some((p) => pathnameWithoutLocale === p || pathnameWithoutLocale.startsWith(`${p}/`));
}

function isPortalPath(pathname: string | null): boolean {
  return matchesPrefix(pathname, PORTAL_PREFIXES);
}

type ConsentPlacement = 'fixed' | 'in-flow';

/** Where the notice sits: in flow on 100vh-centered auth screens, fixed elsewhere. */
function consentPlacementFor(pathname: string | null): ConsentPlacement {
  return matchesPrefix(pathname, AUTH_PREFIXES) ? 'in-flow' : 'fixed';
}

export default function CookieConsentBanner() {
  const pathname = usePathname();
  const locale = useLocaleFromPath();
  const t = useTranslations('cookieConsent');
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLElement>(null);
  const shouldShow = visible && !isPortalPath(pathname);
  const placement = consentPlacementFor(pathname);

  useEffect(() => {
    const existing = readConsent();
    if (existing.decision === 'unset') {
      if (detectGpc()) {
        // GPC is an opt-out even on routes where the banner is suppressed.
        writeConsent('declined', { fromGpc: true });
        pushConsentToGtag('declined');
      } else {
        setVisible(true);
      }
    }
  }, []);

  // Layout effect: the reserve must land in the same frame the notice appears,
  // otherwise the first paint shows the bar over whatever sits at the bottom.
  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!shouldShow || !banner) return;

    const previousPadding = document.body.style.paddingBottom;
    const basePadding = Number.parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    const bottomNav = document.getElementById('mobile-bottom-nav');
    const inFlow = placement === 'in-flow';
    const measure = () => {
      const navRect = bottomNav?.getBoundingClientRect();
      const bottom = !inFlow && navRect && navRect.height > 0
        ? Math.max(0, window.innerHeight - navRect.top)
        : 0;
      banner.style.setProperty('--cookie-consent-bottom', `${bottom}px`);
      // Reserve actual visible height, including wrapped translations.
      // Suppressed portal routes never run this layout effect.
      const reserve = banner.getBoundingClientRect().height + bottom;
      // An in-flow notice already occupies its own space; only a fixed one
      // needs the body padded so the page can scroll clear of it.
      if (!inFlow) document.body.style.paddingBottom = `${basePadding + reserve}px`;
      // Body padding cannot move content inside a 100vh-centered screen (login),
      // so keyboard focus there landed under the banner. css/main.css reads this
      // as scroll-margin-bottom on focusable elements so focus() clears the banner,
      // and the auth screens subtract it from their min-height (lib/consent/reserve.ts).
      document.documentElement.style.setProperty(COOKIE_CONSENT_RESERVE_VAR, `${reserve}px`);
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(banner);
    if (bottomNav) observer?.observe(bottomNav);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.body.style.paddingBottom = previousPadding;
      document.documentElement.style.removeProperty(COOKIE_CONSENT_RESERVE_VAR);
    };
  }, [shouldShow, pathname, placement]);

  const decide = (decision: 'accepted' | 'declined') => {
    writeConsent(decision);
    pushConsentToGtag(decision);
    setVisible(false);
  };

  if (!shouldShow) return null;

  return (
    <section ref={bannerRef} className={styles.banner} data-placement={placement} aria-label={t('label')}>
      <p className={styles.description}>
        {t.rich('description', {
          // Legal documents are Astro-owned root routes; use document navigation
          // to the locale-prefixed copy, like the footer's LocalizedLink does.
          privacy: (chunks) => <a href={localizeHref('/privacy', locale)}>{chunks}</a>,
          terms: (chunks) => <a href={localizeHref('/terms', locale)}>{chunks}</a>,
        })}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.decline} onClick={() => decide('declined')}>
          {t('decline')}
        </button>
        <button type="button" className={styles.accept} onClick={() => decide('accepted')}>
          {t('accept')}
        </button>
      </div>
    </section>
  );
}
