import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BookOpen, BriefcaseBusiness, MessageCircle, Mic2 } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { programSlugReadCandidates, programSlugsEquivalent } from '@/lib/content/programSlug';
import { resolveWorkforceApModule } from '@/lib/content/workforceApModule';
import {
  DIGITAL_LITERACY_MODULES,
  DIGITAL_LITERACY_PROGRAM_SLUG,
  digitalLiteracyModuleCatalogProvider,
  digitalLiteracyProviderCatalogHref,
  isUngatedDigitalLiteracyProgram,
} from '@/shared/digitalLiteracyPathway';
import { DesignSurface, PageOpener, StatusTag } from '@/components/portal/kit';
import WorkforceApModuleCompleteButton from '@/components/portal/WorkforceApModuleCompleteButton';
import WorkforceApModuleLessons from '@/components/portal/WorkforceApModuleLessons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workforceApModule');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

type Props = {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ program?: string }>;
};

const LAB_ACTIONS = [
  {
    href: '/dashboard/missions',
    key: 'artifact',
    icon: BookOpen,
  },
  {
    href: '/dashboard/resume',
    key: 'resume',
    icon: BriefcaseBusiness,
  },
  {
    href: '/dashboard/ai-tools/interview-prep',
    key: 'interview',
    icon: Mic2,
  },
  {
    href: '/dashboard/messages',
    key: 'feedback',
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

  const resolvedCourse = resolveWorkforceApModule({
    programSlug: resolvedProgramSlug,
    curriculumVersion,
    courseSlug,
  });
  if (!resolvedCourse) notFound();
  // The portal language switch persists wap-locale and reloads the route.
  // Read that same next-intl locale for lesson copy and provider destinations.
  const [locale, t] = await Promise.all([getLocale(), getTranslations('workforceApModule')]);
  const digitalModule = resolvedProgramSlug === DIGITAL_LITERACY_PROGRAM_SLUG
    ? DIGITAL_LITERACY_MODULES.find((_, index) => courseSlug === `${DIGITAL_LITERACY_PROGRAM_SLUG}-course-${index + 1}`)
    : null;
  const spanishModule = locale === 'es' && digitalModule
    ? {
      name: t(`modules.${digitalModule.key}.name`),
      summary: t(`modules.${digitalModule.key}.summary`),
      topics: digitalModule.topics.map((_, index) => t(`modules.${digitalModule.key}.topics.${index}`)),
      lessons: digitalModule.lessons.map((_, index) => t(`modules.${digitalModule.key}.lessons.${index}`)),
    }
    : null;
  const catalogProvider = digitalModule ? digitalLiteracyModuleCatalogProvider(digitalModule.key) : 'digitallearn';
  const course = spanishModule ? {
    ...resolvedCourse,
    name: spanishModule.name,
    description: spanishModule.summary,
    topics: spanishModule.topics,
    // The provider has separate English/Spanish course records. Its supported
    // language entry opens the correct catalog; it does not translate an
    // English course slug. Say "catalog" and let the member select the topic.
    lessons: resolvedCourse.lessons?.map((lesson, index) => ({
      ...lesson,
      title: spanishModule.lessons[index],
      url: digitalLiteracyProviderCatalogHref('es', catalogProvider),
      destinationKind: 'language-course-catalog' as const,
      verificationLabel: t('catalogNote', { title: spanishModule.lessons[index] }),
      ctaLabel: t(catalogProvider === 'att' ? 'attCatalog' : 'digitalLearnCatalog'),
      referrerPolicy: 'no-referrer' as const,
      fallbackUrl: undefined,
      fallbackLabel: undefined,
    })),
    provider: resolvedCourse.provider ? {
      ...resolvedCourse.provider,
      url: digitalLiteracyProviderCatalogHref('es', 'digitallearn'),
    } : undefined,
  } : resolvedCourse;

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
          kicker={hasLessons ? t('providerModule', { provider: course.provider?.name ?? 'WorkforceAP' }) : t('appliedLab')}
          title={course.name}
          lede={hasLessons ? course.description?.split(' Covers:')[0] : course.description}
          icon={<BookOpen size={14} aria-hidden="true" />}
          action={
            <StatusTag tone={completion ? 'ok' : 'warn'}>
              {completion ? t('complete') : hasLessons ? t('lessonMinutes', { minutes: lessonMinutes }) : t('hours', { hours: course.estimatedHours })}
            </StatusTag>
          }
        />

        {hasLessons ? (
          <section className="wa-kit-card" style={{ marginTop: 24, padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{t('lessonsHeading')}</h2>
            <p style={{ margin: '8px 0 16px', color: 'var(--wa-muted)', lineHeight: 1.6 }}>
              {t('lessonsIntro', { provider: course.provider?.name ?? 'DigitalLearn.org' })}{' '}
              {t('activityBoundary')}
            </p>
            {digitalModule ? (
              <>
                {!spanishModule || catalogProvider === 'digitallearn' ? (
                  <>
                    <a
                      href={digitalLiteracyProviderCatalogHref(locale === 'es' ? 'es' : 'en')}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                      className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
                    >
                      {t('attCatalog')}
                    </a>
                    <p className="wa-kit-meta" style={{ marginTop: 8 }}>{t('attCatalogNote')}</p>
                  </>
                ) : null}
                {spanishModule ? <p className="wa-kit-meta">{t('catalogHelp')}</p> : null}
              </>
            ) : null}
            <WorkforceApModuleLessons lessons={course.lessons ?? []} labels={{ start: t('startLesson'), open: t('openLesson'), fallback: t('fallback') }} />
            {course.topics?.length ? (
              <>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: '20px 0 8px' }}>{t('practiceHeading')}</h3>
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
                aria-label={t('providerLabel')}
                style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--wa-border)', fontSize: 13, color: 'var(--wa-muted)', lineHeight: 1.55 }}
              >
                <strong style={{ color: 'var(--wa-text)' }}>{t('providerLabel')}</strong>{' '}
                {t('providerAttribution', { provider: course.provider.name })}{' '}
                {course.provider.license ? (
                  <>
                    {t('licenseIntro')}{' '}
                    <a href={course.provider.license.url} target="_blank" rel="noopener noreferrer">
                      {course.provider.license.name}
                    </a>
                    {course.provider.license.termsUrl ? (
                      <>
                        {' '}(<a href={course.provider.license.termsUrl} target="_blank" rel="noopener noreferrer">{t('providerTerms')}</a>)
                      </>
                    ) : null}
                    . {t('licenseBoundary')}
                  </>
                ) : null}
                <span style={{ display: 'block', marginTop: 6 }}>
                  {t('providerIndexIntro')}{' '}
                  <a href={course.provider.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                    {t('providerIndex', { provider: course.provider.name })}
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
              {t('completionHeading')}
            </h2>
            <p style={{ margin: '8px 0 0', color: 'var(--wa-muted)', lineHeight: 1.6 }}>
              {t('completionBoundary')}
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              <Link href="/dashboard/certifications">{t('completionRecords')}</Link>
            </p>
          </section>
        ) : null}

        <section className="wa-kit-card" style={{ marginTop: 24, padding: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{hasLessons ? t('keepMoving') : t('appliedWork')}</h2>
          <p style={{ margin: '8px 0 20px', color: 'var(--wa-muted)', lineHeight: 1.6 }}>
            {hasLessons
              ? t('optionalTools')
              : t('appliedTools')}
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {LAB_ACTIONS.map(({ href, key, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="portal-card portal-card--flat"
                style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start', textDecoration: 'none' }}
              >
                <Icon size={20} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--wa-accent-text)' }} />
                <span>
                  <strong style={{ display: 'block', color: 'var(--wa-text)' }}>{t(`actions.${key}.title`)}</strong>
                  <span style={{ display: 'block', marginTop: 3, color: 'var(--wa-muted)', lineHeight: 1.45 }}>{t(`actions.${key}.detail`)}</span>
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
            label={hasLessons ? t('markModule') : t('markLab')}
            completedLabel={hasLessons ? t('moduleCompleted') : t('completed')}
            savingLabel={t('saving')}
            saveErrorLabel={t('saveError')}
            networkErrorLabel={t('networkError')}
          />
          <Link href="/dashboard/learning" className="btn btn-outline">{t('back')}</Link>
        </div>
      </main>
    </DesignSurface>
  );
}
