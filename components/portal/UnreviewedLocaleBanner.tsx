'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isReviewedLocale } from '@/lib/i18n/config';
import LanguageToggle from '@/components/portal/LanguageToggle';
import LegacyGlyph from '@/components/icons/LegacyGlyph';

/**
 * Subtle, dismissible notice shown across the portal when the active locale
 * (fr/pt today) is machine-translated rather than human-reviewed — see
 * REVIEWED_LOCALES in lib/i18n/config.ts.
 *
 * Dismissible per-locale via a session cookie (mirrors StaffViewBanner), so
 * switching languages re-surfaces the notice rather than hiding it forever
 * the first time any unreviewed locale is dismissed.
 */
export default function UnreviewedLocaleBanner() {
  const locale = useLocale();
  const t = useTranslations('common');
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  const cookieName = `wa_locale_notice_dismissed_${locale}`;

  useEffect(() => {
    const cookies = typeof document !== 'undefined' ? document.cookie : '';
    const isDismissed = cookies.split(';').some((c) => c.trim().startsWith(`${cookieName}=1`));
    setDismissed(isDismissed);
  }, [cookieName]);

  if (isReviewedLocale(locale) || dismissed !== false) return null;

  const handleDismiss = () => {
    if (typeof document !== 'undefined') {
      document.cookie = `${cookieName}=1; Path=/; SameSite=Lax`;
    }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      aria-label="Machine translation notice"
      style={{
        maxWidth: 'min(80rem, 100%)',
        margin: '0.75rem auto 0',
        background: 'rgba(43,123,185,0.06)',
        border: '1px solid rgba(43,123,185,0.2)',
        borderRadius: '0.5rem',
        padding: '0.5rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.625rem',
        fontSize: '0.8125rem',
        color: 'var(--color-on-surface-variant)',
      }}
    >
      <LegacyGlyph name="translate" size={16} style={{ color: 'var(--color-blue)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>{t('machineTranslationNotice')}</span>
      <span style={{ fontWeight: 700 }}>{t('machineTranslationNoticeAction')}:</span>
      <LanguageToggle compact />
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('close')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-on-surface-variant)',
          cursor: 'pointer',
          padding: '0.125rem 0.25rem',
          fontSize: '0.875rem',
          lineHeight: 1,
        }}
      >
        <LegacyGlyph name="close" size={16} />
      </button>
    </div>
  );
}
