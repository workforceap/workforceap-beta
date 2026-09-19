'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { splitLocalePrefix } from '@/lib/i18n/config';
import { detectGpc, pushConsentToGtag, readConsent, writeConsent } from '@/lib/consent/state';
import styles from './CookieConsentBanner.module.css';

/** Authenticated workspaces — staff/member chrome, not a consent surface. */
const PORTAL_PREFIXES = [
  '/admin', '/dashboard', '/counselor', '/employer', '/partner', '/group',
  '/dev/staff', '/dev/member',
];

function isPortalPath(pathname: string | null): boolean {
  const { pathnameWithoutLocale } = splitLocalePrefix(pathname ?? '/');
  return PORTAL_PREFIXES.some((p) => pathnameWithoutLocale === p || pathnameWithoutLocale.startsWith(`${p}/`));
}

export default function CookieConsentBanner() {
  const pathname = usePathname();
  const t = useTranslations('cookieConsent');
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLElement>(null);
  const shouldShow = visible && !isPortalPath(pathname);

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

  useEffect(() => {
    const banner = bannerRef.current;
    if (!shouldShow || !banner) return;

    const previousPadding = document.body.style.paddingBottom;
    const basePadding = Number.parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    const bottomNav = document.getElementById('mobile-bottom-nav');
    const measure = () => {
      const navRect = bottomNav?.getBoundingClientRect();
      const bottom = navRect && navRect.height > 0
        ? Math.max(0, window.innerHeight - navRect.top)
        : 0;
      banner.style.setProperty('--cookie-consent-bottom', `${bottom}px`);
      // Reserve actual visible height, including wrapped translations.
      // Suppressed portal routes never run this layout effect.
      document.body.style.paddingBottom = `${basePadding + banner.getBoundingClientRect().height + bottom}px`;
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
    };
  }, [shouldShow, pathname]);

  const decide = (decision: 'accepted' | 'declined') => {
    writeConsent(decision);
    pushConsentToGtag(decision);
    setVisible(false);
  };

  if (!shouldShow) return null;

  return (
    <section ref={bannerRef} className={styles.banner} aria-label={t('label')}>
      <p className={styles.description}>
        {t.rich('description', {
          // Legal documents are Astro-owned root routes; use document navigation.
          privacy: (chunks) => <a href="/privacy">{chunks}</a>,
          terms: (chunks) => <a href="/terms">{chunks}</a>,
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
