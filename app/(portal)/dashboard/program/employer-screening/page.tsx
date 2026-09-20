import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { buildPageMetadata } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import PageHeader from '@/components/portal/PageHeader';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { reconcileProgramProgress } from '@/lib/coursera/progressReconciliation';

export const metadata: Metadata = buildPageMetadata({
  title: 'Employer screening',
  description: 'Optional employer-designed questions near the end of your program.',
  path: '/dashboard/program/employer-screening',
});

type Question = { id: string; prompt: string; type: 'short_text' | 'yes_no' };

export default async function EmployerScreeningMemberPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/program/employer-screening');

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      enrolledProgram: true,
      courseEnrollments: {
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        take: 1,
        select: { programSlug: true, curriculumVersion: true },
      },
      courseProgress: {
        select: {
          programSlug: true,
          courseSlug: true,
          courseId: true,
          status: true,
          percentComplete: true,
        },
      },
    },
  });
  if (!dbUser) redirect('/dashboard/program');
  const activeEnrollment = dbUser.courseEnrollments[0] ?? null;
  const slug = activeEnrollment?.programSlug ?? dbUser.enrolledProgram;
  if (!slug) redirect('/dashboard/program');

  const program = getProgramBySlug(slug);
  const curriculumCourses = program
    ? getProgramCoursesForCurriculumVersion(
        program,
        activeEnrollment?.curriculumVersion ?? 'legacy-v1',
      )
    : [];
  const progressRows = dbUser.courseProgress.filter((row) =>
    programSlugsEquivalent(row.programSlug, slug),
  );
  const reconciliation = reconcileProgramProgress({
    validatedCourses: curriculumCourses,
    localRows: progressRows.map((row) => ({
      courseSlug: row.courseSlug,
      courseId: row.courseId,
      status: row.status,
      percentComplete: row.percentComplete,
    })),
  });
  const total = reconciliation.totalCourses;
  const done = reconciliation.completedCount;
  const nearComplete = total > 0 && reconciliation.programPercent >= 85;

  const pack = await prisma.employerScreeningPack.findFirst({
    where: { programSlug: slug, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!pack) notFound();

  const questions = (pack.questionsJson as unknown) as Question[];
  if (!Array.isArray(questions)) notFound();

  return (
    <>
      <div className="portal-pad-x" style={{ paddingBottom: '6rem', maxWidth: 720 }}>
        <PageHeader
          title="Employer screening pack"
          subtitle={
            nearComplete
              ? `${pack.packTitle} — shared by ${pack.employerLabel}. This is informational for hiring pipelines; it does not replace counselor guidance.`
              : `This pack becomes relevant closer to program completion (${done}/${total} courses done). You can preview the questions now.`
          }
          breadcrumbs={[
            { label: 'Member Portal', href: '/dashboard' },
            { label: 'My Program', href: '/dashboard/program' },
            { label: 'Employer screening' },
          ]}
        />
        <div
          style={{
            marginTop: '1.25rem',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-lg, 12px)',
            overflow: 'hidden',
          }}
        >
          <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {questions.map((q, i) => (
              <li
                key={q.id}
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  padding: '0.9rem 1rem',
                  borderBottom: i < questions.length - 1 ? '1px solid var(--outline-variant)' : 'none',
                }}
              >
                <span aria-hidden style={{ flexShrink: 0, minWidth: '1.4rem', fontWeight: 700, color: 'var(--color-on-surface-variant)' }}>
                  {i + 1}.
                </span>
                <div>
                  <p style={{ margin: 0, lineHeight: 1.55 }}>{q.prompt}</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                    {q.type.replace('_', ' ')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p style={{ margin: '1.25rem 0 0', fontSize: '0.88rem', color: 'var(--color-on-surface-variant)' }}>
          Your counselor may collect answers separately or add a digital form later — this page is the canonical list of what a partner employer asked us to surface.
        </p>
        <div style={{ marginTop: '1.5rem' }}>
          <Link href="/dashboard/program/start" className="btn btn-outline">
            Back to Path to certification
          </Link>
        </div>
      </div>    </>
  );
}
