'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import type { VoiceAgentSurfaceProps } from '@/components/portal/VoiceAgentSurface';

type VoiceCoachLauncherCardProps = Omit<VoiceAgentSurfaceProps, 'children'> & {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  ctaGradient?: string;
  ctaShadow?: string;
};

export default function VoiceCoachLauncherCard({
  title,
  description,
  href,
  ctaLabel,
  ctaGradient,
  ctaShadow,
  ...surface
}: VoiceCoachLauncherCardProps) {
  return (
    <VoiceAgentSurface {...surface} headline={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.86rem',
            lineHeight: 1.55,
            color: 'var(--color-on-surface-variant)',
            flex: 1,
          }}
        >
          {description}
        </p>
        <Link
          href={href}
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: '2.75rem',
            borderRadius: '0.8rem',
            textDecoration: 'none',
            fontSize: '0.88rem',
            fontWeight: 700,
            color: '#fff',
            background: ctaGradient ?? surface.gradient,
            // color-mix, not a hex-alpha suffix: glowColor may be a var().
            boxShadow: ctaShadow ?? `0 8px 24px color-mix(in srgb, ${surface.glowColor} 20%, transparent)`,
            textAlign: 'center',
            padding: '0.65rem 2.5rem 0.65rem 1rem',
          }}
        >
          <span style={{ display: 'block', width: '100%', textAlign: 'center' }}>{ctaLabel}</span>
          <ArrowRight size={16} aria-hidden style={{ position: 'absolute', right: '0.9rem' }} />
        </Link>
      </div>
    </VoiceAgentSurface>
  );
}
