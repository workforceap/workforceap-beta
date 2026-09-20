'use client';

import { useCallback } from 'react';

interface DashboardErrorFallbackProps {
  /** Which dashboard section failed — shown in the message */
  section: 'jobs' | 'profile' | 'progress' | 'training' | 'activity' | 'points';
  /** Optional callback when the user presses Try again */
  onRetry?: () => void;
}

const SECTION_LABELS: Record<string, string> = {
  jobs: 'Job matches',
  profile: 'Profile',
  progress: 'Training progress',
  training: 'Training',
  activity: 'Recent activity',
  points: 'Points',
};

const SECTION_ICONS: Record<string, string> = {
  jobs: 'work',
  profile: 'person',
  progress: 'school',
  training: 'school',
  activity: 'history',
  points: 'stars',
};

/**
 * Minimal, section-specific fallback UI for dashboard async boundaries.
 * Matches the existing portal card + tonal palette style.
 */
export default function DashboardErrorFallback({
  section,
  onRetry,
}: DashboardErrorFallbackProps) {
  const handleReload = useCallback(() => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  }, [onRetry]);

  const label = SECTION_LABELS[section] ?? section;
  const icon = SECTION_ICONS[section] ?? 'error';

  return (
    <div
      className="portal-card portal-card--flat"
      data-portal-error-state="dashboard-section"
      style={{
        padding: '1rem 1.25rem',
        borderRadius: '0.875rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          width: '2.25rem',
          height: '2.25rem',
          borderRadius: '999px',
          background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '1.125rem',
            color: 'var(--color-accent)',
            fontVariationSettings: "'FILL' 1",
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: 'var(--color-on-surface)',
            margin: '0 0 0.15rem',
          }}
        >
          {label} could not load
        </p>
        <p
          style={{
            fontSize: '0.8125rem',
            color: 'var(--color-on-surface-variant)',
            margin: 0,
            lineHeight: 1.45,
          }}
        >
          A temporary issue stopped this section from loading.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={handleReload}
        style={{
          flexShrink: 0,
          minHeight: 36,
          padding: '0.5rem 0.875rem',
          fontSize: '0.8125rem',
        }}
      >
        Try again
      </button>
    </div>
  );
}
