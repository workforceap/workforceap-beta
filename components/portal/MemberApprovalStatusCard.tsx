'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { StatusTag } from '@/components/portal/kit/StatusTag';
import { formatDate } from '@/lib/i18n/date';
import { isAppLocale, DEFAULT_LOCALE } from '@/lib/i18n/config';
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
 * Presentation (WAP-91 follow-up): `placement` comes from
 * `memberApprovalCardPlacement`. `primary` is the full card above the
 * dashboard, for a member with a live next step. `demoted` is the same facts
 * collapsed to one summary line, rendered below the dashboard content, for a
 * finished or closed pathway. Either can be dismissed; the dismissal is
 * stored per member and per status, so it lasts until the status moves, and
 * a quiet link keeps the member's own status one click away.
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
}: {
  status: MemberApprovalStatus;
  /** Member id — scopes the dismissal so a shared device never hides someone else's status. */
  storageUserId: string;
  placement?: MemberApprovalCardPlacement;
  counselorContext?: MemberCounselorContext | null;
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
      className="wa-kit-focus wa-text-sm wa-text-[var(--wa-muted)] wa-underline wa-bg-transparent wa-border-0 wa-cursor-pointer wa-self-start wa-min-h-[44px] wa-px-0"
    >
      {t('dismiss')}
    </button>
  );

  const stageList = (
    <ol className="wa-grid wa-gap-4 sm:wa-grid-cols-3 wa-list-none wa-m-0 wa-p-0">
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
          >
            <VStack gap={1}>
              <p className="wa-font-semibold wa-flex wa-items-center wa-gap-2 wa-flex-wrap">
                <span>{index + 1}. {t(stage)}</span>
                {isCurrent ? <StatusTag tone="info">{t('currentStep')}</StatusTag> : null}
              </p>
              <p>{statusText(stage)}</p>
              {dateLine(stage, view) ? <p className="wa-text-sm">{dateLine(stage, view)}</p> : null}
              {showNext && owner ? (
                <p className="wa-text-sm">{t('whoOwns', { owner })}</p>
              ) : null}
              {showNext ? (
                <p className="wa-text-sm wa-text-[var(--wa-muted)]">
                  {t('whatsNext', { text: t(`next.${stage}.${view.nextKey}`) })}
                </p>
              ) : null}
            </VStack>
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
    <div className="wa-text-sm" data-approval-reviewer={counselorContext.counselor ? 'assigned' : 'unassigned'}>
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
        <p className="wa-text-[var(--wa-muted)]" data-approval-wait-estimate="">
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
      {stageList}
      {reviewer}
      <p className="wa-text-sm wa-text-[var(--wa-muted)]">{t('providerUnknown')}</p>
      <Link href="/dashboard/messages" className="wa-kit-focus wa-underline">{t('contact')}</Link>
    </>
  );

  // ── Dismissed: one quiet line so nobody loses access to their own status ──
  if (dismissedAt === signature) {
    return (
      <section className="wa-mb-6" data-approval-card="dismissed">
        <button
          type="button"
          onClick={restore}
          className="wa-kit-focus wa-text-sm wa-text-[var(--wa-muted)] wa-underline wa-bg-transparent wa-border-0 wa-cursor-pointer wa-min-h-[44px] wa-px-0"
        >
          {t('restore')}
        </button>
      </section>
    );
  }

  // ── Demoted: nothing in flight, so one summary line below the dashboard ──
  if (placement === 'demoted') {
    return (
      <section aria-labelledby="member-approval-title" className="wa-mb-6" data-approval-card="demoted">
        <Card>
          <VStack gap={3}>
            <details>
              {/* Block summary (not flex) so the browser keeps its own
                  disclosure marker as the expand affordance. */}
              <summary className="wa-kit-focus wa-cursor-pointer wa-min-h-[44px]">
                {/* Title on the marker's line; the saved state and, when the
                    member owns it, the next step each get their own line, so
                    the phone-width wrap is structural instead of a run-on. */}
                <h2 id="member-approval-title" className="wa-kit-stat-label wa-m-0 wa-inline">{t('title')}</h2>
                <span className="wa-block wa-text-sm wa-text-[var(--wa-muted)]" data-approval-summary="">
                  {summaryStatus}
                </span>
                {summaryAction ? (
                  <span className="wa-block wa-text-sm" data-approval-summary-action="">{summaryAction}</span>
                ) : null}
              </summary>
              <VStack gap={3}>
                <p className="wa-text-sm wa-text-[var(--wa-muted)] wa-mt-3">
                  {status.currentStage === 'complete' ? t('introComplete') : t('intro')}
                </p>
                {details}
              </VStack>
            </details>
            {dismissButton}
          </VStack>
        </Card>
      </section>
    );
  }

  // ── Primary: a live next step keeps the card where it is ──
  return (
    <section aria-labelledby="member-approval-title" className="wa-mb-6" data-approval-card="primary">
      <Card>
        <VStack gap={3}>
          <h2 id="member-approval-title" className="wa-kit-stat-label">{t('title')}</h2>
          <p className="wa-text-sm wa-text-[var(--wa-muted)]">
            {status.currentStage === 'complete' ? t('introComplete') : t('intro')}
          </p>
          {details}
          {dismissButton}
        </VStack>
      </Card>
    </section>
  );
}
