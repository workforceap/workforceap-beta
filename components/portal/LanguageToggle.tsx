'use client';

import { Globe } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { AppLocale } from '@/lib/i18n/config';
import { isAppLocale, isReviewedLocale, splitLocalePrefix, withLocalePrefix } from '@/lib/i18n/config';
import { setLocaleCookie } from '@/lib/i18n/client';

const allLanguages: { code: AppLocale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
];

// Only advertise locales whose translations have passed human review — fr/pt
// stay fully reachable via direct URL navigation (see lib/i18n/config.ts),
// they just aren't offered as selectable options here.
const languages = allLanguages.filter((lang) => isReviewedLocale(lang.code));

export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname() ?? '/';
  const tCommon = useTranslations('common');
  const { locale, pathnameWithoutLocale } = splitLocalePrefix(pathname);
  // Portal paths (/dashboard, …) carry no locale prefix; the language comes
  // from the `wap-locale` cookie via middleware. Read the rendered locale
  // instead of assuming English, or after switching to Español the control
  // still showed "English" and picking English fired no change, so members
  // could not switch back (ops 10/14/26).
  const activeLocale = useLocale();
  const currentLocale: AppLocale = locale ?? (isAppLocale(activeLocale) ? activeLocale : 'en');
  const isPrefixedPath = !!locale;

  // Normally only reviewed locales are offered, but if the visitor is
  // already on an unreviewed locale (e.g. a bookmarked /fr/apply URL),
  // keep it visible as the current selection rather than showing a
  // blank/mismatched control — it's just not offered as a switch target
  // from a reviewed locale.
  const displayedLanguages = isReviewedLocale(currentLocale)
    ? languages
    : [...languages, ...allLanguages.filter((lang) => lang.code === currentLocale)];

  const handleChange = (code: string) => {
    if (!isAppLocale(code)) return;
    setLocaleCookie(code);
    if (isPrefixedPath) {
      const target =
        pathnameWithoutLocale === '/' ? withLocalePrefix('/', code) : withLocalePrefix(pathnameWithoutLocale, code);
      const search = (typeof window !== 'undefined' && window.location.search) || '';
      // Full page load, not router.replace: /es/login and /en/login share the
      // same layouts, so a client navigation kept the Spanish messages and the
      // page stayed in Spanish after picking English (ops 10/14/26).
      window.location.assign(`${target}${search}`);
    } else {
      // Portal paths have no locale prefix — reload so middleware picks up the new cookie
      window.location.reload();
    }
  };

  if (compact) {
    return (
      <div className="language-toggle language-toggle--compact" aria-label={tCommon('selectLanguage')}>
        {displayedLanguages.map((lang, index) => (
          <span key={lang.code} className="language-toggle__item">
            {lang.code === currentLocale ? (
              <span className="language-toggle__current">{lang.label}</span>
            ) : (
              <button
                type="button"
                onClick={() => handleChange(lang.code)}
                className="language-toggle__link"
                suppressHydrationWarning
              >
                {lang.label}
              </button>
            )}
            {index < displayedLanguages.length - 1 && (
              <span className="language-toggle__sep" aria-hidden="true">·</span>
            )}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="language-toggle">
      <Globe size={16} aria-hidden className="language-toggle-icon" />
      <select
        value={currentLocale}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={tCommon('selectLanguage')}
        className="language-toggle-select"
        suppressHydrationWarning
      >
        {displayedLanguages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
