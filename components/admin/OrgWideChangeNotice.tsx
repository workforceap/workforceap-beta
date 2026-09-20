import { ShieldAlert } from 'lucide-react';

/**
 * Shown on organization-wide admin surfaces (settings, feature flags) to a
 * staff admin who is not a super admin. It does not change who may edit —
 * that decision is Mike's (audit 2026-09-20 §5) — it makes the blast radius
 * visible before they save.
 */
export default function OrgWideChangeNotice({ surface }: { surface: 'settings' | 'feature-flags' }) {
  const what = surface === 'settings' ? 'Organization settings' : 'Feature flags';
  return (
    <div
      role="note"
      data-testid="org-wide-change-notice"
      className="wa-mb-5"
      style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-start',
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md, 12px)',
        border: '1px solid var(--wa-gold)',
        background: 'var(--wa-gold-soft)',
        color: 'var(--wa-text)',
        fontSize: '0.875rem',
        lineHeight: 1.45,
      }}
    >
      <ShieldAlert size={18} aria-hidden="true" style={{ color: 'var(--wa-gold-dark)', flexShrink: 0, marginTop: 2 }} />
      <p style={{ margin: 0 }}>
        <strong>Changes here affect the whole organization.</strong> {what} apply to every member, counselor,
        employer and partner portal the moment you save. You are signed in as a staff admin, not a super admin —
        double-check before saving.
      </p>
    </div>
  );
}
