import { recapCalendarDateKey } from '@/lib/recap/weekLabel';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import PageHeader from '@/components/portal/PageHeader';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import MotivatingRecapClient, { type MotivatingRecapData } from './MotivatingRecapClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('weeklyRecapMetaTitle'),
    description: t('weeklyRecapMetaDesc'),
    path: '/dashboard/weekly-recap',
  });
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export default async function WeeklyRecapPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/weekly-recap');

  const weekStart = getWeekStart(new Date());
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  const t = await getTranslations('dashboard');
  const { generateWeeklyRecap } = await import('@/lib/recap/generate');
  let recap: Awaited<ReturnType<typeof generateWeeklyRecap>> | null = null;
  let generationError = false;
  try {
    recap = readOnlyAudit
      ? await prisma.weeklyRecap.findUnique({
          where: { userId_weekStartDate: { userId: user.id, weekStartDate: weekStart } },
        })
      : await generateWeeklyRecap(user.id, weekStart);
  } catch (e) {
    generationError = true;
    console.error('[WeeklyRecapPage] recap load failed', e);
  }

  if (!readOnlyAudit && recap && !recap.openedAt) {
    try {
      await prisma.weeklyRecap.update({
        where: { id: recap.id },
        data: { openedAt: new Date() },
      });
    } catch (e) {
      console.error('[WeeklyRecapPage] openedAt update failed', e);
    }
  }

  const recapData = (recap?.recapJson ?? null) as MotivatingRecapData;

  return (
    <>
      <div style={{ paddingBottom: '5rem' }}>
        {readOnlyAudit && <span hidden data-portal-audit-suppressed="weekly-recap-generate-and-open" />}
        <PageHeader
          title="Weekly Recap"
          subtitle="Celebrate your wins, see your goal progress, and get a clear plan for the week ahead."
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Weekly Recap' }]}
        />
        {recap === null ? (
          <div
            {...(generationError ? { 'data-portal-error-state': 'weekly-recap-load-failed' } : {})}
            style={{ maxWidth: '32rem', margin: '0 auto', padding: '0 1rem' }}
          >
            <PortalEmptyState
              icon={
                <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--wa-accent-text)', fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                  calendar_month
                </span>
              }
              title={generationError ? 'Unable to load your recap' : 'Your recap isn’t ready yet'}
              description={
                generationError
                  ? 'Something went wrong generating your recap. Please try again in a moment.'
                  : 'Check back after your next activity, or head to your dashboard to keep the momentum going.'
              }
              primaryAction={{ href: '/dashboard', label: 'Go to dashboard' }}
            />
          </div>
        ) : (
          <MotivatingRecapClient
            recap={recap}
            recapData={recapData}
            weekStart={recapCalendarDateKey(weekStart)}
            openGoalsLabel={t('weeklyRecapOpenGoals')}
          />
        )}
      </div>    </>
  );
}
