import type { DashboardTranslator } from './types';

/* Application journey timeline (mobile) - extracted verbatim from page.tsx,
   including the journeySteps derivation that was previously computed inline. */
export default function MobileJourneyTimeline({
  t,
  enrolledProgram,
  noApplicationOnFile,
  assessmentCompleted,
  interviewCompleted,
  interviewRequested,
  interviewEligibleFlag,
  preScreeningDone,
  completedCount,
  allCoursesComplete,
}: {
  t: DashboardTranslator;
  enrolledProgram: string | null;
  noApplicationOnFile: boolean;
  assessmentCompleted: boolean;
  interviewCompleted: boolean;
  interviewRequested: boolean;
  interviewEligibleFlag: boolean;
  preScreeningDone: boolean;
  completedCount: number;
  allCoursesComplete: boolean;
}) {
  /* Journey timeline — complete / active (next) / locked (future) */
  const journeySteps = [
    {
      label: t('journeyProgramSelected'),
      done: !!enrolledProgram,
      active: !enrolledProgram,
      locked: false,
      detail: enrolledProgram ? t('programOnFile') : noApplicationOnFile ? t('startApplication') : t('chooseProgram'),
    },
    {
      label: t('journeySkillsAssessment'),
      done: assessmentCompleted,
      active: !!enrolledProgram && !assessmentCompleted,
      locked: !enrolledProgram,
      detail: assessmentCompleted ? t('progressCompleted') : enrolledProgram ? t('completeToStartTraining') : t('waitingForEnrollment'),
    },
    {
      label: t('journeyInterview'),
      done: interviewCompleted,
      active:
        assessmentCompleted &&
        !interviewCompleted &&
        (interviewRequested || interviewEligibleFlag),
      locked:
        !assessmentCompleted ||
        (assessmentCompleted &&
          !interviewCompleted &&
          !interviewRequested &&
          !interviewEligibleFlag),
      detail: interviewCompleted
        ? t('interviewComplete')
        : interviewRequested
          ? t('interviewScheduled')
          : interviewEligibleFlag
            ? t('requestOrAttendInterview')
            : preScreeningDone
              ? t('preScreeningSubmitted')
              : t('submitPreScreening'),
    },
    {
      label: t('journeyFirstCourse'),
      done: completedCount > 0,
      active:
        !!enrolledProgram &&
        assessmentCompleted &&
        completedCount === 0 &&
        (!interviewEligibleFlag || interviewCompleted),
      locked:
        !enrolledProgram ||
        !assessmentCompleted ||
        (interviewEligibleFlag && !interviewCompleted),
      detail:
        completedCount > 0
          ? allCoursesComplete
            ? t('allCoursesComplete')
            : t('coursesCompleteDetail', { count: completedCount, plural: completedCount === 1 ? '' : 's' })
          : enrolledProgram && assessmentCompleted
            ? interviewEligibleFlag && !interviewCompleted
              ? t('completeInterviewFirst')
              : t('openFirstCourse')
            : t('completePriorStepsFirst'),
    },
  ];

  return (
        <section aria-label="Application journey" style={{ padding: '0 1.25rem', marginBottom: '0.85rem' }}>
          <details className="portal-card portal-card--flat" style={{ borderRadius: '0.875rem', padding: '0.95rem 1rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
              {t('applicationJourney')}
            </summary>
            <div className="portal-journey-timeline" style={{ marginTop: '1rem' }}>
              {journeySteps.map((step, i) => {
                const locked = 'locked' in step && step.locked;
                return (
                  <div key={i} className="portal-journey-step" style={{ opacity: locked ? 0.42 : 1 }}>
                    <div className={`portal-journey-step__dot portal-journey-step__dot--${step.done ? 'done' : step.active ? 'active' : 'locked'}`}>
                      {step.done && (
                        <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: '0.8125rem', fontVariationSettings: "'FILL' 1" }}>check</span>
                      )}
                      {step.active && !step.done && <div className="portal-dot-pulse" />}
                    </div>
                    <div className="portal-journey-step__content" style={{ minWidth: 0, overflow: 'hidden' }}>
                      <p className={`portal-journey-step__label${step.active && !step.done ? ' portal-journey-step__label--active' : ''}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {step.label}
                      </p>
                      {step.detail && <p className="portal-journey-step__detail" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.detail}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </section>
  );
}
