import { enrollmentPathForSlug } from '@/lib/enroll/enrollmentPath';

export type FunnelCounts = {
  referred: number;
  pending: number;
  approved: number;
  consented: number;
  activated: number;
};

export default function PartnerEnrollmentFunnelStrip({
  partnerName,
  slug,
  enrollmentPageEnabled,
  counts,
}: {
  partnerName: string;
  slug: string;
  enrollmentPageEnabled: boolean;
  counts: FunnelCounts;
}) {
  const path = enrollmentPathForSlug(slug);
  const steps = [
    { label: 'Referred', value: counts.referred },
    { label: 'Pending', value: counts.pending },
    { label: 'Approved', value: counts.approved },
    { label: 'Consented', value: counts.consented },
    { label: 'Activated', value: counts.activated },
  ];

  return (
    <div className="wa-kit-card" style={{ marginBottom: 24, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Enrollment funnel</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--wa-muted)' }}>
            {partnerName} applicants from the dedicated school link.
          </p>
        </div>
        {enrollmentPageEnabled ? (
          <a href={path} style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)' }}>
            {path}
          </a>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--wa-muted)' }}>Enrollment page off</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
        {steps.map((step) => (
          <div key={step.label} style={{ background: 'var(--wa-surface-2)', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{step.value}</div>
            <div style={{ fontSize: 13, color: 'var(--wa-muted)', fontWeight: 600 }}>{step.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
