'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Mail, MessageSquare } from 'lucide-react';

const KNOWN_LOCALES = ['en', 'es', 'fr', 'pt'] as const;

/**
 * Build the URL to share. On the post-submit confirmation page
 * (`/apply/confirmation`, `/es/apply/confirmation`, …) `window.location.href`
 * points at the confirmation flow itself — recipients of a shared link
 * would land on a page they can't apply from. Always emit the public
 * `/apply` landing page, preserving the current locale segment when one
 * is present in the URL.
 */
function getShareUrl(): string {
  if (typeof window === 'undefined') return 'https://www.workforceap.org/apply';
  const { origin, pathname } = window.location;
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  const localePrefix = (KNOWN_LOCALES as readonly string[]).includes(firstSegment)
    ? `/${firstSegment}`
    : '';
  return `${origin}${localePrefix}/apply`;
}

export default function ShareButtons() {
  const t = useTranslations('apply');
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareUrl());
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const handleEmail = () => {
    window.location.href =
      `mailto:?subject=${encodeURIComponent(t('shareButtonEmailSubject'))}&body=${encodeURIComponent(`${t('shareButtonEmailBody')} ${getShareUrl()}`)}`;
  };

  const handleSms = () => {
    window.location.href =
      `sms:?body=${encodeURIComponent(`${t('shareButtonSmsBody')} ${getShareUrl()}`)}`;
  };

  return (
    <div className="afd-confirm__share-grid">
      <button type="button" onClick={handleCopyLink} className="afd-confirm__share-btn">
        {copied ? (
          <Check className="afd-confirm__share-icon" aria-hidden="true" />
        ) : (
          <Copy className="afd-confirm__share-icon" aria-hidden="true" />
        )}
        <span aria-live="polite" className="afd-confirm__share-caption">
          {copied ? t('shareButtonCopied') : t('shareButtonCopyLink')}
        </span>
      </button>
      <button
        type="button"
        onClick={handleEmail}
        className="afd-confirm__share-btn"
        aria-label={t('shareButtonEmailAria')}
      >
        <Mail className="afd-confirm__share-icon" aria-hidden="true" />
        <span className="afd-confirm__share-caption">{t('shareButtonEmail')}</span>
      </button>
      <button
        type="button"
        onClick={handleSms}
        className="afd-confirm__share-btn"
        aria-label={t('shareButtonSmsAria')}
      >
        <MessageSquare className="afd-confirm__share-icon" aria-hidden="true" />
        <span className="afd-confirm__share-caption">{t('shareButtonSms')}</span>
      </button>
    </div>
  );
}
