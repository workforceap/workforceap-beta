import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BookOpen, BriefcaseBusiness, MessageCircle, Mic2 } from 'lucide-react';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { programSlugReadCandidates, programSlugsEquivalent } from '@/lib/content/programSlug';
import { resolveWorkforceApModule } from '@/lib/content/workforceApModule';
import { isUngatedDigitalLiteracyProgram } from '@/shared/digitalLiteracyPathway';
import { DesignSurface, PageOpener, StatusTag } from '@/components/portal/kit';
import WorkforceApModuleCompleteButton from '@/components/portal/WorkforceApModuleCompleteButton';
import WorkforceApModuleLessons from '@/components/portal/WorkforceApModuleLessons';

export const metadata: Metadata = {
  title: 'WorkforceAP Lab',
  description: 'Complete an approved WorkforceAP applied-learning lab.',
};

type Props = {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ program?: string }>;
};

const LAB_ACTIONS = [
  {
    href: '/dashboard/missions',
    title: 'Build an applied artifact',
    detail: 'Use Skill Missions to turn the work into evidence you can show.',
    icon: BookOpen,
  },
  {
    href: '/dashboard/resume',
    title: 'Add the work to your resume',
    detail: 'Translate the project into an outcome-focused resume bullet.',
    icon: BriefcaseBusiness,
  },
  {
    href: '/dashboard/ai-tools/interview-prep',
    title: 'Practice explaining your work',
    detail: 'Prepare a concise interview story about what you built and learned.',
    icon: Mic2,
  },
  {
    href: '/dashboard/messages',
    title: 'Ask for feedback',
    detail: 'Send your counselor the artifact or question before you finish.',
    icon: MessageCircle,
  },
] as const;

export default async function WorkforceApModulePage({ params, searchParams }: Props) {
  const user = await getUser();
  const { courseSlug } = await params;
  const { program: requestedProgram = '' } = await searchParams;
  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/dashboard/learning/modules/${courseSlug}?program=${requestedProgram}`)}`);
  }
  if (!courseSlug || !requestedProgram) notFound();

  // Digital literacy is ungated: any signed-in member may open its modules
  // without a program enrollment. All other programs still require enrollment.
  const ungatedProgram = isUngatedDigitalLiteracyProgram(requestedProgram);

  let resolvedProgramSlug = requestedProgram;
  let curriculumVersion = '';
  if (!ungatedProgram) {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: {
        userId: user.id,
        programSlug: { in: programSlugReadCandidates(requestedProgram) },
      },
      select: {
        programSlug: true,
        curriculumVersion: true,
        isPrimary: true,
      },
    });
    const enrollment = enrollments.find((row) => row.programSlug === requestedProgram)
      ?? enrollments.find((row) => row.isPrimary)
      ?? enrollments.find((row) => programSlugsEquivalent(row.programSlug, requestedProgram));
    if (!enrollment) notFound();
    resolvedProgramSlug = enrollment.programSlug;
    curriculumVersion = enrollment.curriculumVersion;
  }

  const course = resolveWorkforceApModule({
    programSlug: resolvedProgramSlug,
    curriculumVersion,
    courseSlug,
  });
  if (!course) notFound();

  const hasLessons = Boolean(course.lessons && course.lessons.length > 0);
  const lessonMinutes = (course.lessons ?? []).reduce((sum, lesson) => sum + lesson.minutes, 0);

  const completion = await prisma.courseProgress.findFirst({
    where: {
      userId: user.id,
      programSlug: { in: programSlugReadCandidates(resolvedProgramSlug) },
      courseSlug,
      status: 'COMPLETED',
    },
    select: { id: true },
  });

  return (
    <DesignSurface surface="warm">
      <main style={{ maxWidth: 960, margin: '0 auto', padding: 'var(--wa-pad-sm)', paddingBottom: '5rem' }}>
        <PageOpener
          kicker={hasLessons ? `${course.provider?.name ?? 'WorkforceAP'} module` : 'WorkforceAP applied lab'}
          title={course.name}
          lede={hasLessons ? course.description?.split(' Covers:')[0] : course.description}
          icon={<BookOpen size={14} aria-hidden="true" />}
          action={
            <StatusTag tone={completion ? 'ok' : 'warn'}>
              {completion ? 'Complete' : hasLessons ? `${lessonMinutes} min of lessons` : `${course.estimatedHours} hours`}
            </StatusTag>
          }
        />

        {hasLessons ? (
          <section className="wa-kit-card" style={{ marginTop: 24, padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Open course pages and materials</h2>
            <p style={{ margin: '8px 0 16px', color: 'var(--wa-muted)', lineHeight: 1.6 }}>
              These links open on {course.provider?.name ?? 'the provider site'} in a new tab. Access is free and a provider account is optional.
              {course.provider?.languageNote ? ` ${course.provider.languageNote}` : ''} WorkforceAP does not receive provider-side activity.
            </p>
            <WorkforceApModuleLessons lessons={course.lessons ?? []} />
            {course.topics?.length ? (
              <>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: '20px 0 8px' }}>What you will practice</h3>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--wa-text)', lineHeight: 1.55 }}>
                  {course.topics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {course.provider ? (
              <div
                role="note"
                aria-label="Provider attribution and license"
                style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--wa-border)', fontSize: 13, color: 'var(--wa-muted)', lineHeight: 1.55 }}
              >
                <strong style={{ color: 'var(--wa-text)' }}>Provider and license.</strong>{' '}
                {course.provider.attribution ?? `Linked material is provided by ${course.provider.name}.`}{' '}
                {course.provider.license ? (
                  <>
                    DigitalLearn identifies its course content as{' '}
                    <a href={course.provider.license.url} target="_blank" rel="noopener noreferrer">
                      {course.provider.license.name}
                    </a>
                    {course.provider.license.termsUrl ? (
                      <>
                        {' '}(<a href={course.provider.license.termsUrl} target="_blank" rel="noopener noreferrer">provider terms</a>)
                      </>
                    ) : null}
                    . WorkforceAP links to the original pages and does not copy, host, adapt, or imply endorsement of provider videos.
                  </>
                ) : null}
                <span style={{ display: 'block', marginTop: 6 }}>
                  Need another route? Browse the{' '}
                  <a href={course.provider.url} target="_blank" rel="noopener noreferrer">
                    {course.provider.name} course index
                  </a>
                  .
                </span>
              </div>
            ) : null}
          </section>
        ) : null}

        {hasLessons ? (
          <section className="wa-kit-card" style={{ marginTop: 24, padding: 24 }} aria-labelledby="workforceap-completion-heading">
            <h2 id="workforceap-completion-heading" style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
              WorkforceAP completion record
            </h2>
            <p style={{ margin: '8px 0 0', color: 'var(--wa-muted)', lineHeight: 1.6 }}>
              Return here after finishing the linked material. Marking this module complete records WorkforceAP progress, points, and counselor-visible completion. It does not verify DigitalLearn activity or issue a DigitalLearn certificate.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              <Link href="/dashboard/certifications">View your WorkforceAP completion and certificate records</Link>
            </p>
          </section>
        ) : null}

        <section className="wa-kit-card" style={{ marginTop: 24, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{hasLessons ? 'Keep your learning moving' : 'Complete the applied work'}</h2>
          <p style={{ margin: '8px 0 20px', color: 'var(--wa-muted)', lineHeight: 1.6 }}>
            {hasLessons
              ? 'Use these optional WorkforceAP tools to practice, document, and discuss what you learned.'
              : 'Work through these portal tools, keep your project evidence, and mark the lab complete when your required work is finished.'}
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {LAB_ACTIONS.map(({ href, title, detail, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="portal-card portal-card--flat"
                style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start', textDecoration: 'none' }}
              >
                <Icon size={20} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--wa-accent-text)' }} />
                <span>
                  <strong style={{ display: 'block', color: 'var(--wa-text)' }}>{title}</strong>
                  <span style={{ display: 'block', marginTop: 3, color: 'var(--wa-muted)', lineHeight: 1.45 }}>{detail}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <WorkforceApModuleCompleteButton
            courseSlug={courseSlug}
            programSlug={resolvedProgramSlug}
            completed={Boolean(completion)}
            label={hasLessons ? 'Mark module complete in WorkforceAP' : 'Mark lab complete'}
            completedLabel={hasLessons ? 'Completed in WorkforceAP' : 'Completed'}
          />
          <Link href="/dashboard/learning" className="btn btn-outline">Back to Learning Hub</Link>
        </div>
      </main>
    </DesignSurface>
  );
}
