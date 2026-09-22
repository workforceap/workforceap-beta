'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { submitFirst90DaysCheckIn } from '@/app/(portal)/dashboard/first90DaysAction';
import {
  FIRST90_STAGES,
  type First90Response,
  type First90Stage,
} from '@/lib/member/first90Days';

/**
 * "First 90 Days" coach card (Plan 4, Phase 1).
 *
 * Appears automatically on the member dashboard while the member has a
 * PlacementRecord inside the 90-day window. Shows the current check-in
 * stage, a one-tap "How's the job going?" check-in, and short
 * "talk to your supervisor" scripts for the stage. A trouble report is
 * escalated to counselors through the existing at-risk pipeline.
 */
export type First90DaysCardProps = {
  stage: First90Stage;
  daysSincePlacement: number;
  employerName: string;
  /** Response already recorded for the current stage, if any. */
  currentStageResponse: First90Response | null;
  /** Stages (including the current one) that already have a response. */
  completedStages: First90Stage[];
};

const RESPONSE_OPTIONS: Array<{ value: First90Response; icon: string }> = [
  { value: 'going_well', icon: 'check_circle' },
  { value: 'have_questions', icon: 'help' },
  { value: 'having_trouble', icon: 'support_agent' },
];

export default function First90DaysCard({
  stage,
  daysSincePlacement,
  employerName,
  currentStageResponse,
  completedStages,
}: First90DaysCardProps) {
  const t = useTranslations('first90');
  const [isPending, startTransition] = useTransition();
  const [savedResponse, setSavedResponse] = useState<First90Response | null>(currentStageResponse);
  const [error, setError] = useState(false);

  const submit = (response: First90Response) => {
    setError(false);
    startTransition(async () => {
      try {
        await submitFirst90DaysCheckIn(stage, response);
        setSavedResponse(response);
      } catch {
        setError(true);
      }
    });
  };

  return (
    <section style={{ padding: '1rem 1.25rem 0' }} aria-labelledby="first90-card-title">
      <div
        className="portal-card portal-card--flat"
        style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
          <span
            aria-hidden
            style={{
              background: 'rgba(173,44,77,0.14)',
              color: 'var(--wa-accent-text)',
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '999px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.35rem', fontVariationSettings: "'FILL' 1" }}>
              work
            </span>
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              id="first90-card-title"
              style={{
                margin: 0,
                fontSize: '0.8125rem',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-dark)',
              }}
            >
              {t('eyebrow')}
            </p>
            <h2
              style={{
                margin: '0.15rem 0 0.25rem',
                fontSize: '1.05rem',
                fontWeight: 700,
                color: 'var(--color-on-surface)',
                lineHeight: 1.3,
              }}
            >
              {t('title', { employerName })}
            </h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
              {t('dayCount', { days: Math.max(daysSincePlacement, 0) })} · {t(`stageLabel.${stage}`)}
            </p>
          </div>
        </div>

        {/* Stage progress dots */}
        <div
          role="list"
          aria-label={t('progressAria')}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
        >
          {FIRST90_STAGES.map((s) => {
            const done = completedStages.includes(s) || (s === stage && !!savedResponse);
            const isCurrent = s === stage;
            return (
              <span
                role="listitem"
                key={s}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  padding: '0.25rem 0.6rem',
                  borderRadius: '999px',
                  background: isCurrent ? 'rgba(173,44,77,0.1)' : 'transparent',
                  border: `1px solid ${isCurrent ? 'rgba(173,44,77,0.3)' : 'var(--outline-variant, rgba(0,0,0,0.12))'}`,
                  color: isCurrent ? 'var(--color-accent-dark)' : 'var(--color-on-surface-variant)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{ fontSize: '0.95rem', fontVariationSettings: done ? "'FILL' 1" : "'FILL' 0", color: done ? 'var(--color-green, #4a9b4f)' : 'inherit' }}
                >
                  {done ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                {t(`stageLabel.${s}`)}
              </span>
            );
          })}
        </div>

        {/* Check-in question / thanks */}
        {savedResponse ? (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '0.75rem',
              background: 'rgba(74,155,79,0.08)',
              border: '1px solid rgba(74,155,79,0.2)',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface)', lineHeight: 1.5 }}>
              {t(`thanks.${savedResponse}`)}
            </p>
            {savedResponse !== 'going_well' && (
              <Link
                href="/dashboard/messages"
                style={{ display: 'inline-block', marginTop: '0.5rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--wa-accent-text)', textDecoration: 'none' }}
              >
                {t('messageCounselor')}
              </Link>
            )}
          </div>
        ) : (
          <div>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
              {t('question')}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {RESPONSE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={isPending}
                  onClick={() => submit(opt.value)}
                  aria-label={t(`responses.${opt.value}`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '1.05rem' }}>
                    {opt.icon}
                  </span>
                  {t(`responses.${opt.value}`)}
                </button>
              ))}
            </div>
            {error && (
              <p role="alert" style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--wa-accent-text)' }}>
                {t('saveError')}
              </p>
            )}
          </div>
        )}

        {/* Supervisor scripts for this stage */}
        <details>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--wa-accent-text)',
              listStyle: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '1.05rem' }}>
              record_voice_over
            </span>
            {t('scriptsTitle')}
          </summary>
          <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{t('scriptsIntro')}</p>
            {(['s1', 's2'] as const).map((key) => (
              <blockquote
                key={key}
                style={{
                  margin: 0,
                  padding: '0.65rem 0.85rem',
                  borderLeft: '3px solid rgba(173,44,77,0.35)',
                  borderRadius: '0 0.5rem 0.5rem 0',
                  background: 'rgba(173,44,77,0.05)',
                  fontSize: '0.88rem',
                  color: 'var(--color-on-surface)',
                  lineHeight: 1.5,
                }}
              >
                “{t(`scripts.${stage}.${key}`)}”
              </blockquote>
            ))}
          </div>
        </details>

        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{t('footerNote')}</p>
      </div>
    </section>
  );
}
