import type { ApplicantTriageBucket } from '@/lib/admin/applicantTriage';

/**
 * Small bucket chip for the admin review surfaces. No hooks, so it renders
 * from both server pages and the client-side MembersTable. The reasons ride
 * along in `title` (native tooltip) and an sr-only span so keyboard and
 * screen-reader users get the same explanation.
 */

export type ApplicantTriageChipProps = {
  bucket: ApplicantTriageBucket;
  label: string;
  reasons: string[];
  size?: 'sm' | 'md';
};

const TONE: Record<ApplicantTriageBucket, { color: string; bg: string; border: string }> = {
  ready_to_review: { color: 'light-dark(#166534, var(--wa-success))', bg: 'rgba(22,163,74,0.12)', border: 'rgba(22,163,74,0.3)' },
  missing_info: { color: 'light-dark(#92400e, var(--wa-gold-dark))', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.3)' },
  needs_human: { color: 'light-dark(#1d4ed8, #93c5fd)', bg: 'rgba(37,99,235,0.12)', border: 'rgba(37,99,235,0.3)' },
  not_eligible_signal: { color: 'light-dark(#991b1b, var(--wa-danger))', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.3)' },
};

export default function ApplicantTriageChip({ bucket, label, reasons, size = 'sm' }: ApplicantTriageChipProps) {
  const tone = TONE[bucket];
  const tooltip = reasons.join(' · ');
  return (
    <span
      className="admin-applicant-triage-chip"
      data-bucket={bucket}
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: size === 'sm' ? '0.15rem 0.5rem' : '0.25rem 0.65rem',
        borderRadius: '50px',
        // 0.72rem was 11.52px, under the 12px floor; --wa-type-meta (13px) is
        // the smallest chip size token (kit tags). Fallback for routes that
        // load only the brand tokens.
        fontSize: 'var(--wa-type-meta, 13px)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        color: tone.color,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
      }}
    >
      {label}
      {tooltip ? <span className="sr-only">: {tooltip}</span> : null}
    </span>
  );
}
