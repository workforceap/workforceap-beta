'use client';

import { CheckCircle2, Download, Award } from 'lucide-react';
import Link from 'next/link';
import { DesignSurface, KpiStrip, KitEmptyState, ProgressBar, PageOpener } from '@/components/portal/kit';
import { ShareButton } from '@/components/ui/ShareButton';
import { buildCertificateShare, getBrowserShareOrigin } from '@/lib/og/shareAchievementLinks';

/**
 * Member Portal — CERTIFICATES view.
 * Faithful port of `data-view-panel="certs"` in
 * docs/mockups/workforceap-member-suite.html.
 *
 * Target route: app/(portal)/dashboard/certificates
 * Surface: warm (member-facing).
 */

interface EarnedCert {
  id: string;
  title: string;
  meta: string;
  verified?: boolean;
  /**
   * ISO date the credential was earned. When present, the Share action builds a
   * dated share link via `buildCertificateShare`; the route should forward the
   * member's real `earnedAt` here. Title-only sharing is used when omitted.
   */
  earnedAtIso?: string;
}

interface InProgressCert {
  id: string;
  title: string;
  /** 0–100. */
  percent: number;
  note: string;
}

export interface MemberCertificatesKitProps {
  earnedCount?: number;
  inProgressCount?: number;
  learningHours?: number;
  verifiedCount?: number;
  earned?: EarnedCert[];
  inProgress?: InProgressCert[];
  /** Empty-state counselor CTA. Proofs pass /dev/member/messages. */
  counselorHref?: string;
}

/**
 * Share action for an earned certificate card. Mirrors the legacy
 * CertificationViewButton wiring: builds the dated share link via
 * `buildCertificateShare` and hands the title/text/url to the shared
 * `ShareButton` (Web Share API with copy-link fallback).
 */
function EarnedCertShareButton({ title, earnedAtIso }: { title: string; earnedAtIso?: string }) {
  const share = buildCertificateShare({
    origin: getBrowserShareOrigin(),
    certificateTitle: title,
    // Pass the real earned date through when the route forwards it; otherwise
    // leave it empty rather than inventing one (the share link's date param is
    // simply omitted). The shared credential title is real either way.
    earnedAtIso: earnedAtIso ?? '',
  });
  return <ShareButton chrome="kit" url={share.url} title={share.title} text={share.text} />;
}

export function MemberCertificatesKit({
  earnedCount = 0,
  inProgressCount = 0,
  learningHours,
  verifiedCount = 0,
  earned = [],
  inProgress = [],
  counselorHref = '/dashboard/messages',
}: MemberCertificatesKitProps) {
  const kpiItems = [
    { label: 'Earned', value: earnedCount, color: 'text' as const },
    { label: 'In progress', value: inProgressCount, color: 'text' as const },
    ...(typeof learningHours === 'number' && learningHours > 0
      ? [{ label: 'Hours', value: learningHours, color: 'text' as const }]
      : []),
    { label: 'Verified', value: verifiedCount, color: 'text' as const },
  ];
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-5">
        <PageOpener
          kicker="Credentials"
          title="Certificates and achievements"
          lede="Verified credentials, plus what's in progress."
          icon={<Award size={13} aria-hidden="true" />}
        />
        <KpiStrip items={kpiItems} />

        <div className="wa-space-y-4">
          {/* Earned certificates — quiet bordered surface, rows + hairlines
              rather than a card mosaic (each row's own actions are the
              interaction, not the row itself). */}
          <div>
            <h2 className="sr-only">Earned certificates</h2>
            {earned.length === 0 ? (
              <div className="wa-kit-card">
                <KitEmptyState
                  title="No certificates yet"
                  description="Completed credentials will appear here after they are logged and verified."
                  action={
                    <Link href={counselorHref} className="wa-kit-cta wa-kit-focus hover:wa-opacity-90">
                      Message counselor
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }}>
                {earned.map((cert, i) => (
                  <div
                    key={cert.id}
                    className="wa-flex wa-items-start wa-gap-4"
                    style={{ padding: '16px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--wa-border)' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="wa-flex wa-flex-wrap wa-items-center wa-gap-2">
                        <h3 style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', letterSpacing: '-0.02em' }}>{cert.title}</h3>
                        {cert.verified ? (
                          <CheckCircle2 size={15} color="var(--wa-success)" aria-label="Verified" style={{ flexShrink: 0 }} />
                        ) : null}
                      </div>
                      <p className="wa-kit-meta" style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{cert.meta}</p>
                      <div className="wa-flex wa-flex-wrap wa-gap-2" style={{ marginTop: 12 }}>
                        <a
                          href="/api/member/certifications/export"
                          download="my-certificates.csv"
                          className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                          title="Download your certificate records (CSV)"
                        >
                          <Download size={14} aria-hidden="true" /> Download
                        </a>
                        <EarnedCertShareButton title={cert.title} earnedAtIso={cert.earnedAtIso} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {inProgress.length > 0 ? (
            <div className="wa-kit-card" style={{ padding: 0, overflow: 'hidden' }}>
              <h2 className="sr-only">Certificates in progress</h2>
              {inProgress.map((cert, i) => {
                const pct = Math.max(0, Math.min(100, Math.round(cert.percent)));
                return (
                  <div
                    key={cert.id}
                    style={{ padding: '16px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--wa-border)' }}
                  >
                    <div className="wa-flex wa-flex-wrap wa-items-center wa-justify-between wa-gap-2">
                      <h3 style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', letterSpacing: '-0.02em' }}>{cert.title}</h3>
                      <span style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-accent)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {pct}%
                      </span>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <ProgressBar pct={pct} aria-label={`${cert.title} progress`} />
                    </div>
                    <p className="wa-kit-lede" style={{ marginTop: 8 }}>{cert.note}</p>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </DesignSurface>
  );
}
