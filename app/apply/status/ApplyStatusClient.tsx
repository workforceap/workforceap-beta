'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import LocalizedLink from '@/components/LocalizedLink';
import { APPLICATION_STATUS_LINK_TTL_MINUTES } from '@/lib/apply/statusLinkConstants';

type LookupResponse = { error?: string; ok?: boolean; expiresInMinutes?: number };

export default function ApplyStatusClient() {
  const t = useTranslations('apply');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; minutes: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const r = await fetch('/api/apply/status-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await r.json()) as LookupResponse;
      if (!r.ok) {
        setError(data.error ?? t('statusErrorGeneric'));
        return;
      }
      if (data.ok === true) {
        setResult({
          email: email.trim(),
          minutes: typeof data.expiresInMinutes === 'number' ? data.expiresInMinutes : APPLICATION_STATUS_LINK_TTL_MINUTES,
        });
      } else {
        setError(t('statusErrorUnexpected'));
      }
    } catch {
      setError(t('statusErrorNetwork'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="apply-status-card">
      <p className="apply-status-lead">
        {t('statusLead', { minutes: APPLICATION_STATUS_LINK_TTL_MINUTES })}
      </p>
      <form onSubmit={handleSubmit} className="apply-status-form">
        <div className="form-group">
          <label htmlFor="apply-status-email">{t('statusEmailLabel')}</label>
          <input
            id="apply-status-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="form-control"
            placeholder={t('statusEmailPlaceholder')}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading} aria-busy={loading}>
          {loading ? t('statusChecking') : t('statusSubmit')}
        </button>
      </form>
      {error ? <p className="apply-status-error" role="alert">{error}</p> : null}
      {result ? (
        <div className="apply-status-result" role="status">
          <p style={{ margin: 0, fontWeight: 600 }}>{t('statusSentTitle')}</p>
          <p style={{ margin: '0.5rem 0 0' }}>
            {t('statusSentBody', { email: result.email, minutes: result.minutes })}
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>{t('statusSentHelp')}</p>
          <p style={{ margin: '0.5rem 0 0' }}>
            {t('statusContactBefore')}{' '}
            <LocalizedLink href="/contact">{t('statusContactLink')}</LocalizedLink>{' '}
            {t('statusContactAfter')}
          </p>
          <p style={{ margin: '0.75rem 0 0.5rem' }}>{t('statusLoginCtaLead')}</p>
          <LocalizedLink href="/login?redirectTo=/dashboard" className="btn btn-primary">
            {t('statusLoginCta')}
          </LocalizedLink>
        </div>
      ) : null}
      <p className="apply-status-footnote">
        {t('statusFootnoteBefore')}{' '}
        <LocalizedLink href="/dashboard">{t('statusFootnoteDashboard')}</LocalizedLink> {t('statusFootnoteAfter')}
      </p>
    </div>
  );
}
