'use client';

import type { ReactNode } from 'react';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Token } from '@astryxdesign/core/Token';

interface FeatureTileProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  badge?: string;
  /** Gradient in warm mode, auto-falls-back to tint in dense (token CSS). */
  tone?: 'crimson' | 'gold';
  href?: string;
  onClick?: () => void;
  /**
   * Heading level for the tile title. Defaults to h3 (a tile inside an h2
   * section). Pass 'h2' when tiles directly follow the page h1 so the
   * outline never skips a level (WAP-123).
   */
  headingAs?: 'h2' | 'h3' | 'h4';
}

/**
 * Bold feature tile — Astryx `ClickableCard` with optional `Token` badge.
 * Gradient chrome still comes from kit CSS classes on the wrapper when needed.
 */
export function FeatureTile({
  icon,
  title,
  body,
  badge,
  tone = 'crimson',
  href,
  onClick,
  headingAs: Heading = 'h3',
}: FeatureTileProps) {
  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {icon ? <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div> : <span />}
        {badge ? <Token label={badge} size="sm" color={tone === 'gold' ? 'yellow' : 'red'} /> : null}
      </div>
      <div>
        <Heading style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', margin: 0 }}>{title}</Heading>
        {body ? <p style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{body}</p> : null}
      </div>
    </>
  );

  const className = `wa-kit-card wa-kit-card--gradient-${tone} wa-kit-card--hover`;

  if (href) {
    return (
      <div className={className} style={{ minHeight: 170 }}>
        <ClickableCard label={title} href={href} padding={4}>
          {content}
        </ClickableCard>
      </div>
    );
  }

  return (
    <div className={className} style={{ minHeight: 170 }}>
      <ClickableCard label={title} onClick={onClick} padding={4}>
        {content}
      </ClickableCard>
    </div>
  );
}
