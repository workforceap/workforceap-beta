'use client';

import Link from 'next/link';
import { programDisplayTitle } from '@/lib/content/programTitle';

type AtRiskMember = {
  memberId: string;
  riskScore: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  enrolledProgram: string | null;
};

type Props = {
  members: AtRiskMember[];
};

const LEVEL_STYLES: Record<AtRiskMember['riskLevel'], { bg: string; color: string; border: string }> = {
  CRITICAL: {
    bg: 'color-mix(in srgb, #dc2626 12%, transparent)',
    color: '#b91c1c',
    border: 'color-mix(in srgb, #dc2626 30%, transparent)',
  },
  HIGH: {
    bg: 'color-mix(in srgb, #ea580c 12%, transparent)',
    color: '#c2410c',
    border: 'color-mix(in srgb, #ea580c 30%, transparent)',
  },
  MEDIUM: {
    bg: 'color-mix(in srgb, #ca8a04 14%, transparent)',
    color: '#a16207',
    border: 'color-mix(in srgb, #ca8a04 30%, transparent)',
  },
  LOW: {
    bg: 'color-mix(in srgb, #16a34a 10%, transparent)',
    color: '#15803d',
    border: 'color-mix(in srgb, #16a34a 25%, transparent)',
  },
};

export default function AtRiskMemberList({ members }: Props) {
  if (members.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        borderRadius: '0.875rem',
        padding: '1.25rem',
        border: '1px solid var(--outline-variant)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
          At-Risk Members
        </h3>
        <Link
          href="/counselor/at-risk"
          style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-accent)', textDecoration: 'none' }}
        >
          View all →
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {members.map((m) => {
          const style = LEVEL_STYLES[m.riskLevel];
          return (
            <Link
              key={m.memberId}
              href={`/counselor/students/${m.memberId}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.625rem 0.875rem',
                borderRadius: '0.625rem',
                background: style.bg,
                border: `1px solid ${style.border}`,
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    fontSize: '0.8125rem',
                    fontWeight: 800,
                    color: style.color,
                    background: 'rgba(255,255,255,0.7)',
                  }}
                >
                  {m.riskScore}
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: style.color }}>
                  {m.riskLevel}
                </span>
              </div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                {m.enrolledProgram ? programDisplayTitle(m.enrolledProgram) : 'No program'}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
