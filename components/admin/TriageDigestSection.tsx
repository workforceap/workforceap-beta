import Link from 'next/link';

import type { TriageDigest } from '@/lib/admin/triageDigest';

/**
 * "Who needs you today" — the prioritized triage section at the top of the
 * admin home. Designed for a NON-technical admin: plain language, one clear
 * card per bucket, big tap targets, the top few names, and a single obvious
 * action per card. Empty buckets are omitted upstream; an all-clear state
 * shows a friendly reassurance instead of an empty shell.
 */
export default function TriageDigestSection({ digest }: { digest: TriageDigest }) {
  return (
    <section style={{ padding: '0 1.5rem', marginBottom: '2rem' }}>
      <h2
        className="portal-section-heading"
        style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}
      >
        Who needs you today
      </h2>
      <p
        style={{
          margin: '0 0 1rem',
          fontSize: '0.85rem',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        The people most likely to need a hand right now.
      </p>

      {digest.allClear ? (
        <div
          className="portal-card portal-card--flat"
          style={{
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '2.75rem',
              height: '2.75rem',
              borderRadius: '50%',
              background: 'rgba(22,163,74,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ color: '#16a34a' }} aria-hidden>
              check_circle
            </span>
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-on-surface)' }}>
              All clear
            </p>
            <p
              style={{
                margin: '0.2rem 0 0',
                fontSize: '0.875rem',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              Nobody&rsquo;s waiting on you right now.
            </p>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {digest.buckets.map((bucket) => (
            <div
              key={bucket.key}
              className="portal-card portal-card--flat"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
                borderTop: `4px solid ${bucket.accent}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '0.5rem',
                    // color-mix accepts hex literals and CSS variables alike,
                    // so bucket accents can be design tokens.
                    background: `color-mix(in srgb, ${bucket.accent} 10%, transparent)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ color: bucket.accent }}
                    aria-hidden
                  >
                    {bucket.icon}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--color-on-surface)',
                    lineHeight: 1.25,
                  }}
                >
                  {bucket.label}
                </p>
              </div>

              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                {bucket.members.map((m) => (
                  <li key={`${bucket.key}:${m.id}`}>
                    <Link
                      href={m.href}
                      style={{
                        display: 'block',
                        textDecoration: 'none',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '0.5rem',
                        background: 'var(--surface-container)',
                        color: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          color: 'var(--color-on-surface)',
                        }}
                      >
                        {m.health ? (
                          <span
                            title={m.health.label}
                            style={{
                              display: 'inline-block',
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: m.health.color,
                              flexShrink: 0,
                            }}
                          />
                        ) : null}
                        {m.fullName}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.8125rem',
                          color: 'var(--color-on-surface-variant)',
                          marginTop: '0.15rem',
                        }}
                      >
                        {m.program ? `${m.program} · ` : ''}
                        {m.daysSinceActivity != null
                          ? `${m.daysSinceActivity}d since last activity`
                          : 'never active'}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: bucket.accent,
                          marginTop: '0.2rem',
                        }}
                      >
                        {m.action}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {bucket.count > bucket.members.length ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.8125rem',
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  + {bucket.count - bucket.members.length} more
                </p>
              ) : null}

              <Link
                href={bucket.href}
                className="btn btn-primary"
                style={{ marginTop: 'auto', justifyContent: 'center' }}
              >
                {bucket.cta}
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
