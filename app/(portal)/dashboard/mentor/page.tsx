import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import PageHeader from '@/components/portal/PageHeader';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { formatPortalDateTime } from '@/lib/formatDate';
import { mentorSessionStatusLabel } from '@/lib/mentor/sessionStatusLabel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('mentorMetaTitle'),
    description: t('mentorMetaDesc'),
    path: '/dashboard/mentor',
  });
}

export default async function MentorDashboardPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/mentor');

  const mentor = await prisma.mentor.findUnique({
    where: { userId: user.id },
    include: {
      sessions: {
        where: { scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        include: { member: { select: { fullName: true } } },
      },
    },
  });

  if (!mentor) redirect('/mentor/apply');

  const sessionRows = (maxWidth: string) => (
    <div style={{ border: '1px solid var(--outline-variant)', borderRadius: '0.75rem', overflow: 'hidden', maxWidth }}>
      {mentor.sessions.map((s, i) => (
        <div
          key={s.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.75rem 0.9rem',
            borderBottom: i < mentor.sessions.length - 1 ? '1px solid var(--outline-variant)' : 'none',
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>{s.member.fullName}</div>
            <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>{formatPortalDateTime(s.scheduledAt)} · {mentorSessionStatusLabel(s.status)}</div>
          </div>
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--color-on-surface-variant)',
              whiteSpace: 'nowrap',
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ fontWeight: 600 }}>{s.durationMin} min</span>
          </div>
        </div>
      ))}
    </div>
  );

  const emptySessions = (
    <PortalEmptyState
      icon={
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '2rem', color: 'var(--wa-accent-text)' }}>
          calendar_month
        </span>
      }
      title="Nothing on the calendar yet"
      description="When a member requests a session with you, it'll show up here."
    />
  );

  return (
    <>
      <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0.5rem 1rem 0' }}>
        <PageHeader
          title="Mentor Dashboard"
          breadcrumbs={[{ label: 'Member Portal', href: '/dashboard' }, { label: 'Mentor Dashboard' }]}
        />
      </div>

      {/* Mobile */}
      <div className="md:wa-hidden" style={{ paddingBottom: '6rem', padding: '1rem' }}>
        <div style={{ marginTop: '0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '0.75rem', padding: '0.9rem' }}>
          <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>Total Hours Donated</div>
          <div style={{ fontSize: '1.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{mentor.totalHoursDonated.toFixed(1)}</div>
        </div>
        <h2 style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontWeight: 700, fontSize: '1.1rem' }}>Upcoming Sessions</h2>
        {mentor.sessions.length === 0 ? emptySessions : sessionRows('100%')}
        <Link
          href={`/api/mentor/letter?mentorId=${mentor.id}`}
          className="btn btn-primary"
          style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.1rem' }}>download</span>
          Download volunteer letter
        </Link>
      </div>

      {/* Desktop */}
      <div className="wa-hidden md:wa-block" style={{ padding: '0 1.5rem 1.5rem', maxWidth: '64rem', margin: '0 auto' }}>
        <div style={{ marginTop: '1rem', border: '1px solid var(--outline-variant)', borderRadius: '0.75rem', padding: '1rem', maxWidth: '16rem' }}>
          <div style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.95rem' }}>Total Hours Donated</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{mentor.totalHoursDonated.toFixed(1)}</div>
        </div>
        <h2 style={{ marginTop: '1.5rem', marginBottom: '0.65rem', fontWeight: 700, fontSize: '1.25rem' }}>Upcoming Sessions</h2>
        {mentor.sessions.length === 0 ? emptySessions : sessionRows('42rem')}
        <Link
          href={`/api/mentor/letter?mentorId=${mentor.id}`}
          className="btn btn-primary"
          style={{ marginTop: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1.1rem' }}>download</span>
          Download volunteer letter
        </Link>
      </div>
    </>
  );
}
