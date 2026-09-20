'use client';

import type { ReactNode } from 'react';

export type VoiceAgentSurfaceProps = {
  badge: string;
  headline?: string;
  /**
   * Heading level for `headline`. Defaults to h3 (a surface inside an h2
   * section). Pass 'h2' when the surface is the first thing under the page
   * h1 so the outline never skips a level (WAP-123).
   */
  headlineAs?: 'h2' | 'h3';
  subtext?: string;
  /**
   * Icon tile content. Prefer a lucide-react SVG element (no emoji as icons).
   * Widened from `string` so voice surfaces can pass real SVG icons; existing
   * string/glyph callers remain valid (`string` is a `ReactNode`).
   */
  icon: ReactNode;
  /** CSS color used for icon tile border and ambient glow */
  glowColor: string;
  /** Full CSS gradient for outer ring */
  gradient: string;
  /** Optional badge text color, defaults to the surface glow color. */
  badgeColor?: string;
  children: ReactNode;
};

/**
 * Visual chrome for ElevenLabs voice panels: gradient ring, soft glow, icon tile.
 */
export default function VoiceAgentSurface({
  badge,
  headline,
  headlineAs: HeadlineTag = 'h3',
  subtext,
  icon,
  glowColor,
  gradient,
  badgeColor,
  children,
}: VoiceAgentSurfaceProps) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '1rem',
        padding: '1px',
        background: gradient,
        boxShadow: `0 16px 48px color-mix(in srgb, ${glowColor} 16%, transparent)`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        className="portal-card portal-card--flat"
        style={{
          borderRadius: '0.94rem',
          border: 'none',
          padding: '1.25rem',
          background: 'var(--surface-container-lowest)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-25%',
            right: '-8%',
            width: '160px',
            height: '160px',
            background: gradient,
            opacity: 0.1,
            borderRadius: '50%',
            filter: 'blur(48px)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            gap: '0.875rem',
            marginBottom: '1rem',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: `linear-gradient(145deg, color-mix(in srgb, ${glowColor} 15%, transparent), transparent)`,
              border: `1px solid color-mix(in srgb, ${glowColor} 25%, transparent)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.45rem',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <p
              className="wa-text-[13px] wa-uppercase wa-tracking-[0.14em] wa-font-semibold"
              style={{ color: badgeColor ?? glowColor, marginBottom: '0.35rem' }}
            >
              {badge}
            </p>
            {headline ? (
              <HeadlineTag
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--color-on-surface)',
                  lineHeight: 1.3,
                }}
              >
                {headline}
              </HeadlineTag>
            ) : null}
            {subtext ? (
              <p
                style={{
                  margin: '0.35rem 0 0',
                  fontSize: '0.82rem',
                  color: 'var(--color-on-surface-variant)',
                  lineHeight: 1.45,
                }}
              >
                {subtext}
              </p>
            ) : null}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
