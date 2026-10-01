'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { FileInput } from '@astryxdesign/core/FileInput';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { StatusTag } from '@/components/portal/kit/StatusTag';
import { useAnnounce } from '@/components/portal/kit/hooks/useAnnounce';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { agreementRequestError, requireAgreementResponse } from './request';
import {
  ENROLLMENT_TEMPLATE_VERSION, MAX_UPLOAD_BYTES, ENROLLMENT_REVIEW_NOTE_MAX,
  type EnrollmentAgreementSummary, type EnrollmentAgreementCoverageStatus,
} from '@/lib/enrollmentAgreements/types';
import styles from './enrollment.module.css';

export const AGREEMENT_TONES = { missing: 'muted', pending: 'warn', verified: 'ok', needs_correction: 'alert' } as const;

export function AgreementStatus({ status }: { status: EnrollmentAgreementCoverageStatus }) {
  const t = useTranslations('enrollmentAgreement');
  return <StatusTag tone={AGREEMENT_TONES[status]}>{t(`status.${status}`)}</StatusTag>;
}

/** Remount on subject changes so no old file, review, or response crosses records. */
export default function EnrollmentAgreementCard({ memberId }: { memberId?: string }) {
  return <AgreementCardForMember key={memberId ?? 'self'} memberId={memberId} />;
}

function AgreementCardForMember({ memberId }: { memberId?: string }) {
  const t = useTranslations('enrollmentAgreement');
  const locale = useLocale();
  const headingId = useId();
  const announce = useAnnounce();
  const [summary, setSummary] = useState<EnrollmentAgreementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previous, setPrevious] = useState(false);
  const [attested, setAttested] = useState(false);
  const [note, setNote] = useState('');
  const lock = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const endpoint = '/api/enrollment-agreements' + (memberId ? `?memberId=${encodeURIComponent(memberId)}` : '');

  const reload = useCallback(async (signal: AbortSignal) => {
    const response = await fetchWithTimeout(endpoint, { signal, cache: 'no-store' });
    await requireAgreementResponse(response);
    const data: EnrollmentAgreementSummary = await response.json();
    if (!signal.aborted) {
      setSummary(data);
      setAttested(false);
      setNote('');
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    reload(controller.signal).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(agreementRequestError(err));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const showError = (message: string) => { setError(message); announce(message, 'assertive'); };
  const retry = async () => {
    if (lock.current || !lifetime.current) return;
    lock.current = true; setLoading(true); setError(''); setNotice('');
    const signal = lifetime.current.signal;
    try { await reload(signal); }
    catch (err) { if (!signal.aborted) showError(agreementRequestError(err)); }
    finally { if (!signal.aborted) { lock.current = false; setLoading(false); } }
  };

  const mutate = async (url: string, init: RequestInit, success: string) => {
    if (lock.current || !lifetime.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const signal = lifetime.current.signal;
    try {
      const response = await fetchWithTimeout(url, { ...init, signal }, 60_000);
      await requireAgreementResponse(response);
      if (signal.aborted) return;
      setFile(null);
      // Drop the old status before refresh; a failed read must not advertise stale verification.
      setSummary(null);
      await reload(signal);
      if (!signal.aborted) { setNotice(success); announce(success); }
    } catch (err) {
      if (!signal.aborted) showError(agreementRequestError(err));
    } finally {
      if (!signal.aborted) { lock.current = false; setBusy(false); }
    }
  };

  const upload = async () => {
    if (!file || file.size === 0 || file.size > MAX_UPLOAD_BYTES || !/\.pdf$/i.test(file.name)) {
      showError(t('invalidFile')); return;
    }
    const body = new FormData();
    body.append('file', file);
    if (memberId) body.append('memberId', memberId);
    body.append('templateVersion', previous ? 'previous' : ENROLLMENT_TEMPLATE_VERSION);
    await mutate('/api/enrollment-agreements', { method: 'POST', body }, t('uploaded'));
  };
  const current = summary?.submissions.find((s) => s.isCurrent);
  const review = async (action: 'verify' | 'request_correction') => {
    if (!current || !summary?.canReview) return;
    if ((action === 'verify' && !attested) || (action === 'request_correction' && !note.trim()) || note.length > ENROLLMENT_REVIEW_NOTE_MAX) {
      showError(t('reviewRequired')); return;
    }
    await mutate(`/api/enrollment-agreements/${encodeURIComponent(current.id)}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reviewNote: note.trim(), attestSignatures: attested }),
    }, t('reviewSaved'));
  };

  return (
    <section className={`wa-kit-card ${styles.card}`} aria-labelledby={headingId} aria-busy={loading || busy} data-testid="enrollment-agreement">
      <div className={styles.row}>
        <h2 id={headingId} className={styles.title}>{t('title')}</h2>
        {summary && <AgreementStatus status={summary.status} />}
      </div>
      <p>{t('intro')}</p>
      {loading && <p>{t('loading')}</p>}
      {error && <div className={styles.error} role="alert"><p>{error}</p><Button label={t('retry')} onClick={retry} isDisabled={loading || busy} /></div>}
      {notice && <p className={styles.notice}>{notice}</p>}
      {summary && <>
        <p>{t(`explanation.${summary.status}`)}</p>
        <a className={`wa-kit-focus ${styles.link}`} href={summary.templateUrl} download>{t('downloadTemplate')}</a>
        <p className={styles.muted}>{t('instructions')}</p>
        <p className={styles.muted}>{t('privacy')}</p>
        {current && <div className={styles.current}>
          <a className={`wa-kit-focus ${styles.link}`} href={current.downloadUrl} download>{t('downloadCurrent')}</a>
          {current.reviewNote && <p className={styles.note}>{t('reviewNote')}: {current.reviewNote}</p>}
        </div>}
        {summary.canUpload && <form className={styles.stack} onSubmit={(event) => { event.preventDefault(); void upload(); }}>
          <h3 className={styles.subtitle}>{t(current ? 'replaceTitle' : 'uploadTitle')}</h3>
          <FileInput label={t('fileLabel')} value={file} onChange={(value) => setFile(Array.isArray(value) ? value[0] ?? null : value)}
            accept=".pdf,application/pdf" maxSize={MAX_UPLOAD_BYTES} mode="dropzone" description={t('fileHelp')} isDisabled={busy} />
          <CheckboxInput label={t('previous')} value={previous} onChange={setPrevious} isDisabled={busy} />
          <p className={styles.muted}>{t('preserveHistory')}</p>
          <Button label={t('upload')} variant="primary" type="submit" isLoading={busy} isDisabled={!file || loading} />
        </form>}
        {summary.canReview && current?.status === 'pending' && <div className={styles.stack}>
          <h3 className={styles.subtitle}>{t('reviewTitle')}</h3>
          <p>{t('reviewInstructions')}</p>
          <CheckboxInput label={t('attest')} value={attested} onChange={setAttested} isDisabled={busy} />
          <TextArea label={t('reviewNote')} value={note} onChange={setNote} maxLength={ENROLLMENT_REVIEW_NOTE_MAX}
            description={t('noteHelp')} isDisabled={busy} />
          <div className={styles.row}>
            <Button label={t('verify')} onClick={() => void review('verify')} isDisabled={busy || !attested || note.length > ENROLLMENT_REVIEW_NOTE_MAX} />
            <Button label={t('correction')} onClick={() => void review('request_correction')} isDisabled={busy || !note.trim() || note.length > ENROLLMENT_REVIEW_NOTE_MAX} />
          </div>
        </div>}
        {summary.submissions.length > 0 && <details>
          <summary className={`wa-kit-focus ${styles.disclosure}`}>{t('history')}</summary>
          <p className={styles.muted}>{t('historyHelp')}</p>
          <ul className={styles.history}>
            {summary.submissions.map((submission) => <li key={submission.id} className={styles.historyRow}>
              <div className={styles.row}><AgreementStatus status={submission.status} /><span>{t(submission.isCurrent ? 'current' : 'superseded')}</span></div>
              <p className={styles.muted}>{t('version')}: {submission.templateVersion === 'previous' ? t('previousShort') : submission.templateVersion}</p>
              <time dateTime={submission.uploadedAt}>{new Date(submission.uploadedAt).toLocaleString(locale)}</time>
              <a className={`wa-kit-focus ${styles.link}`} href={submission.downloadUrl} download>{t('downloadRevision')}</a>
            </li>)}
          </ul>
        </details>}
      </>}
    </section>
  );
}
