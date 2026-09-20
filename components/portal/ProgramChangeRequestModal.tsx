'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Program } from '@/lib/content/programs';
import { useFocusTrap } from '@/hooks/useFocusTrap';

type Props = {
  currentProgram: Program | null;
  programs: Program[];
  hasPendingRequest: boolean;
};

type ComparisonTrack = {
  slug: string;
  shortName: string;
  duration: string;
  difficulty: string;
  demand: 'High' | 'Very High';
  certs: string;
};

export default function ProgramChangeRequestModal({ currentProgram, programs, hasPendingRequest }: Props) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [requestedSlug, setRequestedSlug] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [comparisonBySlug, setComparisonBySlug] = useState<Record<string, ComparisonTrack> | null>(null);

  const titleId = useId();
  const trapRef = useFocusTrap(open, () => setOpen(false));

  // Fetch the maintained comparison dataset (duration/difficulty/demand/certs)
  // once, the first time the modal opens — lets members see how the
  // program they're requesting compares before they submit.
  useEffect(() => {
    if (!open || comparisonBySlug) return;
    let cancelled = false;
    fetch('/api/member/program-comparison')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tracks?: ComparisonTrack[] } | null) => {
        if (cancelled || !data?.tracks) return;
        setComparisonBySlug(Object.fromEntries(data.tracks.map((track) => [track.slug, track])));
      })
      .catch(() => {
        /* comparison panel is a nice-to-have; the form still works without it */
      });
    return () => {
      cancelled = true;
    };
  }, [open, comparisonBySlug]);

  const requestedComparison = requestedSlug ? comparisonBySlug?.[requestedSlug] : undefined;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!requestedSlug) {
      setError(t('programChangeErrorSelectProgram'));
      return;
    }
    if (reason.trim().length < 10) {
      setError(t('programChangeErrorReasonLength'));
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/member/program-change-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestedProgramSlug: requestedSlug, reason: reason.trim() }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(payload?.error || t('programChangeErrorSubmitFailed', { status: res.status }));
          return;
        }
        setSuccess(true);
        router.refresh();
      } catch {
        setError(t('programChangeErrorNetwork'));
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setOpen(false);
    setSuccess(false);
    setError(null);
    setRequestedSlug('');
    setReason('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-outline btn-small"
        disabled={hasPendingRequest}
      >
        {hasPendingRequest ? t('programChangePendingButton') : t('programChangeRequestButton')}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            ref={trapRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            style={{
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
              borderRadius: '0.75rem',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              border: '1px solid var(--outline-variant)',
            }}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id={titleId} style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                {t('programChangeModalTitle')}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                aria-label={t('programChangeCloseAria')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  color: 'var(--color-on-surface-variant)',
                  lineHeight: 1,
                  minWidth: 44,
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '0.5rem',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem' }}>
              {success ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{t('programChangeSuccessTitle')}</p>
                  <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
                    {t('programChangeSuccessBody')}
                  </p>
                  <div style={{ marginTop: '0.75rem' }}>
                    <button type="button" className="btn btn-primary" onClick={handleClose}>
                      {t('programChangeCloseButton')}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
                  {currentProgram && (
                    <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: 'var(--surface-container-low)', border: '1px solid var(--outline-variant)', fontSize: '0.9rem' }}>
                      <span style={{ fontWeight: 600 }}>{t('programChangeCurrentLabel')}</span>{' '}
                      {currentProgram.title}
                    </div>
                  )}

                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('programChangeSelectLabel')}</span>
                    <select
                      value={requestedSlug}
                      onChange={(e) => setRequestedSlug(e.target.value)}
                      disabled={isPending}
                      required
                      style={{
                        padding: '0.65rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--outline-variant)',
                        background: 'var(--surface-container)',
                        color: 'var(--color-on-surface)',
                        fontSize: '0.95rem',
                      }}
                    >
                      <option value="">{t('programChangeSelectPlaceholder')}</option>
                      {programs.map((p) => (
                        <option key={p.slug} value={p.slug}>{p.title}</option>
                      ))}
                    </select>
                  </label>

                  {requestedComparison && (
                    <div
                      style={{
                        display: 'grid',
                        gap: '0.4rem',
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        background: 'var(--surface-container-low)',
                        border: '1px solid var(--outline-variant)',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{t('programChangeCompareTitle', { program: requestedComparison.shortName })}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.25rem', color: 'var(--color-on-surface-variant)' }}>
                        <span>{t('programChangeCompareDuration')}: <strong style={{ color: 'var(--color-on-surface)' }}>{requestedComparison.duration}</strong></span>
                        <span>{t('programChangeCompareDemand')}: <strong style={{ color: 'var(--color-on-surface)' }}>{requestedComparison.demand}</strong></span>
                        <span>{t('programChangeCompareCerts')}: <strong style={{ color: 'var(--color-on-surface)' }}>{requestedComparison.certs}</strong></span>
                      </div>
                    </div>
                  )}

                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('programChangeReasonLabel')}</span>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={isPending}
                      required
                      rows={5}
                      minLength={10}
                      maxLength={8000}
                      placeholder={t('programChangeReasonPlaceholder')}
                      style={{
                        padding: '0.65rem 0.75rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--outline-variant)',
                        background: 'var(--surface-container)',
                        color: 'var(--color-on-surface)',
                        fontSize: '0.95rem',
                        resize: 'vertical',
                        minHeight: '6rem',
                      }}
                    />
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      {reason.trim().length} / 10 {t('programChangeMinimumChars')}
                    </span>
                  </label>

                  {error ? (
                    <p
                      role="alert"
                      style={{
                        margin: 0,
                        padding: '0.6rem 0.75rem',
                        borderRadius: '0.5rem',
                        background: 'var(--color-error-container, rgba(220, 38, 38, 0.12))',
                        border: '1px solid var(--color-error)',
                        color: 'var(--color-error)',
                        fontSize: '0.9rem',
                      }}
                    >
                      {error}
                    </p>
                  ) : null}

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleClose}
                      disabled={isPending}
                    >
                      {t('programChangeCancelButton')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isPending}
                    >
                      {isPending ? t('programChangeSubmitting') : t('programChangeSubmitButton')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
