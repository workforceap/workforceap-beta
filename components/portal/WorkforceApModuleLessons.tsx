import type { ProgramCourse } from '@/lib/content/programs';

export type WorkforceApLesson = NonNullable<ProgramCourse['lessons']>[number];

const PRIMARY_LESSON_CTA_CLASS =
  'wa-kit-cta wa-kit-cta--xl wa-kit-cta--block wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const SECONDARY_LESSON_CTA_CLASS =
  'wa-kit-cta wa-kit-cta--ghost wa-kit-cta--xl wa-kit-cta--block wa-kit-focus hover:wa-opacity-90 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none';

type LessonLabels = { start: string; open: string; fallback: string };

const DEFAULT_LABELS: LessonLabels = {
  start: 'Start this lesson',
  open: 'Open this lesson',
  fallback: 'Open provider materials fallback',
};

export function lessonCtaLabel(index: number, labels: LessonLabels = DEFAULT_LABELS): string {
  return index === 0 ? labels.start : labels.open;
}

export default function WorkforceApModuleLessons({
  lessons,
  labels = DEFAULT_LABELS,
}: {
  lessons: readonly WorkforceApLesson[];
  labels?: LessonLabels;
}) {
  return (
    <ol className="wa-kit-lesson-list">
      {lessons.map((lesson, index) => {
        const isFirst = index === 0;
        const label = lesson.ctaLabel ?? lessonCtaLabel(index, labels);
        return (
          <li key={`${lesson.title}-${lesson.url}`}>
            <p className="wa-kit-lesson-list__copy">
              {lesson.title}
              <span className="wa-kit-lesson-list__meta"> · {lesson.minutes} min</span>
            </p>
            {lesson.verificationLabel ? (
              <p className="wa-kit-lesson-list__note">{lesson.verificationLabel}</p>
            ) : null}
            <a
              href={lesson.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy={lesson.referrerPolicy}
              className={isFirst ? PRIMARY_LESSON_CTA_CLASS : SECONDARY_LESSON_CTA_CLASS}
              aria-label={`${label}: ${lesson.title}`}
            >
              {label}
            </a>
            {lesson.fallbackUrl ? (
              <a
                href={lesson.fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy={lesson.referrerPolicy}
                className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
              >
                {lesson.fallbackLabel ?? labels.fallback}
              </a>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
