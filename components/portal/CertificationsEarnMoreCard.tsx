/**
 * "Earn More Credentials" hero card on /dashboard/certifications (mobile).
 *
 * A text-bearing gradient, so it paints from the `--wa-hero-crimson` pair
 * (dark in both themes) and its copy from `--wa-on-hero`; the white action
 * uses the dedicated `--wa-hero-action-bg` / `--wa-hero-action-text` pair
 * (docs/KIT_GUIDE.md section 1). Split out of the page so the surface can be
 * rendered in a unit test.
 */
export default function CertificationsEarnMoreCard() {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, var(--wa-hero-crimson) 0%, var(--wa-hero-crimson-dark) 100%)',
        borderRadius: '1rem',
        padding: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '2rem', color: 'var(--wa-on-hero)', '--ms-fill': 1 }}
      >
        emoji_events
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: 'var(--wa-on-hero)', fontSize: '1rem', marginBottom: '0.25rem' }}>Earn More Credentials</div>
        <div style={{ fontSize: '0.8125rem', color: 'color-mix(in srgb, var(--wa-on-hero) 85%, transparent)', marginBottom: '0.625rem' }}>
          Browse available certificates in your program pathway.
        </div>
        <a
          href="/dashboard/learning"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            background: 'var(--wa-hero-action-bg)',
            color: 'var(--wa-hero-action-text)',
            borderRadius: '0.5rem',
            padding: '0.375rem 0.875rem',
            fontWeight: 700,
            fontSize: '0.8125rem',
            textDecoration: 'none',
          }}
        >
          View Pathway
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">arrow_forward</span>
        </a>
      </div>
    </div>
  );
}
