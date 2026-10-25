'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, FilePen, Check } from 'lucide-react';
import {
  readStudioDraft, parseStudioDraft, studioDraftKey, STUDIO_DRAFT_CHANGED_EVENT, STUDIO_DRAFT_SESSION_ENDED_EVENT,
  type ScoreDraft, type RewriteDraft, type StudioDraft, type StudioDraftView,
} from '@/lib/resume/studioDraft';
import styles from './ResumeStudio.module.css';

type DraftContextValue = {
  ready: boolean;
  restored: StudioDraft | null;
  saved: StudioDraft | null;
  status: 'ready' | 'saved' | 'restored' | 'unavailable' | 'cleared';
  save: (view: StudioDraftView, values: ScoreDraft | RewriteDraft) => void;
  clear: () => void;
  getWriteEpoch: () => number;
  canApplyAsyncWrite: (epoch: number) => boolean;
};
const DraftContext = createContext<DraftContextValue | null>(null);

/** Input-only recovery. No uploaded file, generated result, or provider record is changed. */
export function ResumeDraftProvider({ ownerToken, children }: { ownerToken?: string; children: ReactNode }) {
  const [ready, setReady] = useState(!ownerToken);
  const [restored, setRestored] = useState<StudioDraft | null>(null);
  const [saved, setSaved] = useState<StudioDraft | null>(null);
  const [status, setStatus] = useState<DraftContextValue['status']>('ready');
  const current = useRef<StudioDraft | null>(null);
  const active = useRef(false);
  const writeEpoch = useRef(0);
  const getWriteEpoch = useCallback(() => writeEpoch.current, []);
  const canApplyAsyncWrite = useCallback((epoch: number) => active.current && epoch === writeEpoch.current, []);

  useEffect(() => {
    if (!ownerToken) return;
    active.current = true;
    const endSession = () => {
      active.current = false;
      writeEpoch.current += 1;
      current.current = null;
      setRestored(null);
      setSaved(null);
      setStatus('cleared');
    };
    window.addEventListener(STUDIO_DRAFT_SESSION_ENDED_EVENT, endSession);
    try {
      const draft = readStudioDraft(sessionStorage, ownerToken);
      current.current = draft;
      setRestored(draft);
      setSaved(draft);
      if (draft) setStatus('restored');
    } catch {
      setStatus('unavailable');
    } finally {
      setReady(true);
    }
    return () => {
      active.current = false;
      writeEpoch.current += 1;
      window.removeEventListener(STUDIO_DRAFT_SESSION_ENDED_EVENT, endSession);
    };
  }, [ownerToken]);

  const save = useCallback((view: StudioDraftView, values: ScoreDraft | RewriteDraft) => {
    if (!ownerToken || !ready || !active.current) return;
    try {
      const next = { ...current.current, version: 1 as const, ownerToken, savedAt: Date.now(), lastView: view, [view]: values };
      const raw = JSON.stringify(next);
      const valid = parseStudioDraft(raw, ownerToken);
      if (!valid) throw new Error('Draft exceeds safe input limits');
      sessionStorage.setItem(studioDraftKey(ownerToken), raw);
      current.current = valid;
      setSaved(valid);
      setStatus('saved');
      window.dispatchEvent(new Event(STUDIO_DRAFT_CHANGED_EVENT));
    } catch {
      setStatus('unavailable');
    }
  }, [ownerToken, ready]);

  const clear = useCallback(() => {
    if (!ownerToken) return;
    writeEpoch.current += 1;
    try {
      sessionStorage.removeItem(studioDraftKey(ownerToken));
      current.current = null;
      setRestored(null);
      setSaved(null);
      setStatus('cleared');
      window.dispatchEvent(new Event(STUDIO_DRAFT_CHANGED_EVENT));
    } catch {
      setStatus('unavailable');
    }
  }, [ownerToken]);

  return <DraftContext.Provider value={ownerToken ? { ready, restored, saved, status, save, clear, getWriteEpoch, canApplyAsyncWrite } : null}>{children}</DraftContext.Provider>;
}

export function useResumeStudioDraft() { return useContext(DraftContext); }

export function ResumeDraftStatus() {
  const draft = useResumeStudioDraft();
  const t = useTranslations('memberWorkspace.resume.design');
  const locale = useLocale();
  if (!draft) return <p className={styles.draftNotice}>{t('draftNotice')}</p>;
  const state = !draft.ready ? 'loading' : draft.status;
  return <div className={styles.draftStatus}>
    <div>
      <p role="status" className={styles.draftStatusTitle}>
        {draft.status === 'saved' || draft.status === 'restored' ? <Check size={16} aria-hidden="true" /> : null}
        {t(`draft.${state}`)}
        {draft.saved && draft.status !== 'unavailable' ? <time dateTime={new Date(draft.saved.savedAt).toISOString()}>{new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(draft.saved.savedAt)}</time> : null}
      </p>
      <p className={styles.draftNotice}>{t('draft.limits')}</p>
    </div>
    {draft.saved ? <button type="button" onClick={draft.clear} className={`wa-kit-focus ${styles.clearDraft}`}>{t('draft.clear')}</button> : null}
  </div>;
}

/** Content-free Home continuation: only time and destination leave the editor. */
export function ResumeDraftReturnAction({ ownerToken, resumeHref, fallback = null }: {
  ownerToken: string;
  resumeHref: string;
  fallback?: ReactNode;
}) {
  const [draft, setDraft] = useState<Pick<StudioDraft, 'savedAt' | 'lastView'> | null>(null);
  const t = useTranslations('memberWorkspace.resume.design');
  const locale = useLocale();
  useEffect(() => {
    const refresh = () => {
      try {
        const value = readStudioDraft(sessionStorage, ownerToken);
        setDraft(value ? { savedAt: value.savedAt, lastView: value.lastView } : null);
      } catch { setDraft(null); }
    };
    refresh();
    window.addEventListener(STUDIO_DRAFT_CHANGED_EVENT, refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    const expiryCheck = window.setInterval(refresh, 60_000);
    return () => {
      window.clearInterval(expiryCheck);
      window.removeEventListener(STUDIO_DRAFT_CHANGED_EVENT, refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [ownerToken]);
  if (!draft) return <>{fallback}</>;
  const [pathAndQuery, hash] = resumeHref.split('#');
  const [path, query] = pathAndQuery.split('?');
  const params = new URLSearchParams(query);
  params.set('view', draft.lastView);
  return <div className={styles.returnDraft}>
    <FilePen size={20} aria-hidden="true" />
    <div>
      <p className={styles.draftStatusTitle}>{t('draft.returnTitle')}</p>
      <p className={styles.draftNotice}>{t('draft.returnDescription', { time: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(draft.savedAt) })}</p>
    </div>
    <Link className={`wa-kit-cta wa-kit-cta--ghost wa-kit-focus ${styles.returnDraftLink}`} href={`${path}?${params.toString()}${hash ? `#${hash}` : ''}`}>{t('draft.continue')}<ArrowRight size={16} aria-hidden="true" /></Link>
  </div>;
}
