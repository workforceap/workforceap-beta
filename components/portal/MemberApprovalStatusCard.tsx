'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { StatusTag } from '@/components/portal/kit/StatusTag';
import { formatDate } from '@/lib/i18n/date';
import { isAppLocale, DEFAULT_LOCALE } from '@/lib/i18n/config';
import type {
  ApprovalStageKey,
  MemberApprovalStage,
  MemberApprovalStatus,
} from '@/lib/member/memberApprovalStatus';

const STAGE_ORDER: ApprovalStageKey[] = ['application', 'intake', 'training'];

/**
 * Three-stage approval chain (application → intake review → training
 * approval). Every line is a saved fact: the state, the date that state was
 * recorded, who owns the next move and what happens next. Stages without a
 * stored start date say so instead of guessing one.
 */
export default function MemberApprovalStatusCard({ status }: { status: MemberApprovalStatus }) {
  const t = useTranslations('memberApproval');
  const locale = useLocale();
  const dateLabel = (date: string) => formatDate(date, isAppLocale(locale) ? locale : DEFAULT_LOCALE);

  const statusText = (stage: ApprovalStageKey) => {
    if (stage === 'application') return t(`applicationStatus.${status.application}`);
    if (stage === 'intake') return t(`intakeStatus.${status.intake}`);
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
        return t('ownerCounselor', { name: status.counselorName ?? '' });
      case 'staff':
        return t('ownerStaff');
      default:
        return null;
    }
  };

  return (
    <section aria-labelledby="member-approval-title" className="wa-mb-6">
      <Card>
        <VStack gap={3}>
          <h2 id="member-approval-title" className="wa-kit-stat-label">{t('title')}</h2>
          <p className="wa-text-sm wa-text-[var(--wa-muted)]">
            {status.currentStage === 'complete' ? t('introComplete') : t('intro')}
          </p>
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
          <p className="wa-text-sm wa-text-[var(--wa-muted)]">{t('providerUnknown')}</p>
          <Link href="/dashboard/messages" className="wa-kit-focus wa-underline">{t('contact')}</Link>
        </VStack>
      </Card>
    </section>
  );
}
