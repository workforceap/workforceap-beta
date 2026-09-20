'use client';

import { useTranslations } from 'next-intl';

export type FirstCertProgress = {
  /** 0–100 recorded program training progress; not credential evidence. */
  percent: number;
  /** Human label for the current milestone stage. */
  stageLabel: string;
  /** Whether every validated program course is complete. */
  isComplete: boolean;
  /** Completed course count. */
  stepsComplete: number;
  /** Total steps in the milestone path. */
  stepsTotal: number;
};

type Props = {
  progress: FirstCertProgress;
  /** Optional compact mode for tight spaces (e.g. mobile cards). */
  compact?: boolean;
};

export default function MemberFirstCertProgressBar({ progress, compact }: Props) {
  const t = useTranslations('dashboard');
  const { percent, stageLabel, isComplete, stepsComplete, stepsTotal } = progress;
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      role="region"
      aria-label={t('firstCertProgress')}
      style={{
        padding: compact ? '0.75rem 1rem' : '1rem 1.25rem',
        background: 'var(--surface-container-low)',
        borderRadius: '0.875rem',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
          gap: '0.5rem',
        }}
      >
        <span
          style={{
            fontSize: compact ? '0.8125rem' : '0.875rem',
            fontWeight: 700,
            color: 'var(--color-on-surface)',
            lineHeight: 1.3,
          }}
        >
          {isComplete ? t('firstCertComplete') : t('firstCertInProgress')}
        </span>
        <span
          style={{
            fontSize: compact ? '0.8125rem' : '0.875rem',
            fontWeight: 800,
            color: isComplete ? 'var(--color-green)' : 'var(--color-accent)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {clamped}%
        </span>
      </div>

      {/* Progress track */}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('firstCertProgressBarLabel', { percent: clamped })}
        style={{
          width: '100%',
          height: compact ? '0.5rem' : '0.625rem',
          background: 'var(--surface-container-high, rgba(0,0,0,0.06))',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            background: isComplete
              ? 'var(--color-green)'
              : 'var(--color-accent)',
            borderRadius: '999px',
            transition: 'width 0.6s ease-out',
          }}
        />
      </div>

      {/* Meta line: stage + steps */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '0.5rem',
          gap: '0.5rem',
        }}
      >
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--color-on-surface-variant)',
            lineHeight: 1.3,
          }}
        >
          {stageLabel}
        </span>
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 500,
            color: 'var(--color-on-surface-variant)',
            whiteSpace: 'nowrap',
          }}
        >
          {t('trainingCoursesComplete', { complete: stepsComplete, total: stepsTotal })}
        </span>
      </div>
    </div>
  );
}
