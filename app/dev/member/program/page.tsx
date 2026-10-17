import { notFound } from 'next/navigation';
import { GraduationCap, BookOpen } from 'lucide-react';
import { PROGRAMS } from '@/lib/content/programs';
import ProgramPicker from '@/components/portal/ProgramPicker';
import { DesignSurface, PageOpener, StatusTag } from '@/components/portal/kit';
import { MemberProgramKit } from '@/components/portal/kit/pages/member/MemberProgramKit';
import { MemberTrainingWorkspace } from '@/components/portal/kit/pages/member/MemberTrainingWorkspace';
import WorkforceApModuleLessons from '@/components/portal/WorkforceApModuleLessons';
import WorkforceApModuleCompleteButton from '@/components/portal/WorkforceApModuleCompleteButton';
import { DIGITAL_LITERACY_MODULES } from '@/shared/digitalLiteracyPathway';
import type { TrainingWorkspace } from '@/lib/member/trainingWorkspace';

/**
 * Storybook-lite showcase — MemberProgramKit (module progress + live session
 * + missions). Preview-only, no auth/DB. See app/dev/dashboard/page.tsx for
 * the pattern.
 *   /dev/member/program            — enrolled path
 *   /dev/member/program?state=empty — choose-your-program picker (preview)
 *   /dev/member/program?state=workspace — training overview + Continue this course
 *   /dev/member/program?state=lessons — DigitalLearn lesson CTAs (WAP-127)
 */
export const dynamic = 'force-dynamic';

const PREVIEW_PROGRAMS = ['it-cyber', 'ai-software', 'healthcare']
  .map((category) => PROGRAMS.find((p) => p.category === category))
  .filter((p): p is (typeof PROGRAMS)[number] => Boolean(p));

const PREVIEW_WORKSPACE: TrainingWorkspace = {
  programSlug: 'aws-cloud-practitioner',
  programTitle: 'AWS Certified Cloud Practitioner Certificate',
  curriculumVersion: 'preview-v1',
  weeklyHours: 10,
  planStartDate: '2026-09-01',
  planUpdatedAt: '2026-09-01T12:00:00.000Z',
  totalEstimatedHours: 12,
  publishedSyllabusHours: 12,
  courses: [
    {
      slug: 'cloud-concepts',
      name: 'Cloud Concepts',
      estimatedHours: 4,
      description: 'Start with the shared-responsibility model and core AWS services.',
      kind: 'coursera',
      notes: '',
      artifactUrl: null,
      updatedAt: null,
    },
    {
      slug: 'shared-responsibility',
      name: 'Shared Responsibility Model',
      estimatedHours: 8,
      description: 'Apply the model to a sample workload.',
      kind: 'workforceap',
      notes: '',
      artifactUrl: null,
      updatedAt: null,
    },
  ],
};

export default async function DevMemberProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { state } = await searchParams;
  if (state === 'lessons') {
    const previewModule = DIGITAL_LITERACY_MODULES[0];
    return (
      <DesignSurface surface="warm">
        <main style={{ maxWidth: 960, margin: '0 auto', padding: 'var(--wa-pad-sm)', paddingBottom: '5rem' }}>
          <PageOpener
            kicker="DigitalLearn module"
            title={previewModule.name}
            lede={previewModule.summary}
            icon={<BookOpen size={14} aria-hidden="true" />}
            action={<StatusTag tone="warn">{previewModule.lessons.reduce((sum, lesson) => sum + lesson.minutes, 0)} min of lessons</StatusTag>}
          />
          <section className="wa-kit-card" style={{ marginTop: 24, padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Open course pages and materials</h2>
            <p style={{ margin: '8px 0 16px', color: 'var(--wa-muted)', lineHeight: 1.6 }}>
              These links open on DigitalLearn in a new tab. Access is free and a provider account is optional.
            </p>
            <WorkforceApModuleLessons
              lessons={[
                ...DIGITAL_LITERACY_MODULES[0].lessons,
                ...DIGITAL_LITERACY_MODULES[2].lessons,
              ]}
            />
          </section>
          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <WorkforceApModuleCompleteButton
              courseSlug="digital-literacy-empowerment-class-course-1"
              programSlug="digital-literacy-empowerment-class"
              completed={false}
              label="Mark module complete in WorkforceAP"
            />
          </div>
        </main>
      </DesignSurface>
    );
  }

  if (state === 'empty') {
    return (
      <DesignSurface surface="warm">
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
          <PageOpener
            kicker="Program"
            title="Choose your program"
            lede="Funding covers one program at a time. Your counselor can help you switch later."
            icon={<GraduationCap size={13} aria-hidden="true" />}
          />
          <ProgramPicker programs={PREVIEW_PROGRAMS} preview />
        </div>
      </DesignSurface>
    );
  }

  if (state === 'workspace') {
    return (
      <MemberTrainingWorkspace
        workspace={PREVIEW_WORKSPACE}
        programTitle={PREVIEW_WORKSPACE.programTitle}
        completedSlugs={[]}
        destinations={[
          { slug: 'cloud-concepts', moduleHref: '/dev/member/program' },
          { slug: 'shared-responsibility', moduleHref: '/dev/member/program' },
        ]}
        initialCourseSlug="cloud-concepts"
        syllabusHours={12}
        syllabusBreakdown="12 assigned hours across two courses."
      />
    );
  }

  return (
    <MemberProgramKit
      programTitle="AWS Cloud Practitioner"
      progressPercent={78}
      modulesComplete={7}
      modulesTotal={9}
      estRemaining="25 minutes remaining"
      resumeHref="/dev/member/program?state=lessons"
      advisor={{ name: 'Dana Reyes', firstName: 'Dana', messagingHref: '/dev/member/messages' }}
      nextLesson="Shared Responsibility Model"
      nextLessonDue="Due Thursday"
      pointsThisWeek={85}
      certsThisWeek={2}
      toolkitHref="/dev/member/ai-tools"
      resumeStudioHref="/dev/member/resume-studio"
      interviewHref="/dev/member/interview-practice"
      lessons={[
        { title: 'Lesson 1: Introduction to cloud security', state: 'done', meta: '5 min · Overview' },
        { title: 'Lesson 2: Customer vs provider responsibilities', state: 'active', meta: '9 min · Concept check' },
        { title: 'Lesson 3: Controls and encryption', state: 'upcoming' },
        { title: 'Lesson 4: Scenario knowledge check', state: 'upcoming', meta: '5 min · Quiz' },
      ]}
      modules={[
        { title: 'Cloud Concepts Overview', state: 'done', slug: 'cloud-concepts' },
        { title: 'Cloud Economics and Billing Framework', state: 'done', slug: 'cloud-economics' },
        { title: 'AWS Global Infrastructure Basics', state: 'done', slug: 'infrastructure' },
        { title: 'Core Compute Services — EC2 and Lambda', state: 'done', slug: 'compute' },
        { title: 'Storage and Delivery Essentials', state: 'done', slug: 'storage' },
        { title: 'Networking, VPC and Content Delivery', state: 'done', slug: 'networking' },
        { title: 'Cloud Security and Identity Access (IAM)', state: 'done', slug: 'security-iam' },
        { title: 'Shared Responsibility Model', state: 'active', slug: 'shared-responsibility', moduleHref: '/dev/member/program?state=lessons' },
        { title: 'Billing and Pricing Basics', state: 'locked', slug: 'billing-pricing' },
      ]}
      liveSessionTitle="Advisor check-in"
      liveSessionWhen="Thu, Jul 9 · 10:00 AM CT"
      liveSessionStart="2026-07-09T15:00:00.000Z"
      liveSessionDurationMinutes={30}
      missionsSummary="3 missions ready on this path."
      missionsHref="/dev/member/missions"
    />
  );
}
