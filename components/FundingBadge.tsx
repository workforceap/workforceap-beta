'use client';

import { useState } from 'react';
import { Landmark } from 'lucide-react';
import type { FundingSource } from '@/lib/content/programs';
import { FUNDING_SOURCES, FUNDING_COLORS, formatFundingSourceLabel } from '@/lib/content/programs';

export default function FundingBadge({ source, showTooltip = true }: { source?: FundingSource | string; showTooltip?: boolean }) {
  const [open, setOpen] = useState(false);
  const color = source && FUNDING_COLORS[source as FundingSource] ? FUNDING_COLORS[source as FundingSource] : FUNDING_COLORS.WIOA;
  const displayLabel = formatFundingSourceLabel(source);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => showTooltip && setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.15rem 0.5rem',
          borderRadius: '50px',
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          background: color.bg,
          color: color.text,
          border: `1px solid ${color.border}`,
          cursor: 'pointer',
          lineHeight: 1,
        }}
        aria-label={`Funding source: ${displayLabel}`}
      >
        <Landmark size={13} aria-hidden="true" />
        {displayLabel}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 0.35rem)',
          left: 0,
          zIndex: 50,
          background: 'var(--surface-container-high, #1e1e2e)',
          border: '1px solid var(--outline-variant, #2a2a45)',
          borderRadius: '0.5rem',
          padding: '0.5rem 0.75rem',
          fontSize: '0.75rem',
          color: 'var(--color-on-surface-variant)',
          minWidth: '200px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        }}>
          <p style={{ margin: '0 0 0.35rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>No-cost training</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {FUNDING_SOURCES.map((fs) => (
              <li key={fs} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: fs === (source ?? 'WIOA') ? 700 : 400, color: fs === (source ?? 'WIOA') ? 'var(--color-accent)' : 'inherit' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: FUNDING_COLORS[fs].text, display: 'inline-block' }} />
                {fs}
                {fs === (source ?? 'WIOA') && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', opacity: 0.7 }}>← this program</span>}
              </li>
            ))}
          </ul>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.7rem', opacity: 0.7, lineHeight: 1.4 }}>
            Programs are offered at no cost to eligible members.
          </p>
        </div>
      )}
    </div>
  );
}
