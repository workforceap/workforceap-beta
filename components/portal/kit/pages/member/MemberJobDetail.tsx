import { Briefcase } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import { MemberDisclosure } from './MemberDisclosure';

/**
 * Member Portal — JOB DETAIL (open role).
 * Same PageOpener + wa-kit-card chrome as the listing/board so
 * /dev/member/jobs?state=detail and /dashboard/jobs/[id] read as one product.
 *
 * Target route: app/(portal)/dashboard/jobs/[id]
 * Surface: warm (member-facing).
 */

export interface JobDetailScreeningQuestion {
  id?: string;
  prompt?: string;
  type?: string;
}

export interface MemberJobDetailProps {
  title: string;
  company: string;
  location: string;
  jobType: string;
  salary?: string | null;
  description?: string | null;
  requirements?: string[];
  backHref?: string;
  backLabel?: string;
  logoUrl?: string | null;
  screening?: {
    packTitle: string;
    employerLabel: string;
    questions: JobDetailScreeningQuestion[];
  } | null;
  referral?: { company: string; message: string; copySlot?: ReactNode } | null;
  applySlot?: ReactNode;
  /** Optional resume tailoring, retained inside its native disclosure. */
  preparationSlot?: ReactNode;
}

function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <NextLink
      href={href}
      className="wa-page-action wa-kit-focus"
    >
      {children}
    </NextLink>
  );
}

export function MemberJobDetail({
  title,
  company,
  location,
  jobType,
  salary,
  description,
  requirements = [],
  backHref = '/dashboard/jobs',
  backLabel = 'Back to board',
  logoUrl,
  screening,
  referral,
  applySlot,
  preparationSlot,
}: MemberJobDetailProps) {
  const td = useTranslations('memberJobs.detail');
  const lede = [company, location, jobType].filter(Boolean).join(' · ');

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <BackLink href={backHref}>{backLabel}</BackLink>
        <PageOpener
          title={title}
          meta={lede}
          aside={
            <span
              aria-hidden="true"
              style={{
                width: 48,
                height: 48,
                borderRadius: 'var(--wa-radius-sm)',
                border: '1px solid var(--wa-border)',
                background: 'var(--wa-surface-2)',
                color: 'var(--wa-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" width={48} height={48} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <Briefcase size={20} />
              )}
            </span>
          }
        />

        {salary ? (
          <p style={{ margin: 0 }}>
            <span className="wa-kit-chip wa-kit-chip--neutral">{salary}</span>
          </p>
        ) : null}
        {applySlot ? <a href="#job-application" className="wa-kit-cta wa-kit-focus">{td('reviewApplication')}</a> : null}

        {description ? (
          <div className="wa-kit-card">
            <h2 className="wa-kit-card-title" style={{ margin: '0 0 8px' }}>
              Description
            </h2>
            <div className="wa-kit-lede" style={{ whiteSpace: 'pre-wrap', color: 'var(--wa-text)' }}>
              {description}
            </div>
          </div>
        ) : null}

        {requirements.length > 0 ? (
          <div className="wa-kit-card">
            <h2 className="wa-kit-card-title" style={{ margin: '0 0 8px' }}>
              Requirements
            </h2>
            <ul className="wa-kit-lede" style={{ margin: 0, paddingLeft: 18, color: 'var(--wa-text)' }}>
              {requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {applySlot ? (
          <section id="job-application" aria-labelledby="job-application-heading" tabIndex={-1} className="wa-kit-card">
            <h2 id="job-application-heading" className="wa-kit-card-title" style={{ margin: '0 0 12px' }}>{td('yourApplication')}</h2>
            {applySlot}
          </section>
        ) : null}

        {screening && screening.questions.length > 0 ? (
          <div className="wa-kit-card">
            <h2 className="wa-kit-card-title" style={{ margin: '0 0 6px' }}>
              What this employer looks for
            </h2>
            <p className="wa-kit-lede" style={{ margin: 0 }}>
              {screening.packTitle}, shared by {screening.employerLabel}.
            </p>
            <MemberDisclosure summary={td('screeningInfoLabel')}>
              {td('screeningInfo')}
            </MemberDisclosure>
            <ol className="wa-kit-lede" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, color: 'var(--wa-text)' }}>
              {screening.questions.map((q, i) => (
                <li key={q.id ?? i}>
                  {q.prompt ?? td('screeningFallback')}
                  {q.type ? (
                    <span className="wa-kit-meta">
                      {' '}
                      ({q.type.replace(/_/g, ' ')})
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {referral ? (
          <div className="wa-kit-card wa-kit-card--accent-edge">
            <h2 className="wa-kit-card-title" style={{ margin: '0 0 6px' }}>
              Know someone at {referral.company}?
            </h2>
            <p className="wa-kit-lede" style={{ margin: '0 0 12px' }}>
              If you know someone there, send them this:
            </p>
            <div
              className="wa-kit-lede"
              style={{
                whiteSpace: 'pre-wrap',
                color: 'var(--wa-text)',
                padding: '12px 14px',
                borderRadius: 'var(--wa-radius-sm)',
                border: '1px solid var(--wa-border)',
                background: 'var(--wa-surface)',
                marginBottom: 12,
              }}
            >
              {referral.message}
            </div>
            {referral.copySlot}
          </div>
        ) : null}

        {preparationSlot ? <MemberDisclosure summary={td('tailorResume')}>{preparationSlot}</MemberDisclosure> : null}
      </div>
    </DesignSurface>
  );
}
