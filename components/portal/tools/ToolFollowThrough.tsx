'use client';

import { getAIToolFollowThrough } from '@/lib/member/aiToolFollowThrough';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';

export default function ToolFollowThrough({
  toolType,
  inputSummary,
  output,
  hrefOverride,
}: {
  toolType: string;
  inputSummary?: string | null;
  output?: string | null;
  /** Keep credential-free proofs inside `/dev/member/*`. */
  hrefOverride?: string;
}) {
  const next = getAIToolFollowThrough({ toolType, inputSummary, output });

  return (
    <div
      style={{
        marginTop: '1.25rem',
        border: '1px solid color-mix(in srgb, var(--wa-accent) 22%, var(--wa-border))',
        borderLeft: '4px solid var(--wa-accent)',
        background: 'var(--wa-accent-soft)',
        borderRadius: 'var(--wa-radius-sm)',
        padding: 'var(--wa-pad-sm)',
      }}
    >
      <p
        style={{
          margin: '0 0 0.25rem',
          fontSize: 'var(--wa-type-meta)',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--wa-accent)',
        }}
      >
        Do this next
      </p>
      <p
        style={{
          margin: '0 0 0.25rem',
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--wa-text)',
        }}
      >
        {next.title}
      </p>
      <p
        style={{
          margin: '0 0 0.75rem',
          fontSize: 'var(--wa-type-meta)',
          lineHeight: 1.55,
          color: 'var(--wa-muted)',
        }}
      >
        {next.body}
      </p>
      <KitLinkButton href={hrefOverride ?? next.href} label={next.cta} variant="primary" size="sm" style={{ minHeight: 44 }} />
    </div>
  );
}
