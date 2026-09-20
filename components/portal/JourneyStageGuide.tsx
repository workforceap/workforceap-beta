'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  JOURNEY_STAGES,
  JOURNEY_STAGE_STORAGE_KEY,
  isJourneyStageId,
  type JourneyStageId,
} from '@/lib/portal/journeyStages';
import { postMemberEvent } from '@/lib/events/client';

/**
 * Journey-first entry point for the AI toolkit (beta). One question — "Where
 * are you right now?" — then 2-3 recommended tools for that stage. The full
 * toolkit grid below stays untouched; this only adds a guided layer on top.
 */
export default function JourneyStageGuide() {
  const t = useTranslations('journeyGuide');
  const [stage, setStage] = useState<JourneyStageId | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(JOURNEY_STAGE_STORAGE_KEY);
      if (isJourneyStageId(stored)) setStage(stored);
    } catch {
      /* storage disabled */
    }
    setHydrated(true);
  }, []);

  const selectStage = (next: JourneyStageId) => {
    setStage(next);
    try {
      localStorage.setItem(JOURNEY_STAGE_STORAGE_KEY, next);
    } catch {
      /* storage disabled */
    }
    void postMemberEvent({
      eventName: 'journey_stage_selected',
      entityType: 'journey_stage',
      entityId: next,
      sourcePage: '/dashboard/ai-tools',
    });
  };

  // Render nothing until hydration so the picker never flashes for returning members.
  if (!hydrated) return null;

  const active = JOURNEY_STAGES.find((s) => s.id === stage) ?? null;

  return (
    <section
      aria-label={t('sectionLabel')}
      style={{ maxWidth: '1100px', margin: '0 auto 1.5rem', padding: '0 clamp(1rem, 4vw, 1.5rem)' }}
    >
      <div className="portal-card portal-card--flat" style={{ padding: 'clamp(1rem, 3vw, 1.5rem)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
            {active ? t('yourStageTitle') : t('pickerTitle')}
          </h2>
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '0.2rem 0.55rem',
              borderRadius: '999px',
              background: 'rgba(173,44,77,0.12)',
              color: 'var(--color-accent)',
            }}
          >
            {t('betaTag')}
          </span>
        </div>

        {!active ? (
          <>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
              {t('pickerSubtitle')}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.625rem' }}>
              {JOURNEY_STAGES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectStage(s.id)}
                  className="portal-quick-action-item"
                  style={{
                    cursor: 'pointer',
                    border: '1px solid var(--outline-variant)',
                    background: 'var(--surface-container-low)',
                    textAlign: 'left',
                    padding: '0.875rem',
                    minHeight: '48px',
                    borderRadius: '0.75rem',
                  }}
                >
                  <div className="portal-quick-action-item__icon">
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', fontVariationSettings: "'FILL' 1" }}>
                      {s.icon}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="portal-quick-action-item__label" style={{ whiteSpace: 'normal', lineHeight: 1.3 }}>
                      {t(`stages.${s.key}.label`)}
                    </p>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.35 }}>
                      {t(`stages.${s.key}.hint`)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Stage stepper */}
            <div role="group" aria-label={t('stepperLabel')} style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {JOURNEY_STAGES.map((s) => {
                const isActive = s.id === active.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectStage(s.id)}
                    aria-pressed={isActive}
                    style={{
                      flex: '1 1 auto',
                      minHeight: '44px',
                      padding: '0.45rem 0.6rem',
                      borderRadius: '999px',
                      border: isActive ? '1.5px solid var(--color-accent)' : '1px solid var(--outline-variant)',
                      background: isActive ? 'rgba(173,44,77,0.10)' : 'transparent',
                      color: isActive ? 'var(--color-accent)' : 'var(--color-on-surface-variant)',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      cursor: 'pointer',
                    }}
                  >
                    {t(`stages.${s.key}.label`)}
                  </button>
                );
              })}
            </div>

            <p style={{ margin: '0 0 0.875rem', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)' }}>
              {t(`stages.${active.key}.headline`)}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {active.tools.map((tool) => (
                <Link
                  key={tool.key}
                  href={tool.href}
                  className="portal-quick-action-item"
                  style={{ textDecoration: 'none', padding: '0.875rem', border: '1px solid var(--outline-variant)', borderRadius: '0.75rem' }}
                >
                  <div className="portal-quick-action-item__icon">
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', fontVariationSettings: "'FILL' 1" }}>
                      {tool.icon}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="portal-quick-action-item__label" style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>
                      {t(`tools.${tool.key}.label`)}
                    </p>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.35 }}>
                      {t(`tools.${tool.key}.hint`)} · {t('minutes', { count: tool.minutes })}
                    </p>
                  </div>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '0.95rem', color: 'var(--color-on-surface-variant)', opacity: 0.4, flexShrink: 0 }}
                  >
                    chevron_right
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
