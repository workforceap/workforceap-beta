'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import LocalizedLink from '@/components/LocalizedLink';

export default function ApplyStatusClient() {
  const t = useTranslations('apply');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ found: boolean; message: string; email: string } | null>(null);

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
      const data = (await r.json()) as { error?: string; found?: boolean; message?: string };
      if (!r.ok) {
        setError(data.error ?? t('statusErrorGeneric'));
        return;
      }
      if (typeof data.found === 'boolean' && data.message) {
        setResult({ found: data.found, message: data.message, email: email.trim() });
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
        {t('statusLead')}
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
        <div
          className={`apply-status-result${result.found ? ' apply-status-result--found' : ''}`}
          role="status"
        >
          {result.found ? (
            <p style={{ margin: 0 }}>{result.message}</p>
          ) : (
            <>
              <p style={{ margin: 0, fontWeight: 600 }}>{t('statusNotFoundTitle', { email: result.email })}</p>
              <p style={{ margin: '0.5rem 0 0' }}>{t('statusNotFoundBody')}</p>
              <p style={{ margin: '0.5rem 0 0' }}>
                {t('statusNotFoundContactBefore')}{' '}
                <LocalizedLink href="/contact">{t('statusNotFoundContactLink')}</LocalizedLink>{' '}
                {t('statusNotFoundContactAfter')}
              </p>
            </>
          )}
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
