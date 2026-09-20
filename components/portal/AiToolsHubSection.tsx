'use client';

import Link from 'next/link';
import { AI_TOOLS_HUB } from '@/lib/portal/aiToolsHub';

export default function AiToolsHubSection() {
  return (
    <section style={{ padding: '0 clamp(1rem, 4vw, 1.5rem) 1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      <h2 className="wa-sr-only">Career Studio categories</h2>
      <div className="ai-tools-hub-grid">
        {AI_TOOLS_HUB.map((cat) => (
          <div key={cat.id} className="ai-tools-hub-card portal-card portal-card--flat">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '1.75rem',
                  color: 'var(--color-accent)',
                  '--ms-fill': 1,
                  flexShrink: 0,
                }}
                aria-hidden
              >
                {cat.icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                  {cat.title}
                  {cat.badge && (
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        verticalAlign: 'middle',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '999px',
                        background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                        color: 'var(--color-accent)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cat.badge}
                    </span>
                  )}
                </h3>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.45 }}>
                  {cat.description}
                </p>
              </div>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {cat.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--color-accent)',
                      textDecoration: 'none',
                    }}
                  >
                    {link.label}
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden>
                      chevron_right
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
