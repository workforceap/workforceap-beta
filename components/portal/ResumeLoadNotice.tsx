'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';
import type { MemberResumeLoadStatus } from '@/lib/member/getMemberResumePlainText';

/**
 * Unknown resume state is never an upload instruction. Refreshing the current
 * route retains its selected view and mounted editor; it does not generate,
 * upload, or start a voice session. Audit-suppressed reads have no retry action.
 */
export function ResumeLoadNotice({
  status,
  headingAs = 'h2',
}: {
  status: MemberResumeLoadStatus | 'not-loaded';
  headingAs?: 'h2' | 'h3';
}) {
  const t = useTranslations('empty.resumeLoad');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (status === 'available' || status === 'absent') return null;

  const failed = status === 'unavailable';
  const copy = failed ? 'unavailable' : status === 'audit-suppressed' ? 'audit' : 'loading';

  return (
    <KitEmptyState
      framed
      kind="unavailable"
      tone={failed ? 'danger' : 'muted'}
      title={t(`${copy}.title`)}
      headingAs={headingAs}
      description={t(`${copy}.description`)}
      data-resume-load-status={status}
      aria-busy={isPending || status === 'not-loaded'}
      action={failed ? (
        <Button
          label={isPending ? t('retrying') : t('retry')}
          variant="primary"
          size="lg"
          isLoading={isPending}
          onClick={() => startTransition(() => router.refresh())}
          className="wa-kit-cta wa-kit-focus"
        />
      ) : undefined}
    />
  );
}
