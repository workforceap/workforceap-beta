'use client';

import Link from 'next/link';
import TrainingCourseList from '@/components/portal/TrainingCourseList';
import { useTranslations } from 'next-intl';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';
import type { LanguageSupport, ProgramCourse } from '@/lib/content/programs';
import { describeCourseDenominator } from '@/lib/coursera/progressTileSummary';

type LearningHubEnrolledCoursesProps = {
  programSlug: string | null;
  programTitle: string | null;
  courses: ProgramCourse[];
  completedSlugs: string[];
  assessmentCompleted: boolean;
  /** Server-truth Coursera enrollment eligibility for the signed-in member. */
  eligibilityApproved?: boolean;
  /** Per-language course support (audio/subtitles) for the enrolled program. */
  languagesSupported?: LanguageSupport;
};

const LANGUAGE_LABELS: Record<keyof LanguageSupport, string> = {
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
};

const LANGUAGE_LEVEL_LABELS: Record<LanguageSupport[keyof LanguageSupport], string> = {
  full: 'full audio',
  subtitles: 'subtitles',
  'ai-subtitles': 'AI subtitles',
  none: '',
};

function buildLanguageSupportLine(languagesSupported?: LanguageSupport): string | null {
  if (!languagesSupported) return null;
  const parts = (Object.keys(LANGUAGE_LABELS) as (keyof LanguageSupport)[])
    .filter((lang) => languagesSupported[lang] && languagesSupported[lang] !== 'none')
    .map((lang) => `${LANGUAGE_LABELS[lang]}: ${LANGUAGE_LEVEL_LABELS[languagesSupported[lang]]}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const ENROLLED_COURSES_WRAP_CLASS =
  'learning-hub-enrolled-courses wa-mx-6 wa-mb-6 md:wa-mx-0 md:wa-mb-8';

export default function LearningHubEnrolledCourses({
  programSlug,
  programTitle,
  courses,
  completedSlugs,
  assessmentCompleted,
  eligibilityApproved = false,
  languagesSupported,
}: LearningHubEnrolledCoursesProps) {
  const te = useTranslations('empty');
  const icon = <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', fontVariationSettings: "'FILL' 1" }}>school</span>;
  // `empty.*` (KIT_GUIDE §6): no program → `first` (choose one in My Program);
  // an enrolled program whose curriculum has no published courses (or a slug
  // the catalog no longer knows) → `unavailable`, message the counselor.
  if (!programSlug) {
    return (
      <section className={ENROLLED_COURSES_WRAP_CLASS}>
        <KitEmptyState
          kind="first"
          framed
          icon={icon}
          title={te('enrolledCourses.title')}
          description={te('enrolledCourses.body')}
          primaryAction={{ label: te('enrolledCourses.action'), href: '/dashboard/program' }}
        />
      </section>
    );
  }
  if (!programTitle || courses.length === 0) {
    return (
      <section className={ENROLLED_COURSES_WRAP_CLASS}>
        <KitEmptyState
          kind="unavailable"
          framed
          icon={icon}
          title={te('enrolledCoursesUnavailable.title')}
          description={te('enrolledCoursesUnavailable.body')}
          primaryAction={{ label: te('enrolledCoursesUnavailable.action'), href: '/dashboard/messages' }}
        />
      </section>
    );
  }

  const completedInProgram = completedSlugs.filter((s) => courses.some((c) => c.slug === s)).length;
  const pct = courses.length > 0 ? Math.round((completedInProgram / courses.length) * 100) : 0;

  const progressLabel =
    pct === 0
      ? 'Not started'
      : pct === 100
        ? 'Complete'
        : `${pct}% complete`;

  const progressColor =
    pct === 0
      ? 'var(--color-on-surface-variant)'
      : pct === 100
        ? 'var(--color-green, rgb(22, 163, 74))'
        : 'var(--color-accent)';

  const languageSupportLine = buildLanguageSupportLine(languagesSupported);

  return (
    <section className={ENROLLED_COURSES_WRAP_CLASS}>
      <div
        className="wa-p-5 md:wa-p-6"
        style={{
          background: 'var(--surface-container-low)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            flexWrap: 'wrap',
            marginBottom: '1rem',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--wa-accent-text)',
                marginBottom: '0.25rem',
              }}
            >
              Enrolled classes
            </p>
            <h3 className="wa-text-lg md:wa-text-[length:var(--font-size-h3)]" style={{ fontWeight: 700, margin: 0 }}>
              {programTitle}
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginTop: '0.35rem' }}>
              {completedInProgram} of {courses.length} courses marked complete
            </p>
            {describeCourseDenominator(courses) ? (
              <p data-testid="program-courses-note" style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.3rem' }}>
                {describeCourseDenominator(courses)}
              </p>
            ) : null}
            {languageSupportLine ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.3rem' }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '0.9rem', verticalAlign: '-0.15em', marginRight: '0.25rem' }}>
                  translate
                </span>
                {languageSupportLine}
              </p>
            ) : null}
          </div>
          <Link href="/dashboard/program" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" style={{ flexShrink: 0 }}>
            Open My Program
          </Link>
        </div>

        {/* ── Visual progress bar + percentage ── */}
        <div style={{ marginBottom: '1rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.4rem',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: progressColor,
              }}
            >
              {progressLabel}
            </span>
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: 'var(--color-on-surface)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {pct}%
            </span>
          </div>
          <div className="portal-progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Training progress">
            <div
              className="portal-progress-bar__fill"
              style={{
                width: `${pct}%`,
                background:
                  pct === 100
                    ? 'var(--color-green, rgb(22, 163, 74))'
                    : pct === 0
                      ? 'transparent'
                      : undefined,
              }}
            />
          </div>
        </div>

        {!assessmentCompleted ? (
          <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', marginBottom: '1rem' }}>
            Complete your Training Preassessment to start your training.{' '}
            <Link href="/dashboard/assessment" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>
              Training Preassessment
            </Link>
          </p>
        ) : null}

        <TrainingCourseList
          programSlug={programSlug}
          courses={courses}
          completedSlugs={completedSlugs}
          eligibilityApproved={eligibilityApproved}
        />
      </div>
    </section>
  );
}
