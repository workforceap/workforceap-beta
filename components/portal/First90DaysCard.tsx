'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Briefcase, CheckCircle2, Circle, CircleHelp, Headset, MessagesSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
 *
 * A kit card (WAP-194): `--wa-*` tokens only, lucide icons, the kit's 44px
 * ghost pills for the answers. Copy, the check-in server action and the
 * escalation are unchanged. Accent tints read `--wa-accent`, the same brand
 * accent as every other card in the kit home's column.
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

const RESPONSE_OPTIONS: Array<{ value: First90Response; icon: LucideIcon }> = [
  { value: 'going_well', icon: CheckCircle2 },
  { value: 'have_questions', icon: CircleHelp },
  { value: 'having_trouble', icon: Headset },
];

/** Tint of the brand accent (`--wa-accent` flips with the colour scheme). */
const accentTint = (pct: number) => `color-mix(in srgb, var(--wa-accent) ${pct}%, transparent)`;
const successTint = (pct: number) => `color-mix(in srgb, var(--wa-success) ${pct}%, transparent)`;

export default function First90DaysCard({
  stage,
  daysSincePlacement,
  employerName,
  currentStageResponse,
  completedStages,
  variant = 'legacy',
}: First90DaysCardProps & {
  /**
   * `legacy` (default, `?ui=legacy` home) keeps the section's own 1.25rem
   * gutter and top padding. `kit` drops it: the kit home's column sets the
   * inline edge and the gap between cards, so the card lines up with them.
   */
  variant?: 'legacy' | 'kit';
}) {
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
    <section style={variant === 'kit' ? undefined : { padding: '1rem 1.25rem 0' }} aria-labelledby="first90-card-title">
      <div className="wa-kit-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span
            aria-hidden
            style={{
              background: accentTint(14),
              color: 'var(--wa-accent-text)',
              width: 40,
              height: 40,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Briefcase size={20} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              id="first90-card-title"
              style={{
                margin: 0,
                fontSize: 'var(--wa-type-meta)',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--wa-accent-text)',
              }}
            >
              {t('eyebrow')}
            </p>
            <h2
              style={{
                margin: '2px 0 4px',
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: 'var(--wa-text)',
                lineHeight: 1.3,
              }}
            >
              {t('title', { employerName })}
            </h2>
            <p className="wa-kit-meta" style={{ margin: 0 }}>
              {t('dayCount', { days: Math.max(daysSincePlacement, 0) })} · {t(`stageLabel.${stage}`)}
            </p>
          </div>
        </div>

        {/* Stage progress chips */}
        <div
          role="list"
          aria-label={t('progressAria')}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          {FIRST90_STAGES.map((s) => {
            const done = completedStages.includes(s) || (s === stage && !!savedResponse);
            const isCurrent = s === stage;
            const Icon = done ? CheckCircle2 : Circle;
            return (
              <span
                role="listitem"
                key={s}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 'var(--wa-type-meta)',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: isCurrent ? accentTint(10) : 'transparent',
                  border: `1px solid ${isCurrent ? accentTint(30) : 'var(--wa-border)'}`,
                  color: isCurrent ? 'var(--wa-accent-text)' : 'var(--wa-muted)',
                }}
              >
                <Icon size={15} aria-hidden style={{ color: done ? 'var(--wa-success)' : 'currentColor', flexShrink: 0 }} />
                {t(`stageLabel.${s}`)}
              </span>
            );
          })}
        </div>

        {/* Check-in question / thanks */}
        {savedResponse ? (
          <div
            style={{
              padding: 'var(--wa-pad-sm)',
              borderRadius: 'var(--wa-radius-sm)',
              background: successTint(8),
              border: `1px solid ${successTint(20)}`,
            }}
          >
            <p style={{ margin: 0, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', lineHeight: 1.5 }}>
              {t(`thanks.${savedResponse}`)}
            </p>
            {savedResponse !== 'going_well' && (
              <Link
                href="/dashboard/messages"
                className="wa-kit-focus"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                  marginTop: 4,
                  fontSize: 'var(--wa-type-body)',
                  fontWeight: 700,
                  color: 'var(--wa-accent-text)',
                  textDecoration: 'none',
                }}
              >
                {t('messageCounselor')}
              </Link>
            )}
          </div>
        ) : (
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--wa-type-body)', fontWeight: 700, color: 'var(--wa-text)' }}>
              {t('question')}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RESPONSE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
                    disabled={isPending}
                    onClick={() => submit(opt.value)}
                    aria-label={t(`responses.${opt.value}`)}
                  >
                    <Icon size={16} aria-hidden />
                    {t(`responses.${opt.value}`)}
                  </button>
                );
              })}
            </div>
            {error && (
              <p role="alert" style={{ margin: '8px 0 0', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-accent-text)' }}>
                {t('saveError')}
              </p>
            )}
          </div>
        )}

        {/* Supervisor scripts for this stage */}
        <details>
          <summary
            className="wa-kit-focus"
            style={{
              cursor: 'pointer',
              minHeight: 44,
              fontSize: 'var(--wa-type-body)',
              fontWeight: 700,
              color: 'var(--wa-accent-text)',
              listStyle: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <MessagesSquare size={16} aria-hidden />
            {t('scriptsTitle')}
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="wa-kit-meta" style={{ margin: 0 }}>{t('scriptsIntro')}</p>
            {(['s1', 's2'] as const).map((key) => (
              <blockquote
                key={key}
                style={{
                  margin: 0,
                  padding: '10px 14px',
                  borderLeft: `3px solid ${accentTint(35)}`,
                  borderRadius: '0 var(--wa-radius-sm) var(--wa-radius-sm) 0',
                  background: accentTint(5),
                  fontSize: 'var(--wa-type-body)',
                  color: 'var(--wa-text)',
                  lineHeight: 1.5,
                }}
              >
                “{t(`scripts.${stage}.${key}`)}”
              </blockquote>
            ))}
          </div>
        </details>

        <p className="wa-kit-meta" style={{ margin: 0 }}>{t('footerNote')}</p>
      </div>
    </section>
  );
}
