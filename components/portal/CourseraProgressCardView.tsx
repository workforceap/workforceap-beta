'use client';

import { useTranslations } from 'next-intl';
import { formatGradePercent } from '@/lib/coursera/courseGradeDisplay';

export type CourseraProgressRow = {
  id: string;
  courseName: string;
  university: string | null;
  courseraCourseSlug: string | null;
  /** 0..100 (Decimal serialized as number on the wire). */
  overallProgress: number;
  /** Total learning hours so far. */
  learningHours: number | null;
  isCompleted: boolean;
  certificateUrl: string | null;
  /**
   * Course grade as shown in Coursera (from xAPI score_scaled, CSV course grade,
   * or synced gradebook), 0–100; null when unknown.
   */
  gradePercent: number | null;
  /** ISO string — kept primitive so server -> client serialization is trivial. */
  lastActivityTime: string | null;
  /**
   * Pre-resolved org-scoped Coursera URL for the row's "View on Coursera"
   * button. Resolved server-side via `lib/coursera/orgScopedUrls` so the
   * client view doesn't need network or catalog access. Null when the
   * underlying row lacks the metadata to resolve a URL.
   */
  viewUrl?: string | null;
};

export type CourseraProgressCardViewProps = {
  rows: CourseraProgressRow[];
  /** Fallback URL when a course slug isn't known (typically the program home). */
  programHomeUrl: string | null;
  /** Used in the empty-state CTA. */
  launchUrl: string;
};

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

function labelOrFallback(t: TranslateFn, key: string, fallback: string, values?: Record<string, string | number>): string {
  try {
    const value = values ? t(key, values) : t(key);
    if (!value || value === key || value.includes('courseraProgress.')) return fallback;
    return value;
  } catch {
    return fallback;
  }
}

function formatRelative(iso: string | null, t: TranslateFn): string {
  if (!iso) return labelOrFallback(t, 'relative.noActivity', 'No activity yet');
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return labelOrFallback(t, 'relative.noActivity', 'No activity yet');
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day >= 30) {
    const months = Math.floor(day / 30);
    return labelOrFallback(
      t,
      'relative.monthsAgo',
      months === 1 ? '1 month ago' : `${months} months ago`,
      { count: months },
    );
  }
  if (day >= 1) {
    return labelOrFallback(
      t,
      'relative.daysAgo',
      day === 1 ? '1 day ago' : `${day} days ago`,
      { count: day },
    );
  }
  if (hr >= 1) {
    return labelOrFallback(
      t,
      'relative.hoursAgo',
      hr === 1 ? '1 hour ago' : `${hr} hours ago`,
      { count: hr },
    );
  }
  if (min >= 1) {
    return labelOrFallback(t, 'relative.minutesAgo', `${min} min ago`, { count: min });
  }
  return labelOrFallback(t, 'relative.justNow', 'Just now');
}

/**
 * Picks the "View on Coursera" target for a row.
 *
 * Prefers the server-resolved org-scoped URL (`viewUrl`) so members land
 * inside their Coursera For Business program shell rather than the public
 * catalog. Falls back to the program home URL when no per-course resolution
 * was possible.
 */
function buildCourseLink(
  viewUrl: string | null | undefined,
  fallback: string | null,
): string | null {
  if (viewUrl && viewUrl.trim()) return viewUrl;
  return fallback;
}

export default function CourseraProgressCardView({
  rows,
  programHomeUrl,
  launchUrl,
}: CourseraProgressCardViewProps) {
  const t = useTranslations('courseraProgress');

  const title = labelOrFallback(t, 'title', 'Coursera progress');
  const empty = labelOrFallback(
    t,
    'empty',
    'Coursera progress will appear here once you start a course in the program.',
  );
  const launch = labelOrFallback(t, 'launch', 'Launch Coursera');
  const coursesLabel = labelOrFallback(t, 'courses', 'courses');
  const progressLabel = labelOrFallback(t, 'progressLabel', 'Progress');
  const gradeLabel = labelOrFallback(t, 'gradeLabel', 'Grade');
  const hoursLabel = labelOrFallback(t, 'hours', 'h');
  const completedLabel = labelOrFallback(t, 'completed', 'Completed');
  const viewOnCoursera = labelOrFallback(t, 'viewOnCoursera', 'View on Coursera');
  const viewCertificate = labelOrFallback(t, 'viewCertificate', 'View certificate');

  if (rows.length === 0) {
    return (
      <section
        className="portal-card portal-card--flat"
        style={{ borderLeft: '4px solid var(--color-blue)' }}
      >
        <div className="portal-card__body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
            <span
              className="material-symbols-outlined"
              style={{ color: 'var(--color-blue)', '--ms-fill': 1 } as React.CSSProperties}
              aria-hidden
            >
              school
            </span>
            <h2 className="portal-section-heading" style={{ margin: 0, fontSize: '1rem' }}>
              {title}
            </h2>
          </div>
          <p style={{ color: 'var(--color-on-surface-variant)', marginBottom: '0.875rem', lineHeight: 1.6 }}>
            {empty}
          </p>
          <a
            href={launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-small"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }} aria-hidden>
              open_in_new
            </span>
            {launch}
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="portal-card portal-card--flat" style={{ borderLeft: '4px solid var(--color-blue)' }}>
      <div className="portal-card__body">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.875rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span
              className="material-symbols-outlined"
              style={{ color: 'var(--color-blue)', '--ms-fill': 1 } as React.CSSProperties}
              aria-hidden
            >
              school
            </span>
            <h2 className="portal-section-heading" style={{ margin: 0, fontSize: '1rem' }}>
              {title}
            </h2>
          </div>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
            {rows.length} {coursesLabel}
          </span>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
          {rows.map((row) => {
            const pct = Math.max(0, Math.min(100, Math.round(row.overallProgress)));
            const gradeDisplay = formatGradePercent(row.gradePercent);
            const link = buildCourseLink(row.viewUrl ?? null, programHomeUrl);
            return (
              <li
                key={row.id}
                style={{
                  border: '1px solid var(--outline-variant)',
                  borderRadius: '0.65rem',
                  padding: '0.75rem 0.85rem',
                  background: 'var(--surface-container-low)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    marginBottom: '0.4rem',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 14rem' }}>
                    <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{row.courseName}</div>
                    {row.university ? (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                        {row.university}
                      </div>
                    ) : null}
                  </div>
                  {row.isCompleted ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        background: 'rgba(34, 197, 94, 0.15)',
                        color: 'rgb(22, 163, 74)',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }} aria-hidden>
                        check_circle
                      </span>
                      {completedLabel}
                    </span>
                  ) : null}
                </div>

                <div
                  style={{
                    height: '6px',
                    background: 'var(--surface-container-highest)',
                    borderRadius: '999px',
                    overflow: 'hidden',
                    marginBottom: '0.4rem',
                  }}
                  aria-hidden
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: row.isCompleted ? 'var(--color-green, rgb(22, 163, 74))' : 'var(--color-blue)',
                      borderRadius: '999px',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    fontSize: '0.8125rem',
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  <span>
                    <strong style={{ color: 'var(--color-on-surface)' }}>
                      {progressLabel}: {pct}%
                    </strong>
                    {gradeDisplay != null ? (
                      <>
                        {' '}
                        ·{' '}
                        <strong style={{ color: 'var(--color-on-surface)' }}>
                          {gradeLabel}: {gradeDisplay}%
                        </strong>
                      </>
                    ) : null}
                    {row.learningHours != null && row.learningHours > 0 ? (
                      <>
                        {' '}
                        · {row.learningHours.toFixed(1)} {hoursLabel}
                      </>
                    ) : null}
                  </span>
                  <span>{formatRelative(row.lastActivityTime, t)}</span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-small"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden>
                        open_in_new
                      </span>
                      {viewOnCoursera}
                    </a>
                  ) : null}
                  {row.isCompleted && row.certificateUrl ? (
                    <a
                      href={row.certificateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-small"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden>
                        workspace_premium
                      </span>
                      {viewCertificate}
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
