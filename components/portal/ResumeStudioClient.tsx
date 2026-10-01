'use client';

import { useCallback, type CSSProperties, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FilePen, Gauge, Headset } from 'lucide-react';
import ResumeStrengthForm from '@/components/portal/tools/ResumeStrengthForm';
import ResumeRewriterForm from '@/components/portal/tools/ResumeRewriterForm';
import ResumeRewriterClient from '@/app/(portal)/dashboard/ai-tools/resume-rewriter/ResumeRewriterClient';
import type { ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';

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

export type ResumeStudioView = 'score' | 'rewrite' | 'coach';

const VIEWS: { id: ResumeStudioView; Icon: typeof Gauge }[] = [
  { id: 'score', Icon: Gauge },
  { id: 'rewrite', Icon: FilePen },
  { id: 'coach', Icon: Headset },
];

export function normalizeStudioView(value: string | undefined): ResumeStudioView {
  return value === 'rewrite' || value === 'coach' ? value : 'score';
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
  fontSize: 14,
  borderRadius: 999,
  cursor: 'pointer',
};

const kitBtnOutline: CSSProperties = {
  ...kitBtnSolid,
  background: 'transparent',
  color: 'var(--wa-accent)',
  border: '1px solid var(--wa-border)',
};

type Props = {
  hasResume: boolean;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = normalizeStudioView(searchParams?.get('view') ?? undefined);

  const setView = useCallback(
    (next: ResumeStudioView) => {
      router.replace(`${basePath}?view=${next}`, { scroll: false });
    },
    [router, basePath],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div role="tablist" aria-label={t('viewsLabel')} className="resume-studio-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {VIEWS.map(({ id, Icon }) => {
          const active = id === view;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={t(`tabs.${id}`)}
              onClick={() => setView(id)}
              className={KIT_BTN}
              style={active ? kitBtnSolid : kitBtnOutline}
            >
              <Icon size={16} aria-hidden="true" />
              {t(`tabs.${id}`)}
            </button>
          );
        })}
      </div>

      {view === 'score' ? (
        <div className="wa-kit-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {view === 'rewrite' ? (
        <div className="wa-kit-card">
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
    </div>
  );
}
