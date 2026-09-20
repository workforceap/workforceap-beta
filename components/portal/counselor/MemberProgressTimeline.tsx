'use client';

import { useMemo } from 'react';

export type TimelineStage =
  | 'enrollment'
  | 'assessment'
  | 'training'
  | 'certification'
  | 'placement';

export type TimelineEvent = {
  stage: TimelineStage;
  label: string;
  date: string | null;
  durationDays: number | null;
  status: 'completed' | 'in_progress' | 'pending' | 'skipped';
};

type Props = {
  events: TimelineEvent[];
  programAvgDays?: number | null;
};

const STAGE_ICONS: Record<TimelineStage, string> = {
  enrollment: 'how_to_reg',
  assessment: 'assignment',
  training: 'school',
  certification: 'verified',
  placement: 'work',
};

const STAGE_COLORS: Record<TimelineEvent['status'], { bg: string; border: string; icon: string }> = {
  completed: {
    bg: 'color-mix(in srgb, var(--color-green) 10%, transparent)',
    border: 'color-mix(in srgb, var(--color-green) 40%, transparent)',
    icon: 'var(--color-green)',
  },
  in_progress: {
    bg: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
    border: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
    icon: 'var(--color-accent)',
  },
  pending: {
    bg: 'var(--surface-container-low)',
    border: 'var(--outline-variant)',
    icon: 'var(--color-on-surface-variant)',
  },
  skipped: {
    bg: 'var(--surface-container-low)',
    border: 'var(--outline-variant)',
    icon: 'var(--color-on-surface-variant)',
  },
};

export default function MemberProgressTimeline({ events, programAvgDays }: Props) {
  const completedCount = useMemo(
    () => events.filter((e) => e.status === 'completed').length,
    [events],
  );

  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: '0.875rem',
        padding: '1.25rem',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
          Progress Timeline
        </h3>
        {programAvgDays != null ? (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            Avg program: {programAvgDays}d
          </span>
        ) : null}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div
          style={{
            height: 6,
            background: 'var(--surface-container)',
            borderRadius: '9999px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(completedCount / events.length) * 100}%`,
              background: 'var(--color-accent)',
              borderRadius: '9999px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            {completedCount} of {events.length} stages complete
          </span>
          {events.some((e) => e.durationDays != null) ? (
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              Total: {events.reduce((sum, e) => sum + (e.durationDays ?? 0), 0)}d
            </span>
          ) : null}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {events.map((event, index) => {
          const colors = STAGE_COLORS[event.status];
          const isLast = index === events.length - 1;
          return (
            <div key={event.stage} style={{ display: 'flex', gap: '0.75rem' }}>
              {/* Icon + connector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: colors.bg,
                    border: `2px solid ${colors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '1rem', color: colors.icon }}
                    aria-hidden="true"
                  >
                    {STAGE_ICONS[event.stage]}
                  </span>
                </div>
                {!isLast && (
                  <div
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 16,
                      background:
                        event.status === 'completed'
                          ? 'var(--color-green)'
                          : 'var(--outline-variant)',
                      margin: '4px 0',
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, paddingBottom: isLast ? 0 : '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color:
                        event.status === 'pending' || event.status === 'skipped'
                          ? 'var(--color-on-surface-variant)'
                          : 'var(--color-on-surface)',
                    }}
                  >
                    {event.label}
                  </span>
                  {event.status === 'in_progress' && (
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        color: 'var(--color-accent)',
                        background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                      }}
                    >
                      In Progress
                    </span>
                  )}
                </div>
                {event.date ? (
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    {new Date(event.date).toLocaleDateString()}
                    {event.durationDays != null ? ` · ${event.durationDays}d` : null}
                    {event.durationDays != null && programAvgDays != null && event.status === 'completed' ? (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontWeight: 600,
                          color:
                            event.durationDays <= programAvgDays
                              ? 'var(--color-green)'
                              : 'var(--color-accent)',
                        }}
                      >
                        {event.durationDays <= programAvgDays ? 'On track' : 'Slower than avg'}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    {event.status === 'skipped' ? 'Skipped' : 'Pending'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
