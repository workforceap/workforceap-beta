'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays, Check, FileText, GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MemberHandoffEvidence } from '@/lib/member/loadMemberDashboardHome';
import styles from './MemberHandoffSummary.module.css';

const UNKNOWN_HANDOFF: MemberHandoffEvidence = { resume: 'unknown', consultation: 'unknown', training: 'unknown' };

/** A record of what Home can confirm, not a completion checklist inferred from missing data. */
export default function MemberHandoffSummary({
  evidence = UNKNOWN_HANDOFF,
  messagesHref = '/dashboard/messages',
  resumeStudioHref = '/dashboard/resume',
  showResumeAction = true,
}: {
  evidence?: MemberHandoffEvidence;
  messagesHref?: string;
  resumeStudioHref?: string;
  showResumeAction?: boolean;
}) {
  const t = useTranslations('dashboard.handoff');
  const steps = [
    { key: 'resume', icon: FileText, confirmed: evidence.resume === 'portal_received', status: evidence.resume === 'portal_received' ? 'resumeReceived' : 'resumeUnknown' },
    { key: 'consultation', icon: CalendarDays, confirmed: evidence.consultation === 'booked', status: evidence.consultation === 'booked' ? 'consultationBooked' : 'consultationUnknown' },
    { key: 'training', icon: GraduationCap, confirmed: evidence.training === 'access_confirmed', status: evidence.training === 'access_confirmed' ? 'trainingConfirmed' : 'trainingUnknown' },
  ] as const;
  const needsConfirmation = steps.some((step) => !step.confirmed);

  return (
    <section className={styles.summary} aria-labelledby="member-handoff-heading">
      <h2 id="member-handoff-heading" className={styles.heading}>{t('title')}</h2>
      <dl className={styles.steps}>
        {steps.map(({ key, icon: Icon, confirmed, status }) => (
          <div key={key} className={styles.step} data-confirmed={confirmed}>
            <span className={styles.stepIcon} aria-hidden="true">{confirmed ? <Check size={18} /> : <Icon size={18} />}</span>
            <div>
              <dt>{t(key)}</dt>
              <dd>{t(status)}</dd>
            </div>
          </div>
        ))}
      </dl>
      {needsConfirmation ? (
        <div className={styles.confirmation}>
          <p>{t('outsidePortal')}</p>
          <Link href={messagesHref} className={`wa-kit-focus ${styles.textLink}`}>
            {t('confirm')} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
      {showResumeAction ? <div className={styles.returnAction}>
        <div>
          <h3>{t(evidence.resume === 'portal_received' ? 'prepareTitle' : 'resumeTitle')}</h3>
          <p>{t(evidence.resume === 'portal_received' ? 'prepareBody' : 'resumeBody')}</p>
        </div>
        <Link href={resumeStudioHref} className={`wa-kit-focus ${styles.resumeLink}`}>
          <FileText size={17} aria-hidden="true" />
          {t(evidence.resume === 'portal_received' ? 'reviewResume' : 'openResume')}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div> : null}
    </section>
  );
}
