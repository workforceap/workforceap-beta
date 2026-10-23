import { Briefcase } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import styles from './MemberJobs.module.css';

/** Job detail keeps requirements and consent visible. Optional preparation,
 * tailoring and referral material use native disclosures after the application.
 * The live and synthetic routes share this layout, without sharing data/actions. */
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
  preparationSlot?: ReactNode;
}

export function MemberJobDetail({
  title, company, location, jobType, salary, description, requirements = [],
  backHref = '/dashboard/jobs', backLabel = 'Back to board', logoUrl,
  screening, referral, applySlot, preparationSlot,
}: MemberJobDetailProps) {
  const lede = [company, location, jobType].filter(Boolean).join(' · ');
  return (
    <DesignSurface surface="warm">
      <div className={styles.detail}>
        <NextLink href={backHref} className="wa-page-action wa-kit-focus">{backLabel}</NextLink>
        <PageOpener kicker="Job search" title={title} lede={lede}
          icon={<Briefcase size={13} aria-hidden="true" />}
          action={logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" width={48} height={48} className={styles.logo} />
          ) : undefined}
        />
        <div className={styles.summaryRow}>
          {salary ? <p className={styles.salary}>{salary}</p> : null}
          {applySlot ? <a href="#job-application" className={`wa-kit-cta wa-kit-focus ${styles.jump}`}>Review application</a> : null}
        </div>

        <div className={styles.detailGrid}>
          <div className={styles.overview}>
            {description ? (
              <section aria-labelledby="job-description-heading">
                <h2 id="job-description-heading" className={styles.heading}>About this role</h2>
                <div className={styles.prose}>{description}</div>
              </section>
            ) : null}
            {requirements.length > 0 ? (
              <section aria-labelledby="job-requirements-heading">
                <h2 id="job-requirements-heading" className={styles.heading}>Requirements</h2>
                <ul className={styles.list}>{requirements.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
            ) : null}
          </div>
          {applySlot ? (
            <section id="job-application" aria-labelledby="job-application-heading" tabIndex={-1} className={styles.application}>
              <h2 id="job-application-heading" className={styles.heading}>Your application</h2>
              {applySlot}
            </section>
          ) : null}
        </div>

        {preparationSlot || (screening && screening.questions.length > 0) || referral ? (
          <section aria-labelledby="job-prepare-heading" className={styles.preparation}>
            <h2 id="job-prepare-heading" className={styles.heading}>Prepare before you apply</h2>
            {screening && screening.questions.length > 0 ? (
              <details className={styles.disclosure}>
                <summary className="wa-kit-focus">What this employer looks for <span>{screening.questions.length} preparation questions</span></summary>
                <div className={styles.disclosureBody}>
                  <p className="wa-kit-lede">{screening.packTitle} — shared by {screening.employerLabel}. Informational, so you can prepare before you apply.</p>
                  <ol className={styles.list}>{screening.questions.map((q, i) => (
                    <li key={q.id ?? i}>{q.prompt ?? 'See counselor for details.'}{q.type ? <span className="wa-kit-meta"> ({q.type.replace(/_/g, ' ')})</span> : null}</li>
                  ))}</ol>
                </div>
              </details>
            ) : null}
            {preparationSlot ? (
              <details className={styles.disclosure}>
                <summary className="wa-kit-focus">Tailor your resume <span>Optional AI assistance</span></summary>
                <div className={styles.disclosureBody}>{preparationSlot}</div>
              </details>
            ) : null}
            {referral ? (
              <details className={styles.disclosure}>
                <summary className="wa-kit-focus">Know someone at {referral.company}? <span>Referral message</span></summary>
                <div className={styles.disclosureBody}>
                  <p className="wa-kit-lede">If you know someone there, use this message as a starting point.</p>
                  <div className={styles.referralMessage}>{referral.message}</div>
                  {referral.copySlot}
                </div>
              </details>
            ) : null}
          </section>
        ) : null}
      </div>
    </DesignSurface>
  );
}
