import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { notFound, redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getMemberResumePlainText } from '@/lib/member/getMemberResumePlainText';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import PageHeader from '@/components/portal/PageHeader';
import CourseraProgressCard from '@/components/portal/CourseraProgressCard';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

const SessionRunClient = dynamic(() => import('@/components/portal/sessions/SessionRunClient'), {
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="portal-card portal-card--flat"
      style={{
        minHeight: 480,
        margin: '0 1rem 1rem',
        padding: '2.5rem 1.25rem',
        borderRadius: 12,
        textAlign: 'center',
        color: 'var(--color-on-surface-variant)',
        fontSize: '0.9rem',
        fontWeight: 600,
      }}
    >
      Loading session workspace…
    </div>
  ),
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('counselor');
  return buildPageMetadataAsync({
    title: t('sessionRunMetaTitle'),
    description: t('sessionRunMetaDesc'),
    path: '/counselor/sessions',
  });
}

type SearchParams = { sid?: string; fresh?: string };

export default async function SessionRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { memberId } = await params;
  const { sid, fresh } = await searchParams;
  const t = await getTranslations('counselor');

  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=/counselor/sessions/${memberId}/run`);
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const [counselorRole, adminRole, superAdminRole] = await Promise.all([
    isCounselor(user.id),
    isAdmin(user.id),
    isSuperAdmin(user.id),
  ]);
  // Admins who aren't counselors belong in admin chrome — redirect with params intact
  if (!counselorRole) {
    if (adminRole || superAdminRole) {
      const qs = new URLSearchParams();
      if (sid) qs.set('sid', sid);
      if (fresh === '1') qs.set('fresh', '1');
      const qsStr = qs.toString();
      redirect(`/admin/sessions/${memberId}/run${qsStr ? `?${qsStr}` : ''}`);
    }
    redirect('/dashboard');
  }

  if (!(await assertStaffCanAccessMemberRecord(user.id, memberId))) {
    redirect('/counselor/students?error=not-assigned-to-member');
  }

  const member = await prisma.user.findUnique({
    where: { id: memberId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      enrolledProgram: true,
      programInterest: true,
    },
  });
  if (!member) notFound();

  // Rewriter must start from the member's original, while the other session
  // tools may still use an enhanced draft as context when the original is
  // unavailable or cannot be extracted.
  const originalResume = await getMemberResumePlainText(memberId, 8000, {
    originalOnly: true,
    readOnlyAudit,
  });
  const existingResume = originalResume || await getMemberResumePlainText(memberId, 8000, {
    preferOriginal: true,
    readOnlyAudit,
  });

  // Session id: use one passed in URL, otherwise mint a new one. Either way
  // the client will keep using whatever is in the URL.
  const sessionId = sid && /^[0-9a-f-]{36}$/i.test(sid)
    ? sid
    : readOnlyAudit
      ? '00000000-0000-4000-8000-000000000000'
      : randomUUID();
  if (sessionId !== sid && !readOnlyAudit) {
    redirect(`/counselor/sessions/${memberId}/run?sid=${sessionId}${fresh === '1' ? '&fresh=1' : ''}`);
  }

  return (
    <>
      {readOnlyAudit && (
        <span hidden data-portal-audit-suppressed="session-resume-coursera-provider-and-session-redirect" />
      )}
      <PageHeader
        title={`Session with ${member.fullName ?? member.email}`}
        subtitle={
          fresh === '1'
            ? `Account just created. Walk through profile → resume → cover letter → interview prep, then click End session to email everything to ${member.email}.`
            : `Continuing in-office session. Outputs save to ${member.fullName?.split(' ')[0] ?? 'their'} portal as you go.`
        }
        breadcrumbs={[
          { label: t('counselor'), href: '/counselor' },
          { label: t('inOfficeSessions'), href: '/counselor/sessions' },
          { label: member.fullName ?? member.email },
        ]}
      />
      <div style={{ padding: '0 1rem', marginBottom: '1rem' }}>
        <CourseraProgressCard userId={member.id} readOnlyAudit={readOnlyAudit} />
      </div>
      <SessionRunClient
        key={member.id}
        memberId={member.id}
        memberFullName={member.fullName ?? member.email}
        memberEmail={member.email}
        memberPhone={member.phone}
        memberTargetRole={member.programInterest ?? null}
        sessionId={sessionId}
        existingResume={existingResume}
        originalResume={originalResume}
        isFreshWalkIn={fresh === '1'}
      />
    </>
  );
}
