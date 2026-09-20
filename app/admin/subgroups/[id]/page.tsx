import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritLeaderOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import PageHeader from '@/components/portal/PageHeader';
import { memberProgramCompleted, memberProgramProgressPct } from '@/lib/partner/memberProgress';
import { getPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStudent } from '@/lib/pipeline/stage';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import SubgroupMembersTable from '@/components/admin/SubgroupMembersTable';

type Props = { params: Promise<{ id: string }> };

export default async function AdminSubgroupDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/subgroups');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const subgroup = await withAdminPageScope(scope, (db) => db.subgroup.findFirst({
    where: { id, ...inheritLeaderOrg(scope) },
    include: {
      leader: { select: { id: true, fullName: true, email: true } },
      partner: { select: { id: true, name: true } },
      members: {
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              email: true,
              enrolledProgram: true,
              courseEnrollments: {
                orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
                select: { programSlug: true, curriculumVersion: true, isPrimary: true },
              },
              enrolledAt: true,
              deletedAt: true,
              assessmentCompleted: true,
              placementRecord: {
                select: { employerName: true, jobTitle: true, salaryOffered: true, placedAt: true },
              },
              userCertifications: { select: { certName: true, earnedAt: true } },
              applications: { select: { status: true, submittedAt: true } },
              memberProgramProgress: {
                select: { programSlug: true, averagePercent: true, coursesCompleted: true },
              },
            },
          },
          assigner: { select: { fullName: true } },
        },
        orderBy: { assignedAt: 'desc' },
      },
    },
  }));

  if (!subgroup) notFound();

  const members = subgroup.members
    .filter((ms) => !ms.member.deletedAt)
    .map((ms) => {
      const m = ms.member;
      const assignment = resolveTrainingProgressAssignment(
        m.enrolledProgram,
        m.courseEnrollments,
      );
      const program = assignment.programSlug ? getProgramBySlug(assignment.programSlug) : null;
      const pct = memberProgramProgressPct({
        enrolledProgram: assignment.programSlug,
        curriculumVersion: assignment.curriculumVersion,
        coursesCompleted: null,
        liveProgress: m.memberProgramProgress,
      });
      const student: PipelineStudent = {
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        enrolledProgram: assignment.programSlug,
        curriculumVersion: assignment.curriculumVersion,
        enrolledAt: m.enrolledAt,
        assessmentCompleted: m.assessmentCompleted,
        deletedAt: m.deletedAt,
        placementRecord: m.placementRecord,
        userCertifications: m.userCertifications,
        applications: m.applications,
        memberProgramProgress: m.memberProgramProgress,
      };
      const stage = getPipelineStage(student);
      return {
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        enrolledProgram: assignment.programSlug ? programDisplayTitle(assignment.programSlug) : assignment.programSlug,
        enrolledAt: m.enrolledAt,
        progressPct: pct,
        stage: PIPELINE_STAGE_LABELS[stage],
        assignedAt: ms.assignedAt,
        assignmentType: ms.assignmentType,
        assignedBy: ms.assigner?.fullName ?? null,
      };
    });

  let completions = 0;
  let placements = 0;
  for (const m of subgroup.members.map((ms) => ms.member)) {
    if (m.deletedAt) continue;
    if (m.placementRecord) placements++;
    const assignment = resolveTrainingProgressAssignment(
      m.enrolledProgram,
      m.courseEnrollments,
    );
    if (memberProgramCompleted({
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
      coursesCompleted: null,
      liveProgress: m.memberProgramProgress,
    })) completions++;
  }

  return (
    <div style={{ paddingTop: '1.5rem' }}>
      <PageHeader
        breadcrumbs={[{ label: 'Subgroups', href: '/admin/subgroups' }, { label: 'Subgroup Details' }]}
        title={subgroup.name}
        subtitle={`${subgroup.type} · Leader: ${subgroup.leader.fullName}${subgroup.partner ? ` · Linked to ${subgroup.partner.name}` : ''}`}
        action={<Link href={`/admin/subgroups/${id}/edit`} className="btn btn-outline">Edit</Link>}
      />

      {subgroup.description && (
        <p style={{ marginBottom: '1.5rem', color: 'var(--color-on-surface-variant)', maxWidth: 600 }}>{subgroup.description}</p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        {[
          { label: 'Total members', value: members.length },
          { label: 'Enrolled', value: members.filter((m) => m.enrolledAt).length },
          { label: 'Completions', value: completions },
          { label: 'Placements', value: placements },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              padding: '1rem',
              borderRadius: '8px',
              background: 'var(--surface-container)',
            }}
          >
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Members</h2>
        <SubgroupMembersTable subgroupId={id} members={members} />
      </section>
    </div>
  );
}
