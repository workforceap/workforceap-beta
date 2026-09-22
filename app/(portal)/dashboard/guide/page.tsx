import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getProgramBySlug } from '@/lib/content/programs';
import { programSlugsEquivalent } from '@/lib/content/programSlug';
import { prisma } from '@/lib/db/prisma';
import PageHeader from '@/components/portal/PageHeader';
import { StatusTag } from '@/components/portal/kit';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('guideMetaTitle'),
    description: t('guideMetaDesc'),
    path: '/dashboard/guide',
  });
}

const JOURNEY_STEPS = [
  {
    num: 1,
    title: 'Complete your profile',
    desc: 'Add your contact info, resume, and goals so WorkforceAP can tailor support to you.',
    href: '/dashboard/profile',
    cta: 'Build your profile',
    icon: 'person',
  },
  {
    num: 2,
    title: 'Complete your Training Preassessment',
    desc: 'This short assessment helps place you into the right training flow before Coursera unlocks.',
    href: '/dashboard/assessment',
    cta: 'Start preassessment',
    icon: 'assignment',
  },
  {
    num: 3,
    title: 'Start Coursera training',
    desc: 'Open your assigned Coursera courses and finish them in order. Completed Coursera courses show in My program and are not added to My Certificates automatically yet — add each certificate you earn there and our team verifies it before it counts as earned. Verified certificates are what employers see on your WorkforceAP record, and your cert progress is directly tied to job eligibility in the employer pipeline.',
    href: '/dashboard',
    cta: 'Open Training',
    icon: 'school',
  },
  {
    num: 4,
    title: 'Build job-ready materials',
    desc: 'Use AI help for your resume, elevator pitch, interview prep, and readiness planning while training is underway.',
    href: '/dashboard/ai-tools',
    cta: 'Open AI Career Tools',
    icon: 'auto_awesome',
  },
  {
    num: 5,
    title: 'Apply with counselor support',
    desc: 'Use your counselor, job board, and application tracker together so training turns into real opportunities.',
    href: '/dashboard/jobs',
    cta: 'Open jobs',
    icon: 'support_agent',
  },
];

const BENEFITS = [
  { icon: 'school', title: 'Coursera Access', desc: 'Access professional certificates from top institutions as part of your membership.' },
  { icon: 'auto_awesome', title: 'Job Search Tools', desc: '5 core tools for resume help, elevator pitches, readiness, voice interviews, and career coaching.' },
  { icon: 'person_pin', title: 'Your Counselor', desc: 'A human counselor is assigned to you — they want to hear from you.' },
  { icon: 'work', title: 'Job Board', desc: 'Browse openings from employers actively hiring WorkforceAP graduates.' },
];

const FAQS = [
  {
    q: 'How long does the program take?',
    a: 'Most members complete the core program in 4–8 weeks, but you can move at your own pace. There\'s no deadline.',
  },
  {
    q: 'What will this cost me?',
    a: 'WorkforceAP is available at no cost to members. Tools, resources, and counselor access are included through funded pathways.',
  },
  {
    q: 'When does job help start?',
    a: 'Job help starts before you finish everything. As you move through training, WorkforceAP helps you strengthen your resume, practice interviews, and prepare for applications. The strongest matches usually come after your profile, assessment, and early training progress are in place.',
  },
  {
    q: 'Who is my counselor and how do I reach them?',
    a: 'Your counselor is assigned when you enroll. You can message them directly from your dashboard under Messages.',
  },
  {
    q: 'What if I need help with something specific?',
    a: "Send a message to your counselor — they can help with anything from resume review to interview prep to job search strategy. That's what they're here for.",
  },
];

export default async function MemberGuidePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/guide');

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      fullName: true,
      enrolledProgram: true,
      assessmentCompleted: true,
      courseEnrollments: {
        orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
        take: 1,
        select: { programSlug: true, curriculumVersion: true },
      },
      courseProgress: {
        where: { status: 'COMPLETED' },
        select: { programSlug: true, courseSlug: true },
      },
      profile: { select: { city: true } },
    },
  });
  if (!dbUser) redirect('/login');

  const activeEnrollment = dbUser.courseEnrollments[0] ?? null;
  const enrolledProgram = activeEnrollment?.programSlug ?? dbUser.enrolledProgram ?? null;
  const program = enrolledProgram ? getProgramBySlug(enrolledProgram) : null;
  const curriculumCourses = program
    ? getProgramCoursesForCurriculumVersion(
        program,
        activeEnrollment?.curriculumVersion ?? 'legacy-v1',
      )
    : [];
  const curriculumCourseSlugs = new Set(curriculumCourses.map((course) => course.slug));
  const completedCourses = program && enrolledProgram
    ? new Set(
        dbUser.courseProgress
          .filter(
            (row) =>
              programSlugsEquivalent(row.programSlug, enrolledProgram) &&
              curriculumCourseSlugs.has(row.courseSlug),
          )
          .map((row) => row.courseSlug),
      ).size
    : 0;

  // Determine which step the member is on (0-indexed)
  const activeStep = !dbUser.profile?.city
    ? 0
    : !dbUser.assessmentCompleted
    ? 1
    : completedCourses === 0
    ? 2
    : 3;

  const firstName = dbUser.fullName?.split(' ')[0] ?? 'there';

  return (
    <>
    <div style={{ maxWidth: 'var(--max-width, 52rem)', margin: '0 auto', padding: '0 1rem 4rem' }}>
      <div style={{ marginTop: '1rem', marginBottom: '2.5rem' }}>
        <PageHeader
          title="Your WorkforceAP journey"
          subtitle={`Hey ${firstName} — here’s exactly how to get from enrolled to employed. Five steps. You can do this.`}
          breadcrumbs={[
            { label: 'Member Portal', href: '/dashboard' },
            { label: 'Member guide' },
          ]}
        />
      </div>

      {/* Journey Steps */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 className="wa-sr-only">Your five-step journey</h2>
        <div style={{ position: 'relative' }}>
          {/* Vertical connector line */}
          <div style={{
            position: 'absolute',
            left: '1.375rem',
            top: '2.5rem',
            bottom: '2.5rem',
            width: '2px',
            background: 'linear-gradient(to bottom, var(--color-accent), color-mix(in srgb, var(--color-accent) 20%, transparent))',
            opacity: 0.2,
          }} />

          {JOURNEY_STEPS.map((step, i) => {
            const isDone = i < activeStep;
            const isActive = i === activeStep;
            return (
              <div key={step.num} style={{
                display: 'flex',
                gap: '1.25rem',
                paddingBottom: '1.75rem',
                opacity: i > activeStep + 1 ? 0.5 : 1,
              }}>
                {/* Step indicator */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '2.75rem',
                    height: '2.75rem',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isDone
                      ? 'var(--color-accent)'
                      : isActive
                      ? 'var(--color-accent)'
                      : 'var(--surface-container-high)',
                    border: isActive ? '3px solid var(--color-accent)' : 'none',
                    boxShadow: isActive ? '0 0 0 4px color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'none',
                    position: 'relative',
                    zIndex: 1,
                    transition: 'all 0.2s',
                  }}>
                    {isDone ? (
                      <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: '1.125rem' }} aria-hidden="true">check</span>
                    ) : (
                      <span className="material-symbols-outlined" style={{ color: isActive ? '#fff' : 'var(--color-on-surface-variant)', fontSize: '1.125rem' }} aria-hidden="true">{step.icon}</span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div style={{
                  flex: 1,
                  background: isActive ? 'var(--surface-container-lowest)' : 'transparent',
                  border: isActive ? '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)' : '1px solid transparent',
                  borderRadius: '0.875rem',
                  padding: isActive ? '1.25rem' : '0.25rem 0',
                  transition: 'all 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
                    <span style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: isActive ? 'var(--color-accent)' : 'var(--color-on-surface-variant)',
                    }}>
                      Step {step.num}
                    </span>
                    {isDone && <StatusTag tone="ok">Done</StatusTag>}
                    {isActive && <StatusTag tone="alert">Up next</StatusTag>}
                  </div>
                  <h3 style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: isActive ? 'var(--color-on-surface)' : 'var(--color-on-surface)',
                    marginBottom: '0.5rem',
                    letterSpacing: '-0.01em',
                  }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6, marginBottom: isActive ? '1rem' : 0 }}>
                    {step.desc}
                  </p>
                  {isActive && (
                    <Link href={step.href} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.625rem 1.25rem',
                      background: 'var(--color-accent)',
                      color: 'var(--wa-on-accent-control)',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                      letterSpacing: '-0.01em',
                    }}>
                      {step.cta}
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">arrow_forward</span>
                    </Link>
                  )}
                  {!isActive && !isDone && (
                    <Link href={step.href} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: 'var(--color-on-surface-variant)',
                      textDecoration: 'none',
                      marginTop: '0.375rem',
                    }}>
                      {step.cta}
                      <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">arrow_forward</span>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Benefits */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 className="portal-section-heading">
          Everything included with your membership
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
          {BENEFITS.map((b) => (
            <div key={b.title} className="portal-card portal-card--flat" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '0.625rem',
                background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.25rem' }} aria-hidden="true">{b.icon}</span>
              </div>
              <div>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>{b.title}</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="portal-section-heading" style={{ marginBottom: '1.25rem' }}>
          Common questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {FAQS.map((faq) => (
            <div key={faq.q} className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
                {faq.q}
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.65 }}>
                {faq.a}
              </p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)', borderRadius: '0.875rem', border: '1px solid color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
          <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>
            Still have questions?
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
            Message your counselor — they&rsquo;re here to help with anything.{' '}
            <Link href="/dashboard/messages" style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}>
              Send a message →
            </Link>
          </p>
        </div>
      </section>
    </div>    </>
  );
}
