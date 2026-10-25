'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';
import { StatusTag } from '@/components/portal/kit/StatusTag';
import styles from './MemberApprovalStatusCard.module.css';
import { formatDate } from '@/lib/i18n/date';
import { PORTAL_TIMEZONE } from '@/lib/formatDate';
import { isAppLocale, DEFAULT_LOCALE, type AppLocale } from '@/lib/i18n/config';
import {
  approvalDismissStorageKey,
  approvalStatusSignature,
  type MemberApprovalCardPlacement,
} from '@/lib/member/memberApprovalCardPlacement';
import {
  firstNameOf,
  type ApprovalStageKey,
  type MemberApprovalStage,
  type MemberApprovalStatus,
} from '@/lib/member/memberApprovalStatus';
import type { MemberCounselorContext } from '@/lib/member/counselorContext';
import { applicationStatusLabel, intakeStatusLabel } from '@/lib/status/applicationStatusVocabulary';

const STAGE_ORDER: ApprovalStageKey[] = ['application', 'intake', 'training'];

/** BCP-47 tag per app locale, pinned so the server and the browser format the same way. */
const INTL_TAG: Record<AppLocale, string> = { en: 'en-US', es: 'es-US', fr: 'fr-FR', pt: 'pt-BR' };

/**
 * "Sep 10": month and day only, in the portal's fixed timezone and the app's
 * locale. Fixed zone + fixed locale tag means the server render and the browser
 * agree (no hydration mismatch), and it names the same calendar day as the
 * dated lines inside the disclosure, which use the same zone.
 */
function shortDate(iso: string, locale: AppLocale): string {
  try {
    return new Intl.DateTimeFormat(INTL_TAG[locale], { timeZone: PORTAL_TIMEZONE, month: 'short', day: 'numeric' }).format(new Date(iso));
  } catch {
    return '';
  }
}

/** `memberApproval.reviewer.*` line per step the member is waiting on. */
const REVIEWER_KEY = {
  approval: 'reviewer.assignedApproval',
  info: 'reviewer.assignedNeedsInfo',
  intake: 'reviewer.assignedIntake',
} as const;

/**
 * Three-stage approval chain (application → intake review → training
 * approval). Every line is a saved fact: the state, the date that state was
 * recorded, who owns the next move and what happens next. Stages without a
 * stored start date say so instead of guessing one.
 *
 * Presentation (C1 redesign, round 3): a slim strip in the page header
 * (`MemberHomeKit` `approvalSlot`) shows the real state in as few cells as it
 * takes. Each cell is a dot or check, the step name and one saved fact with its
 * saved date ("Submitted Sep 10, under review"); steps nobody has reached are
 * not drawn as empty "Not started" cells. A live pathway shows the steps done,
 * the one in progress and only the next step by name ("Next: intake review");
 * a finished pathway is one cell ("Cleared to train", "Approved Sep 2"); a
 * closed one stops at the step that closed it, with the "Pathway closed" chip.
 * Dates are month and day in the portal's fixed timezone (hydration-safe, and
 * the same calendar day as the dated lines in the disclosure). Every saved fact the old tall card showed
 * (state, date, who owns the step, what happens next, the reviewer line and
 * the Coursera note) is still on the page, inside the "Your approval status"
 * disclosure under the strip. `placement` comes from
 * `memberApprovalCardPlacement`: `primary` (a live next step) shows the
 * current next step as the disclosure's one-line summary; `demoted` (finished
 * or closed pathway) shows the saved state and, when the member owns it, the
 * next step. Either can be dismissed; the dismissal is stored per member and
 * per status, so it lasts until the status moves, and a quiet link keeps the
 * member's own status one click away.
 *
 * `counselorContext` (lib/member/counselorContext.ts) names the assigned
 * counselor who reviews the step the member is waiting on, links to their
 * thread, and quotes the recent median review time only when enough recent
 * decisions exist. Without it the card states the saved steps and nothing
 * about who or how long.
 */
export default function MemberApprovalStatusCard({
  status,
  storageUserId,
  placement = 'primary',
  counselorContext = null,
  variant = 'full',
  messagesHref = '/dashboard/messages',
}: {
  status: MemberApprovalStatus;
  /** Member id — scopes the dismissal so a shared device never hides someone else's status. */
  storageUserId: string;
  placement?: MemberApprovalCardPlacement;
  counselorContext?: MemberCounselorContext | null;
  /** Compact disclosure for task-first Home callers that still need the full facts. */
  variant?: 'full' | 'compact';
  /** Preview-safe destination for the member's team contact link. */
  messagesHref?: string;
}) {
  const t = useTranslations('memberApproval');
  // Application and intake words come from the shared status vocabulary
  // (`status.*.member.*`, lib/status/applicationStatusVocabulary.ts), so the
  // card reads the same way as every other surface that names these states.
  const tStatus = useTranslations('status');
  const locale = useLocale();
  const dateLabel = (date: string) => formatDate(date, isAppLocale(locale) ? locale : DEFAULT_LOCALE);

  const signature = approvalStatusSignature(status);
  const storageKey = approvalDismissStorageKey(storageUserId);
  // `undefined` until localStorage has been read: the server render and the
  // first client paint agree, and a member without JS keeps the full card.
  const [dismissedAt, setDismissedAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    try {
      setDismissedAt(window.localStorage.getItem(storageKey));
    } catch {
      setDismissedAt(null);
    }
  }, [storageKey]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, signature);
    } catch {
      /* private mode / storage blocked: hide for this view only */
    }
    setDismissedAt(signature);
  }, [signature, storageKey]);

  const restore = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setDismissedAt(null);
  }, [storageKey]);

  const statusText = (stage: ApprovalStageKey) => {
    if (stage === 'application') return applicationStatusLabel(status.application, 'member', tStatus);
    if (stage === 'intake') return intakeStatusLabel(status.intake, 'member', tStatus);
    return t(`trainingStatus.${status.training}`);
  };

  const dateLine = (stage: ApprovalStageKey, view: MemberApprovalStage) => {
    if (view.completedAt) {
      const key = stage === 'training' ? 'approvedAt' : 'reviewed';
      return <time dateTime={view.completedAt}>{t(key, { date: dateLabel(view.completedAt) })}</time>;
    }
    if (view.startedAt) {
      const key = stage === 'application' ? 'submitted' : 'inStepSince';
      return <time dateTime={view.startedAt}>{t(key, { date: dateLabel(view.startedAt) })}</time>;
    }
    if (view.state === 'current' || view.state === 'blocked') {
      return <span className="wa-text-[var(--wa-muted)]">{t('startNotRecorded')}</span>;
    }
    return null;
  };

  const ownerLabel = (view: MemberApprovalStage) => {
    switch (view.owner) {
      case 'member':
        return t('ownerMember');
      case 'counselor':
        // First name, like the reviewer line below: one person, one name form.
        return t('ownerCounselor', { name: status.counselorName ? firstNameOf(status.counselorName) : '' });
      case 'staff':
        return t('ownerStaff');
      default:
        return null;
    }
  };

  // ── Collapsed summary ──
  // The stage that ended the pathway: the blocked one, or the last step once
  // every step is resolved. Its saved state is the summary line, and when the
  // member still owns the next move (a closed application they can reapply
  // for, an invitation they have to accept) that next step is named on the
  // line too — demoting the card must not hide the one thing left to do.
  const summaryStage: ApprovalStageKey = STAGE_ORDER.find(
    (stage) => status.stages[stage].state === 'blocked',
  ) ?? 'training';
  const summaryStatus = status.stages[summaryStage].state === 'blocked'
    ? statusText(summaryStage)
    : t('summaryAllApproved');
  const summaryAction = status.stages[summaryStage].owner === 'member'
    ? t('whatsNext', { text: t(`next.${summaryStage}.${status.stages[summaryStage].nextKey}`) })
    : null;

  const dismissButton = (
    <button
      type="button"
      onClick={dismiss}
      aria-label={t('dismissLabel')}
      data-approval-dismiss=""
      className={`wa-kit-focus ${styles.quietButton}`}
    >
      {t('dismiss')}
    </button>
  );

  const stageList = (
    <ol className={styles.stageList}>
      {STAGE_ORDER.map((stage, index) => {
        const view = status.stages[stage];
        const isCurrent = view.state === 'current';
        const owner = ownerLabel(view);
        const showNext = view.state !== 'complete' || stage === 'training';
        return (
          <li
            key={stage}
            aria-current={isCurrent ? 'step' : undefined}
            data-stage={stage}
            data-stage-state={view.state}
            className={styles.stage}
          >
            <p className={styles.stageTitle}>
              <span>{index + 1}. {t(stage)}</span>
              {isCurrent ? <StatusTag tone="info">{t('currentStep')}</StatusTag> : null}
            </p>
            <p className={styles.stageStatus}>{statusText(stage)}</p>
            {dateLine(stage, view) ? <p className={styles.stageMeta}>{dateLine(stage, view)}</p> : null}
            {showNext && owner ? (
              <p className={styles.stageMeta}>{t('whoOwns', { owner })}</p>
            ) : null}
            {showNext ? (
              <p className={styles.stageMeta} data-muted="">
                {t('whatsNext', { text: t(`next.${stage}.${view.nextKey}`) })}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );

  // ── Who reviews the step in flight, and how long that has been taking ──
  // Only while a staff-owned step is pending. The counselor's name comes from
  // the saved assignment; the wait line only appears when the loader had at
  // least five recent decisions to compute a median from.
  const reviewer = counselorContext?.awaiting ? (
    <div className={styles.reviewer} data-approval-reviewer={counselorContext.counselor ? 'assigned' : 'unassigned'}>
      {counselorContext.counselor ? (
        <p>
          {t(REVIEWER_KEY[counselorContext.awaiting], { name: counselorContext.counselor.firstName })}{' '}
          <Link href={counselorContext.counselor.messagingHref} className="wa-kit-focus wa-underline">
            {t('reviewer.message', { name: counselorContext.counselor.firstName })}
          </Link>
        </p>
      ) : (
        <p>{t('reviewer.unassigned')}</p>
      )}
      {counselorContext.waitEstimate ? (
        <p className={styles.muted} data-approval-wait-estimate="">
          {t('reviewer.waitEstimate', {
            days: counselorContext.waitEstimate.medianDays,
            count: counselorContext.waitEstimate.sampleSize,
          })}
        </p>
      ) : null}
    </div>
  ) : null;

  const details = (
    <>
      {reviewer}
      <p className={styles.muted}>
        {status.currentStage === 'complete' ? t('introComplete') : t('intro')}
      </p>
      {stageList}
      <p className={styles.muted}>{t('providerUnknown')}</p>
      <Link href={messagesHref} className={`wa-kit-focus ${styles.contact}`}>{t('contact')}</Link>
    </>
  );

  // ── Dismissed: one quiet line so nobody loses access to their own status ──
  if (dismissedAt === signature) {
    return (
      <section className={styles.dismissed} data-approval-card="dismissed">
        <button
          type="button"
          onClick={restore}
          className={`wa-kit-focus ${styles.quietButton}`}
        >
          {t('restore')}
        </button>
      </section>
    );
  }

  if (variant === 'compact') {
    const currentStage = status.currentStage === 'complete' ? 'training' : status.currentStage;
    const current = status.stages[currentStage];
    const owner = ownerLabel(current);
    return (
      <section aria-labelledby="member-approval-title" className={styles.compact} data-approval-card="compact">
        <h2 id="member-approval-title" className={styles.label}>{t('title')}</h2>
        <details>
          <summary className={`wa-kit-focus ${styles.compactSummary}`}>
            <span className={styles.compactCopy}>
              <span data-approval-summary="">{t(currentStage)}: {statusText(currentStage)}</span>
              {owner ? <span className={styles.owner}>{t('whoOwns', { owner })}</span> : null}
              {current.owner === 'member' ? <span className={styles.owner} data-approval-summary-action="">{t('whatsNext', { text: t(`next.${currentStage}.${current.nextKey}`) })}</span> : null}
            </span>
            <span className={styles.compactDisclosure}>{t('viewDetails')} <ChevronDown size={18} aria-hidden="true" /></span>
          </summary>
          <div className={styles.compactDetails}>
            {details}
            {dismissButton}
          </div>
        </details>
      </section>
    );
  }

  // ── Strip: the real state, in as few cells as it takes ──
  // Each cell carries a saved fact with its saved date. Steps nobody has
  // reached yet are not drawn as empty "Not started" cells: a live pathway
  // shows the steps already done, the one in progress, and just the next one
  // by name. A finished pathway is one cell ("Cleared to train, approved
  // Sep 2"); a closed one stops at the step that closed it.
  const appLocale: AppLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  const stripDate = (iso: string) => shortDate(iso, appLocale);

  const stripDetail = (stage: ApprovalStageKey, view: MemberApprovalStage): string => {
    if (view.state === 'blocked') return t('strip.closed');
    if (stage === 'application') {
      const since = view.startedAt ? stripDate(view.startedAt) : '';
      if (view.state === 'complete') return since ? t('strip.submittedApproved', { date: since }) : t('strip.approved');
      if (status.application === 'pending') return since ? t('strip.submittedUnderReview', { date: since }) : t('strip.underReview');
      if (status.application === 'needs_info') return since ? t('strip.submittedNeedsInput', { date: since }) : t('strip.needsInfo');
      return statusText('application');
    }
    if (stage === 'intake') {
      if (view.state === 'complete') return view.completedAt ? t('reviewed', { date: stripDate(view.completedAt) }) : t('strip.done');
      const since = view.startedAt ? stripDate(view.startedAt) : '';
      if (since && status.intake === 'pending') return t('strip.reviewPendingSince', { date: since });
      if (since && status.intake === 'in_review') return t('strip.inReviewSince', { date: since });
      if (since && status.intake === 'needs_info') return t('strip.needsInputSince', { date: since });
      return statusText('intake');
    }
    if (view.state === 'complete') return view.completedAt ? t('approvedAt', { date: stripDate(view.completedAt) }) : t('strip.approved');
    return statusText('training');
  };

  const anyBlocked = STAGE_ORDER.some((stage) => status.stages[stage].state === 'blocked');
  const needsInput = status.application === 'needs_info' || status.intake === 'needs_info';
  const allDone = status.currentStage === 'complete';
  const chip = allDone
    ? null
    : anyBlocked
      ? { tone: 'neutral', label: t('strip.closedChip') }
      : needsInput
        ? { tone: 'crimson', label: t('strip.needsInfo') }
        : { tone: 'blue', label: t('strip.pending') };

  // Steps to draw: done steps up to the one in progress (or the one that
  // closed), then at most one "Next" cell. Nothing is drawn after a closed step.
  const lastShown = allDone
    ? STAGE_ORDER.length - 1
    : Math.max(0, STAGE_ORDER.findIndex((stage) => ['current', 'blocked'].includes(status.stages[stage].state)));
  const shownStages = STAGE_ORDER.slice(0, lastShown + 1);
  const nextStage: ApprovalStageKey | null = allDone || anyBlocked ? null : (STAGE_ORDER[lastShown + 1] ?? null);

  const completeDone = (
    <li
      className="wa-kit-status-step wa-kit-status-step--done"
      data-strip-step="training"
    >
      <span className="wa-kit-status-step__dot" aria-hidden="true"><Check /></span>
      <span className="wa-kit-status-step__text">
        <b>{t('strip.cleared')}</b>
        <small>{stripDetail('training', status.stages.training)}</small>
      </span>
    </li>
  );

  const strip = (
    <div className="wa-kit-status-strip" data-approval-strip="">
      <ol className="wa-kit-status-strip__steps" aria-label={t('strip.label')}>
        {allDone
          ? completeDone
          : shownStages.map((stage) => {
              const view = status.stages[stage];
              const index = STAGE_ORDER.indexOf(stage);
              const tone = view.state === 'complete' ? 'done' : view.state === 'current' ? 'current' : 'todo';
              return (
                <li
                  key={stage}
                  className={`wa-kit-status-step wa-kit-status-step--${tone}`}
                  data-strip-step={stage}
                  aria-current={view.state === 'current' ? 'step' : undefined}
                >
                  <span className="wa-kit-status-step__dot" aria-hidden="true">
                    {view.state === 'complete' ? <Check /> : index + 1}
                  </span>
                  <span className="wa-kit-status-step__text">
                    <b>{t(stage)}</b>
                    <small>{stripDetail(stage, view)}</small>
                  </span>
                </li>
              );
            })}
        {nextStage ? (
          <li className="wa-kit-status-step wa-kit-status-step--todo" data-strip-step="next">
            <span className="wa-kit-status-step__dot" aria-hidden="true">{STAGE_ORDER.indexOf(nextStage) + 1}</span>
            <span className="wa-kit-status-step__text">
              <b>{t('strip.next', { step: t(`strip.nextStep.${nextStage as 'intake' | 'training'}`) })}</b>
            </span>
          </li>
        ) : null}
      </ol>
      {chip ? (
        <span className={`wa-kit-chip wa-kit-chip--${chip.tone}`} data-approval-chip="">
          {chip.label}
        </span>
      ) : null}
    </div>
  );

  // The one line under the strip. A live pathway names the next saved step; a
  // finished or closed one names the saved state and, when the member owns it,
  // what to do next (demoting the card must not hide the one thing left to do).
  const nextSentence =
    status.currentStage !== 'complete'
      ? t(`next.${status.currentStage}.${status.stages[status.currentStage].nextKey}`)
      : null;

  return (
    <section
      aria-labelledby="member-approval-title"
      className={styles.root}
      data-approval-card={placement === 'demoted' ? 'demoted' : 'primary'}
    >
      {strip}
      <details className={styles.disclosure}>
        {/* Block summary (not flex) so the line wraps structurally at phone width. */}
        <summary className={`wa-kit-focus ${styles.summary}`}>
          <span className={styles.summaryHead}>
            <h2 id="member-approval-title" className={styles.label}>{t('title')}</h2>
            <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
          </span>
          {placement === 'demoted' ? (
            <>
              <span className={styles.line} data-approval-summary="">{summaryStatus}</span>
              {summaryAction ? (
                <span className={`${styles.line} ${styles.lineStrong}`} data-approval-summary-action="">{summaryAction}</span>
              ) : null}
            </>
          ) : (
            <span className={styles.line} data-approval-next="">{nextSentence ?? summaryStatus}</span>
          )}
        </summary>
        <div className={styles.panel}>
          {details}
          {dismissButton}
        </div>
      </details>
    </section>
  );
}
