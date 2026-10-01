import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { notFound, redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { getMemberResumePlainText } from '@/lib/member/getMemberResumePlainText';
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
  return buildPageMetadataAsync({
  title: 'Session run',
  description: 'Build resume, cover letter, and interview prep with a member in one session.',
  path: '/admin/sessions',
});
}

type SearchParams = { sid?: string; fresh?: string };

/**
 * Admin mirror of /counselor/sessions/[memberId]/run. Stays in admin
 * chrome (sidebar, breadcrumbs) when admin opens an in-office session.
 * Same shared SessionRunClient — only the URL prefixes for
 * "Edit full profile" and "Back to sessions" differ.
 */
export default async function AdminSessionRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { memberId } = await params;
  const { sid, fresh } = await searchParams;

  const user = await getUser();
  if (!user) redirect(`/login?redirectTo=/admin/sessions/${memberId}/run`);
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const member = await withAdminPageScope(scope, (db) => db.user.findFirst({
    where: { id: memberId, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      enrolledProgram: true,
      programInterest: true,
    },
  }));
  if (!member) notFound();

  const originalResume = await getMemberResumePlainText(memberId, 8000, {
    originalOnly: true,
    readOnlyAudit,
  });
  const existingResume = originalResume || await getMemberResumePlainText(memberId, 8000, {
    enhancedOnly: true,
    readOnlyAudit,
  });

  // Session id: use one passed in URL, otherwise mint a new one and
  // round-trip so the URL always carries it.
  const sessionId = sid && /^[0-9a-f-]{36}$/i.test(sid)
    ? sid
    : readOnlyAudit
      ? '00000000-0000-4000-8000-000000000000'
      : randomUUID();
  if (sessionId !== sid && !readOnlyAudit) {
    redirect(`/admin/sessions/${memberId}/run?sid=${sessionId}${fresh === '1' ? '&fresh=1' : ''}`);
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
          { label: 'Admin', href: '/admin' },
          { label: 'Sessions', href: '/admin/sessions' },
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
        memberDetailHref={`/admin/members/${member.id}`}
        sessionsListHref="/admin/sessions"
      />
    </>
  );
}
