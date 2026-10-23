'use client';

import { cloneElement, useCallback, useEffect, useId, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FilePen, FileText, Gauge, Headset } from 'lucide-react';
import ResumeStrengthForm from '@/components/portal/tools/ResumeStrengthForm';
import ResumeRewriterForm from '@/components/portal/tools/ResumeRewriterForm';
import ResumeRewriterClient from '@/app/(portal)/dashboard/ai-tools/resume-rewriter/ResumeRewriterClient';
import type { ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';
import { useListFocus } from '@/components/portal/kit/hooks/useListFocus';
import { resumeWorkspaceHref } from '@/lib/member/memberWorkspace';
import styles from './MemberWorkspace.module.css';

const ResumeCoachWorkspace = dynamic(() => import('@/components/portal/ResumeCoachWorkspace'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="wa-kit-card"
      style={{
        minHeight: 240,
        padding: 24,
        textAlign: 'center',
        color: 'var(--wa-muted)',
        fontSize: 14,
        fontWeight: 600,
      }}
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

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnSolid: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '10px 16px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  border: '1px solid var(--wa-accent)',
  fontWeight: 600,
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  cursor: 'pointer',
};

const kitBtnOutline: CSSProperties = {
  ...kitBtnSolid,
  background: 'transparent',
  color: 'var(--wa-accent-text)',
  border: '1px solid var(--wa-control-border)',
};

type Props = {
  hasResume: boolean;
  /** The existing file manager, mounted once and retained while changing views. */
  filesSlot?: ReactElement<{ active?: boolean }>;
  scoreHistorySlot?: ReactNode;
  rewriteHistorySlot?: ReactNode;
  /** View-switch base. Proofs use `/dev/member/resume-studio`. */
  basePath?: string;
  preview?: boolean;
  initialResume?: string;
  initialJobTarget?: string;
  previewScoreOutput?: string;
  previewScorePayload?: ResumeScorePayload | null;
  previewRewriteOutput?: string;
};

export default function ResumeStudioClient({
  hasResume,
  filesSlot,
  scoreHistorySlot,
  rewriteHistorySlot,
  basePath = '/dashboard/ai-tools/resume-studio',
  preview = false,
  initialResume,
  initialJobTarget,
  previewScoreOutput,
  previewScorePayload,
  previewRewriteOutput,
}: Props) {
  const t = useTranslations('resumeStudio');
  const tw = useTranslations('memberWorkspace.resume');
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = normalizeStudioView(searchParams?.get('view') ?? undefined, !!filesSlot);
  const [visited, setVisited] = useState<ResumeStudioView[]>([view]);
  const id = useId();
  const { containerRef, onKeyDown } = useListFocus<HTMLDivElement>({ orientation: 'horizontal' });
  const views = filesSlot ? [{ id: 'files' as const, Icon: FileText }, ...VIEWS] : VIEWS;
  useEffect(() => {
    setVisited(current => current.includes(view) ? current : [...current, view]);
  }, [view]);

  const setView = useCallback(
    (next: ResumeStudioView) => {
      setVisited(current => current.includes(next) ? current : [...current, next]);
      router.replace(resumeWorkspaceHref(next, searchParams?.toString(), basePath), { scroll: false });
    },
    [router, basePath, searchParams],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div ref={containerRef} onKeyDown={onKeyDown} role="tablist" aria-label={t('viewsLabel')} className="resume-studio-tabs wa-page-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-kit-list-item
              aria-label={label}
              onClick={() => setView(viewId)}
              onFocus={() => { if (!active) setView(viewId); }}
              className={KIT_BTN}
              style={active ? kitBtnSolid : kitBtnOutline}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {filesSlot ? (
        <section id={`${id}-panel-files`} role="tabpanel" aria-labelledby={`${id}-tab-files`} hidden={view !== 'files'}>
          {view === 'files' || visited.includes('files') ? cloneElement(filesSlot, { active: view === 'files' }) : null}
        </section>
      ) : null}

      <section id={`${id}-panel-score`} role="tabpanel" aria-labelledby={`${id}-tab-score`} hidden={view !== 'score'}>
      {view === 'score' || visited.includes('score') ? (
        <div className="wa-kit-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className={styles.context}>{tw('scoreSource')}</p>
          {!hasResume ? (
            <div>
              <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--wa-text)' }}>
                {t('emptyTitle')}
              </h2>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--wa-muted)', fontSize: 14, lineHeight: 1.5 }}>
                <li>{t('emptyStep1')}</li>
                <li>{t('emptyStep2')}</li>
                <li>{t('emptyStep3')}</li>
              </ol>
            </div>
          ) : null}

          <ResumeStrengthForm
            preview={preview}
            initialResume={initialResume}
            previewOutput={previewScoreOutput}
            previewPayload={previewScorePayload}
          />

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--wa-text)' }}>
              {t('nextStepsTitle')}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={KIT_BTN}
                style={kitBtnSolid}
                onClick={() => setView('rewrite')}
              >
                <FilePen size={16} aria-hidden="true" />
                {t('ctaRewrite')}
              </button>
              <button
                type="button"
                className={KIT_BTN}
                style={kitBtnOutline}
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
        <div className="wa-kit-card">
          <p className={styles.context}>{tw('rewriteSource')}</p>
          {preview ? (
            <ResumeRewriterForm
              preview
              initialResume={initialResume}
              initialJobTarget={initialJobTarget}
              previewOutput={previewRewriteOutput}
            />
          ) : (
            <ResumeRewriterClient />
          )}
          {!preview ? rewriteHistorySlot : null}
        </div>
      ) : null}
      </section>

      <section id={`${id}-panel-coach`} role="tabpanel" aria-labelledby={`${id}-tab-coach`} hidden={view !== 'coach'}>
      {view === 'coach' ? (
        preview ? (
          <div className="wa-kit-card">
            <p style={{ margin: 0, fontSize: 14, color: 'var(--wa-muted)', lineHeight: 1.5 }}>
              Voice coach runs in a signed-in session.
            </p>
          </div>
        ) : (
          <ResumeCoachWorkspace />
        )
      ) : null}
      </section>
    </div>
  );
}
