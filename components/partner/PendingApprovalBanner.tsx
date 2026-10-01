'use client';

export default function PendingApprovalBanner() {
  return (
    <div
      role="alert"
      style={{
        padding: '1rem 1.25rem',
        background: 'linear-gradient(135deg, rgba(255,187,0,0.12) 0%, rgba(255,187,0,0.04) 100%)',
        border: '1px solid rgba(255,187,0,0.35)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '1.25rem', color: 'var(--color-gold)', flexShrink: 0, marginTop: '0.05rem' }}
          aria-hidden="true"
        >
          schedule
        </span>
        <div>
          <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: '0 0 0.25rem' }}>
            Your account is pending approval
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.55 }}>
            You can explore onboarding materials and set up your profile. Referral tools will unlock once our team reviews and approves your organization — you&rsquo;ll get an email when that happens.
          </p>
        </div>
      </div>
    </div>
  );
}
