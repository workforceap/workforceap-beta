'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, Download, Award } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DesignSurface, KpiStrip, KitEmptyState, ProgressBar, PageOpener } from '@/components/portal/kit';
import { ShareButton } from '@/components/ui/ShareButton';
import { buildCertificateShare, getBrowserShareOrigin } from '@/lib/og/shareAchievementLinks';
import { MEMBER_PROGRAM_HREF } from '@/lib/member/memberProgramHref';

/**
 * Member Portal — CERTIFICATES view.
 * Faithful port of `data-view-panel="certs"` in
 * docs/mockups/workforceap-member-suite.html.
 *
 * Target route: app/(portal)/dashboard/certificates
 * Surface: warm (member-facing).
 *
 * `addCertificateForm` (WAP-188 Phase A): the route passes the self-report
 * form (`CertificationAddForm`, POST /api/member/certifications → a `pending`
 * row in the staff review queue) and the kit frames it in its own card at
 * `#add-certificate`. With the form present the empty state uses the
 * `empty.certificates.body` sentence (it names the form below) and one of its
 * actions jumps to the form (the second, after "Continue course", while a
 * course is in progress); proofs that omit the slot keep `bodyKit`, which
 * promises no form.
 */

/** Anchor of the self-report card on the default (kit) My Certificates view. */
export const MEMBER_CERTIFICATES_ADD_FORM_ID = 'add-certificate';

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
  /** Resume link for the in-progress course. When set and a course is in progress, it becomes the primary CTA. */
  continueHref?: string;
  /** Self-report form rendered in the "Add a certificate you earned elsewhere" card. Omitted = no card. */
  addCertificateForm?: ReactNode;
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
  continueHref,
  addCertificateForm,
}: MemberCertificatesKitProps) {
  // The real next step for a member mid-course is the course, not a message.
  const continueIsPrimary = Boolean(continueHref) && inProgress.length > 0;
  const hasAddForm = Boolean(addCertificateForm);
  const te = useTranslations('empty');
  const addAction = { href: `#${MEMBER_CERTIFICATES_ADD_FORM_ID}`, label: te('certificates.action') };
  // Mid-course: resume first. Otherwise the self-report form when it is on the
  // page, else the counselor. The second slot is the next-best real step.
  const emptyPrimary = continueIsPrimary
    ? { href: continueHref!, label: te('certificates.continue') }
    : hasAddForm
      ? addAction
      : { href: counselorHref, label: te('certificates.counselor') };
  const emptySecondary = continueIsPrimary
    ? hasAddForm
      ? addAction
      : { href: counselorHref, label: te('certificates.counselor') }
    : { href: MEMBER_PROGRAM_HREF, label: te('certificates.secondary') };
  const kpiItems = [
    { label: 'Earned', value: earnedCount },
    { label: 'In progress', value: inProgressCount },
    ...(typeof learningHours === 'number' && learningHours > 0
      ? [{ label: 'Hours', value: learningHours }]
      : []),
    { label: 'Verified', value: verifiedCount },
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
                {/* `empty.certificates` (KIT_GUIDE §6): `first`. With the self-report
                    card below, the body is the full sentence ("…add a certificate you
                    earned elsewhere below") and an action jumps to it; without it the
                    body stops at "show in My program". The other actions are the real
                    next steps: resume the in-progress course (in My program) or
                    message the counselor. */}
                <KitEmptyState
                  kind="first"
                  title={te('certificates.title')}
                  description={te(hasAddForm ? 'certificates.body' : 'certificates.bodyKit')}
                  primaryAction={emptyPrimary}
                  secondaryAction={emptySecondary}
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

          {hasAddForm ? (
            <section
              id={MEMBER_CERTIFICATES_ADD_FORM_ID}
              aria-labelledby={`${MEMBER_CERTIFICATES_ADD_FORM_ID}-title`}
              className="wa-kit-card"
              style={{ scrollMarginTop: 'var(--wa-pad)' }}
            >
              <h2
                id={`${MEMBER_CERTIFICATES_ADD_FORM_ID}-title`}
                style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', letterSpacing: '-0.02em' }}
              >
                Add a certificate you earned elsewhere
              </h2>
              <p className="wa-kit-lede" style={{ marginTop: 4, marginBottom: 16 }}>
                Earned a certificate outside WorkforceAP, like CPR or OSHA 10? Add it here. Our staff check every
                certificate you add. Until they do, it shows as pending and does not count as earned.
              </p>
              {addCertificateForm}
            </section>
          ) : null}
        </div>
      </div>
    </DesignSurface>
  );
}
