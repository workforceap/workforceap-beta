import type { ApplicantTriageDisplay } from '@/lib/admin/applicantTriage';
import ApplicantTriageChip from '@/components/admin/ApplicantTriageChip';

/**
 * Member-detail review panel: the triage bucket, its reasons, and the review
 * checklist pre-filled from stored intake data. Read-only — the approve /
 * needs-info / deny buttons stay where they are and behave the same.
 */

export type ApplicantTriageChecklistProps = {
  triage: ApplicantTriageDisplay;
  copy: {
    title: string;
    description: string;
    reasonsHeading: string;
    checklistHeading: string;
    applicationStatusLabel: string;
  };
};

export default function ApplicantTriageChecklist({ triage, copy }: ApplicantTriageChecklistProps) {
  return (
    <section
      className="admin-applicant-triage"
      aria-labelledby="applicant-triage-heading"
      style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <h2 id="applicant-triage-heading" style={{ fontSize: '1.1rem', margin: 0 }}>{copy.title}</h2>
        <ApplicantTriageChip bucket={triage.bucket} label={triage.label} reasons={[]} size="md" />
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem', lineHeight: 1.45 }}>
        {copy.description}
      </p>
      <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        <strong>{copy.applicationStatusLabel}</strong>
      </p>

      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.25rem' }}>{copy.reasonsHeading}</h3>
      <ul style={{ fontSize: '0.9rem', marginBottom: '1rem', paddingLeft: '1.25rem', lineHeight: 1.5 }}>
        {triage.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.35rem' }}>{copy.checklistHeading}</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
        {triage.checklist.map((item) => (
          <li
            key={item.key}
            data-ok={item.ok ? 'true' : 'false'}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                width: '1.1rem',
                height: '1.1rem',
                borderRadius: '4px',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8125rem',
                fontWeight: 800,
                color: item.ok ? 'light-dark(#166534, var(--wa-success))' : 'var(--color-on-surface-variant)',
                background: item.ok ? 'rgba(22,163,74,0.14)' : 'var(--surface-container)',
                border: `1px solid ${item.ok ? 'rgba(22,163,74,0.35)' : 'var(--outline-variant)'}`,
              }}
            >
              {item.ok ? '✓' : ''}
            </span>
            <span className="sr-only">{item.ok ? 'Done: ' : 'Not yet: '}</span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
