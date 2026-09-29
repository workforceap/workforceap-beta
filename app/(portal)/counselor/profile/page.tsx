import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadata } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import PageHeader from '@/components/portal/PageHeader';
import { counselorAffiliationDisplay } from '@/lib/counselor/counselorLabels';
import CounselorProfileForm from './CounselorProfileForm';

export const metadata: Metadata = buildPageMetadata({
  title: 'My counselor profile',
  description: 'Set up the name, phone, and title members see when you work with them.',
  path: '/counselor/profile',
});

/**
 * Counselor Profile setup (9/2/26, issue 10). Community Ambassadors are sent
 * here right after accepting their invitation.
 */
export default async function CounselorProfilePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/profile');

  const [counselorRole, adminRole] = await Promise.all([isCounselor(user.id), isAdmin(user.id)]);
  if (!counselorRole && !adminRole) redirect('/dashboard');

  const counselor = await prisma.counselor.findFirst({
    where: { userId: user.id, active: true },
    select: {
      id: true,
      title: true,
      affiliation: true,
      createdAt: true,
      partner: { select: { name: true } },
      user: { select: { fullName: true, email: true, phone: true } },
      _count: { select: { assignments: { where: { active: true } } } },
    },
  });

  const affiliationLabel = counselor
    ? counselorAffiliationDisplay(counselor.affiliation, counselor.partner?.name)
    : null;

  return (
    <div className="portal-pad-x" style={{ paddingBottom: '4rem' }}>
      <PageHeader
        title="My counselor profile"
        subtitle="This is how members and WorkforceAP staff see you. Keep it current."
        breadcrumbs={[{ label: 'Counselor portal', href: '/counselor' }, { label: 'My profile' }]}
      />

      {!counselor ? (
        <section className="portal-card portal-card--padded" style={{ maxWidth: 640 }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No counselor profile yet</h2>
          <p style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
            You are viewing this page as an admin without a counselor record. Counselors and Community
            Ambassadors get one automatically when they accept a counselor invitation.
          </p>
          <Link href="/admin/invites/new" className="btn btn-primary" style={{ marginTop: '0.75rem' }}>
            Invite a counselor
          </Link>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: '1.25rem', maxWidth: 640 }}>
          <section className="portal-card portal-card--padded">
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Your role</h2>
            <dl className="counselor-profile-facts">
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>Affiliation</dt>
              <dd style={{ fontWeight: 600 }}>{affiliationLabel}</dd>
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>Sign-in email</dt>
              <dd>{counselor.user.email}</dd>
              <dt style={{ color: 'var(--color-on-surface-variant)' }}>Members assigned to you</dt>
              <dd>
                {counselor._count.assignments}{' '}
                <Link href="/counselor/students" style={{ fontSize: '0.9rem' }}>
                  Open my members →
                </Link>
              </dd>
            </dl>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', marginTop: '0.75rem' }}>
              WorkforceAP staff assign members to you from the admin member page. Ask your WorkforceAP
              contact when a student you referred should be added to your list.
            </p>
          </section>

          <CounselorProfileForm
            initial={{
              fullName: counselor.user.fullName ?? '',
              phone: counselor.user.phone ?? '',
              title: counselor.title ?? '',
            }}
            isNew={!counselor.title && !counselor.user.phone}
          />
        </div>
      )}
    </div>
  );
}
