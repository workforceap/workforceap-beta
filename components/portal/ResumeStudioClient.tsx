'use client';

import { cloneElement, useCallback, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, FilePen, FileText, Gauge, Headset } from 'lucide-react';
import ResumeStrengthForm from '@/components/portal/tools/ResumeStrengthForm';
import ResumeRewriterForm from '@/components/portal/tools/ResumeRewriterForm';
import ResumeRewriterClient from '@/app/(portal)/dashboard/ai-tools/resume-rewriter/ResumeRewriterClient';
import type { ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';
import { useListFocus } from '@/components/portal/kit/hooks/useListFocus';
import { ResumeDraftProvider, ResumeDraftStatus } from './ResumeDraftContinuity';
import { PREVIEW_RESUME_DRAFT_OWNER } from '@/lib/resume/studioDraft';
import styles from './ResumeStudio.module.css';
import { ResumeLoadNotice } from './ResumeLoadNotice';
import type { MemberResumeLoadStatus } from '@/lib/member/getMemberResumePlainText';

const ResumeCoachWorkspace = dynamic(() => import('@/components/portal/ResumeCoachWorkspace'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className={`wa-kit-card ${styles.coachLoading}`}
    >
      Loading coach…
    </div>
  ),
});

export type ResumeStudioView = 'files' | 'score' | 'rewrite' | 'coach';

const VIEWS: { id: ResumeStudioView; Icon: typeof Gauge }[] = [
  { id: 'score', Icon: Gauge },
  { id: 'rewrite', Icon: FilePen },
  { id: 'coach', Icon: Headset },
];

export function normalizeStudioView(value: string | undefined, hasFiles = false): ResumeStudioView {
  if (value === 'score' || value === 'rewrite' || value === 'coach') return value;
  return hasFiles ? 'files' : 'score';
}

type Props = {
  hasResume: boolean;
  loadStatus?: MemberResumeLoadStatus;
  /** The existing file manager, mounted once and retained while changing views. */
  filesSlot?: ReactElement<{ active?: boolean; onResumeAvailabilityChange?: (available: boolean) => void }>;
  scoreHistorySlot?: ReactNode;
  rewriteHistorySlot?: ReactNode;
  /** Legacy view-switch base; tab changes preserve the current browser pathname. */
  basePath?: string;
  preview?: boolean;
  draftOwnerToken?: string;
  initialResume?: string;
  initialRewriteResume?: string;
  initialJobTarget?: string;
  previewScoreOutput?: string;
  previewScorePayload?: ResumeScorePayload | null;
  previewRewriteOutput?: string;
};

export default function ResumeStudioClient(props: Props) {
  const ownerToken = props.preview ? PREVIEW_RESUME_DRAFT_OWNER : props.draftOwnerToken;
  return <ResumeDraftProvider key={ownerToken ?? 'unscoped'} ownerToken={ownerToken}><ResumeStudioContent {...props} /></ResumeDraftProvider>;
}

function ResumeStudioContent({
  hasResume,
  loadStatus,
  filesSlot,
  scoreHistorySlot,
  rewriteHistorySlot,
  preview = false,
  initialResume,
  initialRewriteResume,
  initialJobTarget,
  previewScoreOutput,
  previewScorePayload,
  previewRewriteOutput,
}: Props) {
  const t = useTranslations('resumeStudio');
  const tw = useTranslations('memberWorkspace.resume');
  const searchParams = useSearchParams();
  const hasFiles = !!filesSlot;
  const [resumeStatus, setResumeStatus] = useState<MemberResumeLoadStatus>(loadStatus ?? (hasResume ? 'available' : 'absent'));
  const onFilesAvailabilityChange = filesSlot?.props.onResumeAvailabilityChange;
  const updateResumeAvailability = useCallback((available: boolean) => {
    setResumeStatus(available ? 'available' : 'absent');
    onFilesAvailabilityChange?.(available);
  }, [onFilesAvailabilityChange]);
  useEffect(() => { setResumeStatus(loadStatus ?? (hasResume ? 'available' : 'absent')); }, [hasResume, loadStatus]);
  const view = normalizeStudioView(searchParams?.get('view') ?? undefined, hasFiles);
  const [visited, setVisited] = useState<ResumeStudioView[]>([view]);
  const id = useId();
  const { containerRef, onKeyDown } = useListFocus<HTMLDivElement>({ orientation: 'horizontal' });
  const views = filesSlot ? [{ id: 'files' as const, Icon: FileText }, ...VIEWS] : VIEWS;
  useEffect(() => {
    setVisited(current => current.includes(view) ? current : [...current, view]);
  }, [view]);

  const setView = useCallback(
    (next: ResumeStudioView) => {
      const url = new URL(window.location.href);
      if (normalizeStudioView(url.searchParams.get('view') ?? undefined, hasFiles) === next) return;
      url.searchParams.set('view', next);
      // Next integrates native history with useSearchParams. This is a local
      // panel change: retain locale/context and drafts without an RSC navigation.
      // The URL guard also combines pointer focus + click into one history entry.
      window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
      setVisited(current => current.includes(next) ? current : [...current, next]);
    },
    [hasFiles],
  );

  return (
    <div className={styles.studio}>
      <div ref={containerRef} onKeyDown={onKeyDown} role="tablist" aria-label={t('viewsLabel')} className={`resume-studio-tabs wa-page-tabs ${styles.tabs}`}>
        {views.map(({ id: viewId, Icon }) => {
          const active = viewId === view;
          const label = viewId === 'files' ? tw('files') : t(`tabs.${viewId}`);
          return (
            <button
              key={viewId}
              type="button"
              role="tab"
              id={`${id}-tab-${viewId}`}
              aria-controls={`${id}-panel-${viewId}`}
              aria-describedby={`${id}-hint-${viewId}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-kit-list-item
              aria-label={label}
              onClick={() => setView(viewId)}
              onFocus={() => { if (!active) setView(viewId); }}
              className={`wa-kit-focus ${styles.tab}`}
            >
              <span className={styles.tabIcon}><Icon size={20} aria-hidden="true" /></span>
              <span className={styles.tabCopy}>
                <span className={styles.tabLabel}>{label}</span>
                <span id={`${id}-hint-${viewId}`} className={styles.tabHint}>{tw(`design.${viewId}Hint`)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {view === 'score' || view === 'rewrite' ? <ResumeDraftStatus /> : null}
      <ResumeLoadNotice status={resumeStatus} />

      {filesSlot ? (
        <section id={`${id}-panel-files`} role="tabpanel" aria-labelledby={`${id}-tab-files`} hidden={view !== 'files'} className={styles.filesPanel}>
          <div className={styles.filesHeading}>
            <h2>{tw('design.filesTitle')}</h2>
            <p>{tw('design.filesIntro')}</p>
          </div>
          {view === 'files' || visited.includes('files') ? cloneElement(filesSlot, { active: view === 'files', onResumeAvailabilityChange: updateResumeAvailability }) : null}
        </section>
      ) : null}

      <section id={`${id}-panel-score`} role="tabpanel" aria-labelledby={`${id}-tab-score`} hidden={view !== 'score'}>
      {view === 'score' || visited.includes('score') ? (
        <div className={`wa-kit-card ${styles.toolPanel}`}>
          <p className={styles.sourceNote}>{tw('scoreSource')}</p>
          {resumeStatus === 'absent' ? (
            <p className={styles.fileStatus}>{t('emptyTitle')}</p>
          ) : null}

          <div className={styles.editor}>
            <ResumeStrengthForm
              preview={preview}
              initialResume={initialResume}
              previewOutput={previewScoreOutput}
              previewPayload={previewScorePayload}
            />
          </div>

          <div className={styles.nextSteps}>
            <div className={styles.nextActions}>
              <button
                type="button"
                className={`wa-kit-cta wa-kit-focus ${styles.action}`}
                onClick={() => setView('rewrite')}
              >
                <FilePen size={16} aria-hidden="true" />
                {t('ctaRewrite')}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`wa-kit-cta wa-kit-cta--ghost wa-kit-focus ${styles.action}`}
                onClick={() => setView('coach')}
              >
                <Headset size={16} aria-hidden="true" />
                {t('ctaCoach')}
              </button>
            </div>
          </div>

          {!preview ? scoreHistorySlot : null}
        </div>
      ) : null}
      </section>

      <section id={`${id}-panel-rewrite`} role="tabpanel" aria-labelledby={`${id}-tab-rewrite`} hidden={view !== 'rewrite'}>
      {view === 'rewrite' || visited.includes('rewrite') ? (
        <div className={`wa-kit-card ${styles.toolPanel}`}>
          <p className={styles.sourceNote}>{tw('rewriteSource')}</p>
          <div className={styles.editor}>
            {preview ? (
              <ResumeRewriterForm
                preview
                initialResume={initialRewriteResume ?? initialResume}
                initialJobTarget={initialJobTarget}
                previewOutput={previewRewriteOutput}
              />
            ) : (
              <ResumeRewriterClient />
            )}
          </div>
          {!preview ? rewriteHistorySlot : null}
        </div>
      ) : null}
      </section>

      <section id={`${id}-panel-coach`} role="tabpanel" aria-labelledby={`${id}-tab-coach`} hidden={view !== 'coach'}>
      {view === 'coach' ? (
        preview ? (
          <div className={`wa-kit-card ${styles.coachPreview}`}>
            <span className={styles.coachIcon}><Headset size={32} aria-hidden="true" /></span>
            <h2>{tw('design.coachTitle')}</h2>
            <p>{tw('design.coachIntro')}</p>
            <p className={styles.coachAvailability}>{tw('design.coachAvailability')}</p>
          </div>
        ) : (
          <ResumeCoachWorkspace />
        )
      ) : null}
      </section>
    </div>
  );
}
