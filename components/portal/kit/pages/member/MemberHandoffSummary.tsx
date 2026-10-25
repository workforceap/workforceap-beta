import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronDown, Clock3, FileText, GraduationCap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { MemberHandoffEvidence } from '@/lib/member/loadMemberDashboardHome';
import { ResumeDraftReturnAction } from '@/components/portal/ResumeDraftContinuity';
import styles from './MemberHandoffSummary.module.css';

const UNKNOWN_HANDOFF: MemberHandoffEvidence = { resume: 'unknown', consultation: 'unknown', training: 'unknown' };

/** Status rows carry the evidence; optional confirmation help stays disclosed. Dates use UTC on both renders. */
export default function MemberHandoffSummary({
  evidence = UNKNOWN_HANDOFF,
  messagesHref = '/dashboard/messages',
  resumeStudioHref = '/dashboard/resume',
  showResumeAction = true,
  resumeReturnAction,
  resumeDraftOwnerToken,
}: {
  evidence?: MemberHandoffEvidence;
  messagesHref?: string;
  resumeStudioHref?: string;
  showResumeAction?: boolean;
  /** Optional resumable-work content supplied by the workspace owner; undefined uses the contextual default. */
  resumeReturnAction?: ReactNode;
  resumeDraftOwnerToken?: string;
}) {
  const t = useTranslations('dashboard.handoff');
  const locale = useLocale();
  const steps = [
    { key: 'resume', icon: FileText, confirmed: evidence.resume === 'portal_received', status: evidence.resume === 'portal_received' ? 'resumeReceived' : 'resumeUnknown' },
    { key: 'consultation', icon: CalendarDays, confirmed: evidence.consultation === 'booked', status: evidence.consultation === 'booked' ? 'consultationBooked' : 'consultationUnknown' },
    { key: 'training', icon: GraduationCap, confirmed: evidence.training === 'access_confirmed', status: evidence.training === 'access_confirmed' ? 'trainingConfirmed' : 'trainingUnknown' },
  ] as const;
  const needsConfirmation = steps.some((step) => !step.confirmed);
  const hasPendingConfirmation = steps.some((step) => evidence[step.key] === 'pending_confirmation');
  const defaultReturnAction = showResumeAction ? <div className={styles.returnAction}>
    <Link href={resumeStudioHref} className={`wa-kit-focus ${styles.resumeLink}`}>
      <FileText size={17} aria-hidden="true" />
      {t(evidence.resume === 'portal_received' ? 'reviewResume' : 'openResume')}
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  </div> : null;

  return (
    <section className={styles.summary} aria-labelledby="member-handoff-heading">
      <h2 id="member-handoff-heading" className={styles.heading}>{t('title')}</h2>
      <dl className={styles.steps}>
        {steps.map(({ key, icon: Icon, confirmed, status }) => {
          const pending = evidence[key] === 'pending_confirmation';
          const receipt = confirmed ? evidence.receipts?.[key] : undefined;
          // Portal receipt is inherent in this state; dates require their own authoritative record.
          const source = receipt?.source ?? (confirmed && key === 'resume' ? 'portal' : undefined);
          const recordedAt = receipt?.confirmedAt;
          const date = recordedAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(recordedAt)
            ? new Date(recordedAt) : null;
          const validDate = date && Number.isFinite(date.getTime()) ? date : null;
          return (
            <div key={key} className={styles.step} data-confirmed={confirmed} data-pending={pending}>
              {/* dl > div > dt + dd only: the decorative icon lives inside the dt and is positioned by CSS. */}
              <dt>
                <span className={styles.stepIcon} aria-hidden="true">{confirmed ? <Check size={18} /> : pending ? <Clock3 size={18} /> : <Icon size={18} />}</span>
                {t(key)}
              </dt>
              <dd className={styles.status}>{t(pending ? 'pendingConfirmation' : status)}</dd>
              {source ? <dd className={styles.receipt}>
                <span>{t(`source.${source}`)}</span>
                {validDate ? <time dateTime={recordedAt}>{t('confirmedOn', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(validDate) })}</time> : null}
              </dd> : null}
            </div>
          );
        })}
      </dl>
      {needsConfirmation ? (
        <details className={styles.confirmation}>
          <summary className="wa-kit-focus">
            {t(hasPendingConfirmation ? 'pendingSummary' : 'reconcileSummary')}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className={styles.confirmationBody}>
            <p>{t('outsidePortal')}</p>
            <p>{t('confirmationGuidance')}</p>
            <Link href={messagesHref} className={`wa-kit-focus ${styles.textLink}`}>
              {t('confirm')} <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <p className={styles.boundary}>{t('confirmationBoundary')}</p>
          </div>
        </details>
      ) : null}
      {resumeReturnAction !== undefined ? resumeReturnAction : resumeDraftOwnerToken ? (
        <ResumeDraftReturnAction ownerToken={resumeDraftOwnerToken} resumeHref={resumeStudioHref} fallback={defaultReturnAction} />
      ) : defaultReturnAction}
    </section>
  );
}
