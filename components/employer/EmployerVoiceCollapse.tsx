'use client';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Collapses the employer voice assistant so KPIs stay above the fold (UI-29).
 * Defaults closed; expands in place without navigating away.
 */
export default function EmployerVoiceCollapse({
  title,
  children,
  className = 'wa-px-6 wa-pt-6',
  style,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div
      className={className}
      style={style}
      data-testid="employer-voice-collapse"
      data-open={open ? 'true' : 'false'}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: open ? '0.75rem' : 0,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 'var(--wa-type-meta)',
            color: 'var(--wa-muted)',
            fontWeight: 600,
          }}
        >
          {title}
        </p>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide voice assistant' : 'Open voice assistant'}
        </button>
      </div>
      {open ? (
        <div id={panelId}>{children}</div>
      ) : (
        <div id={panelId} hidden />
      )}
    </div>
  );
}
