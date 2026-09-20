import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import EmployerWorkQueueClient from '@/components/employer/EmployerWorkQueueClient';
import EmployerWorkflowTimeline from '@/components/employer/EmployerWorkflowTimeline';
import { getEmployerWorkQueueSlices } from '@/lib/employer/workQueue';
import { listEmployerWorkflowEvents } from '@/lib/portal/workflowEvents';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('employerWorkQueueMetaTitle'),
    description: t('employerWorkQueueMetaDesc'),
    path: '/employer/work-queue',
  });
}

export default async function EmployerWorkQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ focus?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/work-queue');

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const sp = (await searchParams) ?? {};
  const focusRaw = sp.focus;
  const initialFocus =
    focusRaw === 'review' || focusRaw === 'stale' || focusRaw === 'interview' ? focusRaw : 'all';

  const slices = await getEmployerWorkQueueSlices(ctx.employerId);
  const rawEvents = await listEmployerWorkflowEvents(ctx.employerId, 40);

  const events = rawEvents.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    kind: e.kind,
    headline: e.headline,
    detail: e.detail,
    actorName: e.actor?.fullName ?? null,
  }));

  const toApp = (a: (typeof slices.needsReviewTodayApps)[0]) => ({
    id: a.id,
    jobId: a.jobId,
    status: a.status,
    appliedAt: a.appliedAt.toISOString(),
    jobTitle: a.job.title,
    studentName: a.student.fullName,
    studentId: a.student.id,
  });

  const t = await getTranslations('employer');

  return (
    <PortalPageFrame>
      <EmployerPageOpener
        kicker={t('employerPortal')}
        title={t('workQueue')}
        subtitle={t('employerWorkQueueSubtitle')}
      />

      <div className="wa-pb-24 md:wa-pb-0 wa-space-y-6">
        <EmployerWorkQueueClient
          needsReviewTodayApps={slices.needsReviewTodayApps.map(toApp)}
          jobsAwaitingPublish={slices.jobsAwaitingPublish.map((j) => ({
            id: j.id,
            title: j.title,
            status: j.status,
            updatedAt: j.updatedAt.toISOString(),
          }))}
          staleApps={slices.staleApps.map(toApp)}
          interviewPending={slices.interviewPending.map(toApp)}
          initialFocus={initialFocus}
        />

        <EmployerWorkflowTimeline events={events} />
      </div>
    </PortalPageFrame>
  );
}
