'use client';

import Link from 'next/link';

export default function LearningCivicBotPanel() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        right: 'var(--space-6)',
        width: '320px',
        background: 'var(--surface-container-low)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--outline-variant)',
        boxShadow: 'var(--shadow-glass)',
        overflow: 'hidden',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-white)',
          padding: 'var(--space-4) var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', '--ms-fill': 1 }}>
          smart_toy
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>WorkforceAP Study Assistant</span>
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '0.1rem 0.4rem',
                borderRadius: '4px',
                background: 'rgba(255,255,255,0.25)',
              }}
            >
              Preview
            </span>
          </div>
          <div style={{ fontSize: '0.8125rem', opacity: 0.85 }}>Use Training and pathway modules for study help today.</div>
        </div>
      </div>
      <div style={{ padding: 'var(--space-4)', minHeight: '120px' }}>
        <div
          style={{
            background: 'var(--surface-container)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-on-surface-variant)',
            marginBottom: 'var(--space-3)',
          }}
        >
          Need help with your current module? Open your training path to review lessons, resources, and next steps.
        </div>
      </div>
      <div style={{ padding: '0 var(--space-4) var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}>
        <Link
          href="/dashboard"
          style={{
            flex: 1,
            background: 'var(--color-accent)',
            color: 'var(--color-white)',
            borderRadius: 'var(--radius-full)',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Open Training
          <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }} aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </div>
    </div>
  );
}
