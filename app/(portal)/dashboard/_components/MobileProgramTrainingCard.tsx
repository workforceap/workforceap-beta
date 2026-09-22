import Link from 'next/link';
import DashboardProgramSelector from '@/components/portal/DashboardProgramSelector';
import type { DashboardStateLetter, DashboardTranslator, ProgramSelectorOption } from './types';

/* Program & training context (mobile) - extracted verbatim from page.tsx.
   The greeting lives solely in TodayHero. This slim card preserves the
   still-useful pieces of the former hero: the program label, the program
   switcher, and the My Training entry point. It is only shown when there is
   program context or a training state to surface - otherwise it stays out of
   the way (the visibility condition below matches the original inline guard). */
export default function MobileProgramTrainingCard({
  t,
  programTitle,
  showProgramSelector,
  enrolledProgram,
  programSelectorOptions,
  dashboardState,
  nextIncompleteCourseName,
}: {
  t: DashboardTranslator;
  programTitle: string | null;
  showProgramSelector: boolean;
  enrolledProgram: string | null;
  programSelectorOptions: ProgramSelectorOption[];
  dashboardState: DashboardStateLetter;
  nextIncompleteCourseName: string | null;
}) {
  if (
    !(
      programTitle ||
      (showProgramSelector && enrolledProgram) ||
      dashboardState === 'C' ||
      dashboardState === 'D'
    )
  ) {
    return null;
  }
  return (
        <section aria-label="Program and training" style={{ padding: '1rem 1.25rem 0.5rem' }}>
          <div
            style={{
              borderRadius: '1.5rem',
              padding: '1rem',
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 7%, var(--surface-container-lowest)) 0%, var(--surface-container-lowest) 52%)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 14%, var(--outline-variant))',
              boxShadow: '0 16px 40px rgba(17, 24, 39, 0.08)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: '-2.5rem',
                right: '-2rem',
                width: '8rem',
                height: '8rem',
                borderRadius: '999px',
                background: 'radial-gradient(circle, color-mix(in srgb, var(--color-accent) 18%, transparent) 0%, transparent 68%)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.9rem', position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1, minWidth: 0, paddingRight: '0.25rem' }}>
                <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-accent-dark)' }}>
                  {t('memberDashboard')}
                </p>
                {programTitle && (
                  <div style={{ display: 'inline-flex', alignSelf: 'flex-start', maxWidth: '100%', padding: '0.5rem 0.7rem', borderRadius: '0.9rem', background: 'color-mix(in srgb, var(--surface-container-lowest) 90%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 10%, var(--outline-variant))', overflow: 'hidden' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.35, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {programTitle}
                    </p>
                  </div>
                )}
                {showProgramSelector && enrolledProgram && (
                  <DashboardProgramSelector
                    options={programSelectorOptions}
                    activeProgramSlug={enrolledProgram}
                  />
                )}
              </div>

              {/* Training hub CTA — course-level % and Coursera live on My Training */}
              {(dashboardState === 'C' || dashboardState === 'D') && (
                <div
                  style={{
                    flexShrink: 0,
                    width: '7.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: '0.5rem',
                  }}
                >
                  <Link
                    href="/dashboard/learning"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      padding: '0.65rem 0.5rem',
                      borderRadius: '1rem',
                      background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 12%, var(--surface-container-lowest)) 0%, var(--surface-container-lowest) 100%)',
                      border: '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--outline-variant))',
                      boxShadow: '0 10px 28px color-mix(in srgb, var(--color-accent) 12%, transparent)',
                      textDecoration: 'none',
                      color: 'inherit',
                      textAlign: 'center',
                      minHeight: '44px',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1.35rem', color: 'var(--wa-accent-text)', fontVariationSettings: "'FILL' 1" }}>
                      school
                    </span>
                    <span className="wa-text-[13px] wa-font-extrabold wa-uppercase wa-tracking-[0.08em] wa-text-[var(--color-accent-dark)]" style={{ lineHeight: 1.2 }}>
                      {t('myTrainingMetricLabel')}
                    </span>
                    <span className="wa-text-[13px] wa-font-semibold wa-text-[var(--color-on-surface-variant)]" style={{ lineHeight: 1.3 }}>
                      {t('myTrainingMetricValue')}
                    </span>
                  </Link>
                  {nextIncompleteCourseName ? (
                    <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.35, color: 'var(--color-on-surface-variant)', textAlign: 'center' }}>
                      {t('myTrainingHubNextUp', { course: nextIncompleteCourseName })}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            {(dashboardState === 'C' || dashboardState === 'D') && (
            <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid color-mix(in srgb, var(--outline-variant) 78%, var(--surface-container-lowest))' }}>
              <p className="wa-text-xs wa-text-[var(--color-on-surface-variant)]" style={{ margin: 0, lineHeight: 1.5 }}>
                {t('dashboardCourseProgressOnTraining')}
              </p>
            </div>
            )}
          </div>
        </section>
  );
}
