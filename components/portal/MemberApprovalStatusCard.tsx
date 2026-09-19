'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { VStack } from '@astryxdesign/core/VStack';
import { formatDate } from '@/lib/i18n/date';
import { isAppLocale, DEFAULT_LOCALE } from '@/lib/i18n/config';
import type { MemberApprovalStatus } from '@/lib/member/memberApprovalStatus';

export default function MemberApprovalStatusCard({ status }: { status: MemberApprovalStatus }) {
  const t = useTranslations('memberApproval');
  const locale = useLocale();
  const dateLabel = (date: string) => formatDate(date, isAppLocale(locale) ? locale : DEFAULT_LOCALE);
  return (
    <section aria-labelledby="member-approval-title" className="wa-mb-6">
      <Card>
        <VStack gap={3}>
          <h2 id="member-approval-title" className="wa-kit-stat-label">{t('title')}</h2>
          <p className="wa-text-sm wa-text-[var(--wa-muted)]">{t('intro')}</p>
          <dl className="wa-grid wa-gap-4 sm:wa-grid-cols-3">
            <VStack gap={1}>
              <dt className="wa-font-semibold">{t('application')}</dt>
              <dd>{t(`applicationStatus.${status.application}`)}</dd>
              {status.submittedAt && <dd><time dateTime={status.submittedAt}>{t('submitted', { date: dateLabel(status.submittedAt) })}</time></dd>}
            </VStack>
            <VStack gap={1}>
              <dt className="wa-font-semibold">{t('intake')}</dt>
              <dd>{t(`intakeStatus.${status.intake}`)}</dd>
              {status.reviewedAt && <dd><time dateTime={status.reviewedAt}>{t('reviewed', { date: dateLabel(status.reviewedAt) })}</time></dd>}
            </VStack>
            <VStack gap={1}>
              <dt className="wa-font-semibold">{t('training')}</dt>
              <dd>{t(`trainingStatus.${status.training}`)}</dd>
              {status.approvedAt && <dd><time dateTime={status.approvedAt}>{t('approvedAt', { date: dateLabel(status.approvedAt) })}</time></dd>}
            </VStack>
          </dl>
          <p className="wa-text-sm wa-text-[var(--wa-muted)]">{t('providerUnknown')}</p>
          <Link href="/dashboard/messages" className="wa-kit-focus wa-underline">{t('contact')}</Link>
        </VStack>
      </Card>
    </section>
  );
}
