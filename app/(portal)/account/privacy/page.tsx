'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import PageHeader from '@/components/portal/PageHeader';

type StatusMessage = { kind: 'success' | 'error'; text: string };

export default function PrivacySettingsPage() {
  const t = useTranslations('dashboard.privacy');
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [consentLoaded, setConsentLoaded] = useState(false);

  useEffect(() => {
    // Load current consent state
    fetch('/api/gdpr/consent')
      .then((r) => r.json())
      .then((data) => {
        setConsentMarketing(data.consentCommunications ?? false);
        setConsentLoaded(true);
      })
      .catch(() => setConsentLoaded(true));
  }, []);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/gdpr/export');
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workforceap-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ kind: 'success', text: t('exportSuccess') });
    } catch {
      setMessage({ kind: 'error', text: t('exportError') });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    // POST /api/gdpr/delete re-authenticates before it erases anything, so it
    // needs the member's current password as a JSON body. Without it the
    // route answers 400 and this page can only ever show an error.
    const password = deletePassword;
    if (!password) return;
    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/gdpr/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data: { error?: unknown } = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' && data.error ? data.error : t('deleteError'));
      }
      setMessage({ kind: 'success', text: t('deleteSuccess') });
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error && err.message ? err.message : t('deleteError') });
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeletePassword('');
  };

  const updateConsent = async (value: boolean) => {
    // Optimistic move, but this is a consent record: if the server does not
    // accept it we must put the control back to the stored value rather than
    // leave the member believing a preference they never got.
    const previous = consentMarketing;
    setConsentMarketing(value);
    setMessage(null);
    try {
      const res = await fetch('/api/gdpr/consent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentCommunications: value }),
      });
      if (!res.ok) throw new Error('Consent update failed');
      setMessage({ kind: 'success', text: t('consentSuccess') });
    } catch {
      setConsentMarketing(previous);
      setMessage({ kind: 'error', text: t('consentError') });
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 720, margin: '0 auto' }}>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
      />

      {message && (
        <div role={message.kind === 'success' ? 'status' : 'alert'} style={{
          padding: '0.875rem 1rem',
          borderRadius: 'var(--radius-md)',
          background: message.kind === 'success'
            ? 'color-mix(in srgb, var(--color-green) 10%, transparent)'
            : 'color-mix(in srgb, var(--color-error) 10%, transparent)',
          border: `1px solid color-mix(in srgb, ${message.kind === 'success' ? 'var(--color-green)' : 'var(--color-error)'} 20%, transparent)`,
          color: message.kind === 'success' ? 'var(--color-green)' : 'var(--color-error)',
          marginBottom: '1.5rem',
          fontSize: '0.9rem',
          fontWeight: 600,
        }}>
          {message.text}
        </div>
      )}

      {/* Data Export */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{t('exportHeading')}</h2>
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
          {t('exportBody')}
        </p>
        <button type="button"
          className="btn btn-primary"
          onClick={handleExport}
          disabled={exporting}
          style={{
            cursor: exporting ? 'not-allowed' : 'pointer',
            opacity: exporting ? 0.7 : 1,
          }}
        >
          {exporting && (
            <span
              className="material-symbols-outlined"
              aria-hidden
              style={{ fontSize: '1.1rem', animation: 'spin 1s linear infinite' }}
            >
              progress_activity
            </span>
          )}
          {exporting ? t('exportPreparing') : t('exportButton')}
        </button>
      </section>

      {/* Consent Management */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{t('consentHeading')}</h2>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            background: 'var(--surface-container)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--outline-variant)',
            transition: 'border-color 150ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; }}
        >
          <input
            type="checkbox"
            id="consent-marketing"
            checked={consentMarketing}
            onChange={(e) => updateConsent(e.target.checked)}
            disabled={!consentLoaded}
            style={{ width: 20, height: 20, accentColor: 'var(--color-accent)' }}
          />
          <label htmlFor="consent-marketing" style={{ flex: 1, fontSize: '0.9rem', cursor: 'pointer' }}>
            <div style={{ fontWeight: 600 }}>{t('consentLabel')}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.15rem' }}>
              {t('consentDescription')}
            </div>
          </label>
        </div>
      </section>

      {/* Account Deletion */}
      <section>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--color-error)' }}>{t('deleteHeading')}</h2>
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
          {t('deleteBody')}
        </p>

        {!showDeleteConfirm ? (
          <button type="button"
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'transparent',
              color: 'var(--color-error)',
              border: '2px solid var(--color-error)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'background-color 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-error) 8%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {t('deleteButton')}
          </button>
        ) : (
          <div style={{
            padding: '1rem',
            background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid color-mix(in srgb, var(--color-error) 20%, transparent)',
          }}>
            <p style={{ color: 'var(--color-error)', fontWeight: 700, margin: '0 0 0.75rem', fontSize: '0.9rem' }}>
              {t('deleteConfirmPrompt')}
            </p>
            <label htmlFor="delete-account-password" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.35rem' }}>
              {t('deletePasswordLabel')}
            </label>
            <input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              disabled={deleting}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                marginBottom: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container)',
                color: 'var(--color-on-surface)',
                fontSize: '0.9rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button"
                onClick={handleDelete}
                disabled={deleting || deletePassword.length === 0}
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'var(--color-error)',
                  color: 'var(--color-white)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: deleting || deletePassword.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: deleting || deletePassword.length === 0 ? 0.7 : 1,
                  transition: 'background-color 150ms ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
                onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-error) 85%, black)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-error)'; }}
              >
                {deleting && (
                  <span
                    className="material-symbols-outlined"
                    aria-hidden
                    style={{ fontSize: '1.1rem', animation: 'spin 1s linear infinite' }}
                  >
                    progress_activity
                  </span>
                )}
                {deleting ? t('deleteDeleting') : t('deleteConfirmYes')}
              </button>
              <button type="button"
                className="btn btn-muted"
                onClick={cancelDelete}
                disabled={deleting}
              >
                {t('deleteCancel')}
              </button>
            </div>
          </div>
        )}
      </section>

      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--outline-variant)' }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
          {t('questionsContact')} <a href="mailto:privacy@workforceap.org" style={{ color: 'var(--wa-accent-text)' }}>privacy@workforceap.org</a>
        </p>
      </div>
    </div>
  );
}
