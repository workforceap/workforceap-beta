import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import ReadinessCounselorClient from './ReadinessCounselorClient';
import PageHeader from '@/components/portal/PageHeader';
export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Readiness Checklist',
  description: 'Job readiness checklist.',
  path: '/admin/members',
});
}

export default async function AdminMemberReadinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { id } = await params;
  const member = await withAdminPageScope(scope, (db) =>
    db.user.findFirst({ where: { id } }),
  );

  if (!member || member.deletedAt) notFound();

  const program = member.enrolledProgram ? getProgramBySlug(member.enrolledProgram) : null;

  return (
    <div className="readiness-counselor-page">
      <PageHeader
        title={`Career Readiness Checklist — ${member.fullName}`}
        subtitle={`Program: ${member.enrolledProgram ? programDisplayTitle(member.enrolledProgram) : '—'}`}
        breadcrumbs={[
          { href: '/admin/members', label: 'Members' },
          { href: `/admin/members/${id}`, label: member.fullName },
          { label: 'Readiness checklist' },
        ]}
        action={
          <Link href={`/admin/members/${id}`} className="btn btn-outline btn-sm">
            Back to {member.fullName}
          </Link>
        }
      />
      <ReadinessCounselorClient
        memberId={id}
        memberName={member.fullName}
        programName={member.enrolledProgram ? programDisplayTitle(member.enrolledProgram) : '—'}
      />
    </div>
  );
}
