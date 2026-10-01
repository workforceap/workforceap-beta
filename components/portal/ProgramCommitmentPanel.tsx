import type { CSSProperties } from 'react';

type Variant = 'full' | 'compact';

const WILL_DO = [
  'Career training and professional certificate pathways (Coursera-aligned tracks)',
  'Counselor messaging, application review, and program assignment',
  'AI toolkit for resumes, interview practice, job match insights, and learning support',
  'Job board access, application tracker, and employer pipeline connections where available',
];

const WILL_NOT = [
  'Guaranteed job placement or a specific employer hire',
  'Automatic enrollment in vendor certification exams (PMI, AWS, CompTIA, etc.) without staff confirmation',
  'Legal eligibility determinations for WIOA or other funding — staff review applies',
];

export default function ProgramCommitmentPanel({
  variant = 'full',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  const isCompact = variant === 'compact';
  return (
    <section
      className={className}
      style={{
        borderRadius: '1rem',
        border: '1px solid var(--outline-variant)',
        background: 'var(--surface-container-low)',
        padding: isCompact ? '1rem' : '1.25rem 1.5rem',
      }}
      aria-labelledby="wap-commitment-heading"
    >
      <h2
        id="wap-commitment-heading"
        className="portal-section-heading"
        style={{ fontSize: isCompact ? '0.95rem' : '1.05rem', marginBottom: '0.75rem' }}
      >
        What we will — and will not — promise
      </h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem', lineHeight: 1.55 }}>
        WorkforceAP provides <strong>career and employment assistance</strong>: training, tools, and staff support to improve
        your odds. We are transparent so partners and members can set expectations together.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: '1rem',
        }}
      >
        <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wa-accent-text)', margin: '0 0 0.5rem' }}>
            We will
          </h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.875rem', lineHeight: 1.55, color: 'var(--color-on-surface)' }}>
            {WILL_DO.map((line) => (
              <li key={line} style={{ marginBottom: '0.35rem' }}>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem' } as CSSProperties}>
            We will not
          </h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.875rem', lineHeight: 1.55, color: 'var(--color-on-surface)' }}>
            {WILL_NOT.map((line) => (
              <li key={line} style={{ marginBottom: '0.35rem' }}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
