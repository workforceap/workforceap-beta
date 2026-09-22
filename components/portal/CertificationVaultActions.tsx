'use client';

import { useState } from 'react';
import { ShareButton } from '@/components/ui/ShareButton';
import { buildCertificateShare, getBrowserShareOrigin } from '@/lib/og/shareAchievementLinks';

export type CertRow = {
  id: string;
  certName: string;
  earnedAt: string;
};

function iconForCertName(name: string): string {
  const icons = ['workspace_premium', 'verified', 'school', 'security', 'cloud', 'health_and_safety'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 997;
  return icons[h % icons.length];
}

export function CertificationViewButton({
  certName,
  earnedAtLabel,
  earnedAtIso,
  variant = 'mobile',
}: {
  certName: string;
  earnedAtLabel: string;
  earnedAtIso: string;
  variant?: 'mobile' | 'desktop';
}) {
  const [open, setOpen] = useState(false);
  const share = buildCertificateShare({
    origin: getBrowserShareOrigin(),
    certificateTitle: certName,
    earnedAtIso,
  });

  const btnStyle =
    variant === 'mobile'
      ? {
          background: 'var(--color-accent)',
          color: 'var(--wa-on-accent-control)',
          border: 'none',
          borderRadius: '0.5rem',
          padding: '0.375rem 0.75rem',
          fontSize: '0.8125rem',
          fontWeight: 600,
          whiteSpace: 'nowrap' as const,
          cursor: 'pointer',
          flexShrink: 0,
        }
      : {
          background: 'var(--surface-container-high)',
          color: 'var(--color-accent)',
          border: '1px solid var(--outline-variant)',
          borderRadius: '0.5rem',
          padding: '0.35rem 0.75rem',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 600,
          cursor: 'pointer',
        };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        View
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${certName} details`}
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface, #fff)',
              color: 'var(--color-on-surface)',
              borderRadius: '0.875rem',
              padding: '1.25rem',
              width: 'min(100%, 22rem)',
              boxShadow: 'var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.15))',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700 }}>{certName}</h3>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
              Earned: {earnedAtLabel}
            </p>
            <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
              This is your verification record in WorkforceAP. Official certificates are issued by the certifying body; keep any PDFs they provide.
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              <ShareButton url={share.url} title={share.title} text={share.text} />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function CertificationDownloadOneButton({
  certName,
  variant = 'compact',
}: {
  certName: string;
  earnedAtIso: string;
  variant?: 'compact' | 'icon';
}) {
  if (variant === 'icon') {
    return (
      <a
        href="/api/member/certifications/export"
        download="my-certificates.csv"
        title="Download your certificate records (CSV)"
        className="btn btn-outline btn-sm"
        style={{ padding: '0.35rem 0.5rem', minWidth: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label={`Download record for ${certName}`}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }} aria-hidden="true">
          download
        </span>
      </a>
    );
  }

  return (
    <a
      href="/api/member/certifications/export"
      download="my-certificates.csv"
      style={{
        background: 'var(--surface-container-high)',
        color: 'var(--color-on-surface)',
        border: '1px solid var(--outline-variant)',
        borderRadius: '0.5rem',
        padding: '0.375rem 0.65rem',
        fontSize: '0.8125rem',
        fontWeight: 600,
        whiteSpace: 'nowrap' as const,
        cursor: 'pointer',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        textDecoration: 'none',
      }}
    >
      Download
    </a>
  );
}

export function CertificationEarnedRowMobile({
  certName,
  earnedAt,
}: {
  certName: string;
  earnedAt: Date;
}) {
  const icon = iconForCertName(certName);
  const earnedLabel = earnedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const earnedIso = earnedAt.toISOString();
  return (
    <div
      style={{
        background: 'var(--surface-container)',
        borderRadius: '0.875rem',
        padding: '0.875rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
      }}
    >
      <div
        style={{
          background: 'rgba(74,155,79,0.12)',
          borderRadius: '0.625rem',
          padding: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '1.375rem', color: 'var(--color-green)', '--ms-fill': 1 }}
        >
          {icon}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: '0.9375rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {certName}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>Recorded · {earnedLabel}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <CertificationDownloadOneButton certName={certName} earnedAtIso={earnedIso} variant="compact" />
        <CertificationViewButton certName={certName} earnedAtLabel={earnedLabel} earnedAtIso={earnedIso} variant="mobile" />
      </div>
    </div>
  );
}

export function DownloadAllCertificatesButton({ certs }: { certs: CertRow[] }) {
  const disabled = certs.length === 0;

  if (disabled) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        disabled
        title="Add earned certificates from your roadmap first"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          alignSelf: 'flex-start',
          padding: '0.6rem 1.25rem',
          fontSize: 'var(--font-size-sm)',
          opacity: 0.6,
          cursor: 'not-allowed',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }} aria-hidden="true">
          download
        </span>
        Download list (CSV)
      </button>
    );
  }

  return (
    <a
      href="/api/member/certifications/export"
      download="my-certificates.csv"
      className="btn btn-primary"
      title="Download a CSV list of your earned certificates"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        alignSelf: 'flex-start',
        padding: '0.6rem 1.25rem',
        fontSize: 'var(--font-size-sm)',
        textDecoration: 'none',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }} aria-hidden="true">
        download
      </span>
      Download list (CSV)
    </a>
  );
}
