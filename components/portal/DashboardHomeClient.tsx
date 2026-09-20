'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  MEMBER_APPLICATION_PROGRESS_STEPS,
  type MemberApplicationStage,
} from '@/lib/member/memberApplicationStatus';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { postMemberEvent } from '@/lib/events/client';
import MemberPreScreeningForm from '@/components/portal/MemberPreScreeningForm';
import MemberInterviewRequestButton from '@/components/portal/MemberInterviewRequestButton';
import YouthDashboardNotice from '@/components/portal/YouthDashboardNotice';
import { formatPortalDate, formatPortalDateTime } from '@/lib/formatDate';
import MemberDoThisNextCard from '@/components/portal/MemberDoThisNextCard';
import MemberNextStepsStrip from '@/components/portal/MemberNextStepsStrip';
import MemberFirstValuePanel from '@/components/portal/MemberFirstValuePanel';
import type { FirstValueAction } from '@/lib/member/firstValueActions';
import MemberStuckCounselorStrip from '@/components/portal/MemberStuckCounselorStrip';
import type { NextBestAction } from '@/lib/member/nextBestActions';
import PortalMetricCard from '@/components/portal/ui/PortalMetricCard';

type State = 'A' | 'B' | 'C' | 'D';

export type DashboardApplicationStatusProps = {
  label: string;
  submittedAt: string | null;
  programInterest: string | null;
  nextStep: string;
  showResponseEstimate: boolean;
  progressIndex: number | null;
  stage: MemberApplicationStage;
};

type DashboardHomeClientProps = {
  firstName: string;
  state: State;
  programTitle?: string;
  enrolledAt?: Date | null;
  assessmentScorePct?: number | null;
  completedCount: number;
  totalCourses: number;
  nextMilestone?: string;
  recentActivity: Array<{ label: string; timestamp: Date }>;
  checklist: {
    createAccount: boolean;
    chooseProgram: boolean;
    completeAssessment: boolean;
    startFirstCourse: boolean;
    completeFirstCourse: boolean;
  };
  checklistAllDone: boolean;
  recommendedActions: Array<{ label: string; href: string }>;
  /** Primary dashboard CTA — also removed from the horizontal strip when present to avoid duplication. */
  dominantNextAction?: NextBestAction | null;
  showStuckCounselorStrip?: boolean;
  /** When set (from `CourseProgress` / rollup), drives hero % and metric cards instead of completion ratio alone. */
  blendedTrainingProgressPct?: number;
  nextBestActions?: NextBestAction[];
  aiToolsUsedCount?: number;
  jobSearchUrl?: string | null;
  age?: number | null;
  isMinor?: boolean;
  applicationStatus?: DashboardApplicationStatusProps | null;
  noApplicationOnFile?: boolean;
  assessmentDone?: boolean;
  preScreeningDone?: boolean;
  interviewEligible?: boolean;
  interviewRequestedAt?: Date | null;
  interviewCompletedAt?: Date | null;
  starterProfileReviewRequired?: boolean;
  starterProfileMissingFields?: string[];
  showFirstValuePanel?: boolean;
  firstValueActions?: FirstValueAction[];
  firstValueSecondsSinceSignup?: number | null;
  homeOnly?: boolean;
};

import { useTranslations } from 'next-intl';

export default function DashboardHomeClient({
  firstName,
  state,
  programTitle,
  enrolledAt,
  assessmentScorePct,
  completedCount,
  totalCourses,
  nextMilestone,
  recentActivity,
  checklist,
  checklistAllDone,
  recommendedActions,
  dominantNextAction = null,
  showStuckCounselorStrip = false,
  blendedTrainingProgressPct,
  nextBestActions = [],
  aiToolsUsedCount = 0,
  jobSearchUrl,
  applicationStatus,
  noApplicationOnFile,
  assessmentDone = false,
  preScreeningDone = false,
  interviewEligible = false,
  interviewRequestedAt = null,
  interviewCompletedAt = null,
  starterProfileReviewRequired = false,
  starterProfileMissingFields = [],
  age = null,
  isMinor = false,
  showFirstValuePanel = false,
  firstValueActions = [],
  firstValueSecondsSinceSignup = null,
  homeOnly = false,
}: DashboardHomeClientProps) {
  const t = useTranslations('dashboard');
  const primaryAction = recommendedActions[0];

  useEffect(() => {
    trackFunnelEvent('member_dashboard', 'dashboard_viewed', { state, checklist_all_done: checklistAllDone });
    void postMemberEvent({
      eventName: 'member_dashboard_viewed',
      sourcePage: '/dashboard',
      metadata: { state, checklistAllDone },
    });
    // Track activation milestone: user has enrolled + completed at least one course
    if (state !== 'A' && completedCount >= 1) {
      trackFunnelEvent('member_dashboard', 'dashboard_activated', {
        state,
        completed_count: completedCount,
        program: programTitle,
      });
      void postMemberEvent({
        eventName: 'member_dashboard_activated',
        sourcePage: '/dashboard',
        metadata: { state, completedCount, programTitle },
      });
    }
  }, [state, checklistAllDone, completedCount, programTitle]);

  const handleDashboardAction = (action: string) => {
    trackFunnelEvent('member_dashboard', action, { state });
    void postMemberEvent({
      eventName: 'member_dashboard_action_clicked',
      sourcePage: '/dashboard',
      metadata: { state, action },
    });
  };

  const handlePrimaryCtaClick = (cardId: string, cardLabel: string, href: string) => {
    trackFunnelEvent('member_dashboard', 'dashboard_primary_cta_clicked', {
      state,
      card_id: cardId,
      card_label: cardLabel,
      href,
      route: typeof window !== 'undefined' ? window.location.pathname : '/dashboard',
    });
    void postMemberEvent({
      eventName: 'member_dashboard_action_clicked',
      sourcePage: '/dashboard',
      metadata: {
        state,
        action: 'dashboard_primary_cta_clicked',
        card_id: cardId,
        card_label: cardLabel,
        href,
      },
    });
  };

  const progressPct =
    typeof blendedTrainingProgressPct === 'number' && Number.isFinite(blendedTrainingProgressPct)
      ? Math.max(0, Math.min(100, Math.round(blendedTrainingProgressPct)))
      : totalCourses > 0
        ? Math.round((completedCount / totalCourses) * 100)
        : 0;

  const nextStripActions = useMemo(() => {
    const list = nextBestActions ?? [];
    if (!dominantNextAction || list.length === 0) return list;
    if (list[0]?.id === dominantNextAction.id) return list.slice(1);
    return list;
  }, [dominantNextAction, nextBestActions]);

  const checklistItems = [
    {
      done: checklist.createAccount,
      doneLabel: t('checklistAccountReady'),
      pendingLabel: t('checklistCreateAccount'),
    },
    {
      done: checklist.chooseProgram,
      doneLabel: t('checklistProgramSelected'),
      pendingLabel: noApplicationOnFile ? t('checklistStartApplication') : t('checklistChooseProgram'),
    },
    {
      done: checklist.completeAssessment,
      doneLabel: t('checklistPreassessmentComplete'),
      pendingLabel: t('checklistCompletePreassessment'),
    },
    {
      done: checklist.startFirstCourse,
      doneLabel: t('checklistFirstCourseOpened'),
      pendingLabel: t('checklistOpenFirstCourse'),
    },
    {
      done: checklist.completeFirstCourse,
      doneLabel: t('checklistFirstCourseComplete'),
      pendingLabel: t('checklistCompleteFirstCourse'),
    },
  ];

  const progressCardTitle =
    state === 'D'
      ? t('trainingComplete')
      : state === 'B'
        ? t('preassessmentRequired')
        : completedCount === 0
          ? t('firstCourseIsNext')
          : t('upNextInTraining', { milestone: nextMilestone ?? programTitle ?? 'your training plan' });

  const progressCardSummary =
    state === 'D'
      ? t('coursesMarkedComplete', { completed: completedCount, total: totalCourses })
      : state === 'B'
        ? t('completePreassessmentToUnlock')
        : completedCount === 0
          ? t('noCoursesCompleteYet')
          : t('coursesMarkedComplete', { completed: completedCount, total: totalCourses });

  const weekEyebrow = useMemo(() => {
    const d = new Date();
    const start = new Date(d);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    return `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, []);

  const showPreassessmentScore = assessmentScorePct != null && completedCount === 0 && state !== 'D';
  const showPreassessmentPhase = state === 'A' || state === 'B';
  const applicationSupportCopy =
    state === 'A'
      ? (noApplicationOnFile
          ? t('startApplicationToBegin')
          : t('chooseProgramToBegin'))
      : state === 'B'
        ? t('completePreassessmentToStart', { program: programTitle ?? 'your program' })
        : state === 'C'
          ? t('keepGoingFinishNext', { milestone: nextMilestone ?? 'your next course' })
          : t('focusOnCareerReadiness');

  /* ── Metric cards data ── */
  const metricCards = [
    ...(state === 'C' || state === 'D'
      ? [
          {
            label: t('myTrainingMetricLabel'),
            value: t('myTrainingMetricValue'),
            hint: t('myTrainingMetricHint'),
            icon: 'menu_book',
            accent: 'accent' as const,
            href: '/dashboard',
          },
        ]
      : []),
    ...(showPreassessmentScore
      ? [{
          label: t('preassessmentScore'),
          value: `${assessmentScorePct}%`,
          hint: t('readinessBenchmark'),
          icon: 'psychology',
          accent: 'blue' as const,
          href: '/dashboard/assessment',
        }]
      : []),
    {
      label: t('aiToolsUsed'),
      value: aiToolsUsedCount.toString(),
      hint: aiToolsUsedCount > 0 ? t('recentAiActivity') : t('noRecentAiActivity'),
      icon: 'auto_awesome',
      accent: 'gold' as const,
      href: '/dashboard/ai-tools',
    },
  ];

  return (
    <div className="portal-member-dashboard-home">
      {age !== null && age < 18 ? <YouthDashboardNotice age={age} /> : null}

      {showFirstValuePanel && firstValueActions.length > 0 ? (
        <MemberFirstValuePanel
          actions={firstValueActions}
          secondsSinceSignup={firstValueSecondsSinceSignup}
        />
      ) : null}

      {/* ── Page Header ── */}
      <header className="portal-dash-header portal-dash-inset">
        <p className="text-label-upper" style={{ color: 'var(--color-on-surface-variant)', letterSpacing: '0.08em', fontSize: '0.8125rem', marginBottom: '0.375rem' }}>
          {weekEyebrow}
        </p>
        <h2 className="text-display-sm" style={{ color: 'var(--color-on-surface)', marginBottom: '0.5rem' }}>
          {t('yourNextSteps', { firstName })}
        </h2>
        <p style={{ color: 'var(--color-on-surface-variant)', maxWidth: '42rem', lineHeight: 1.65, fontSize: '0.9375rem', marginBottom: '0.875rem' }}>
          {state === 'A' && (isMinor && age ? t('exploreCareerPaths') : t('letsBuildYourCareerPath'))}
          {state === 'B' && t('enrolledCompletePreassessment', { program: programTitle ?? 'your program' })}
          {state === 'C' && t('homeOverviewTrainingTeaser')}
          {state === 'D' && t('trainingPlanComplete')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {programTitle ? (
            <span style={{ padding: '0.4rem 0.7rem', borderRadius: '999px', background: 'var(--surface-container-low)', color: 'var(--color-on-surface)', fontSize: '0.8125rem', fontWeight: 700 }}>
              {programTitle}
            </span>
          ) : null}
          <span style={{ padding: '0.4rem 0.7rem', borderRadius: '999px', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 700 }}>
            {state === 'A' ? t('stateGettingStarted') : state === 'B' ? t('stateReadyForPreassessment') : state === 'C' ? t('myTrainingMetricLabel') : t('trainingComplete')}
          </span>
          {(state === 'C' || state === 'D') && (
            <span style={{ padding: '0.4rem 0.7rem', borderRadius: '999px', background: 'var(--surface-container-low)', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontWeight: 700 }}>
              {t('coursesDoneCount', { completed: completedCount, total: totalCourses })}
            </span>
          )}
        </div>
      </header>

      {showStuckCounselorStrip && state === 'C' ? (
        <div className="portal-dash-inset" style={{ marginBottom: '1.25rem' }}>
          <MemberStuckCounselorStrip />
        </div>
      ) : null}

      {dominantNextAction && state !== 'A' ? <MemberDoThisNextCard action={dominantNextAction} /> : null}

      {/* ── 1. STATUS CARD — where am I, what's next ── */}
      {((state === 'A' || state === 'B') && (noApplicationOnFile || applicationStatus)) && (
        <div className="portal-dash-inset" style={{ marginBottom: '1.5rem' }}>
          <section
            className="portal-card portal-card--flat"
            style={{ borderLeft: '4px solid var(--color-accent)' }}
          >
            <div className="portal-card__body">
              {noApplicationOnFile ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)' }}>description</span>
                    <h3 style={{ fontWeight: 700, fontSize: '0.875rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Program Application</h3>
                  </div>
                  <div className="portal-card portal-card--flat portal-card--padded-sm" style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                      Ready to get started? Your application takes about 10 minutes — and programs are available at no cost to members.
                    </p>
                  </div>
                  <Link
                    href="/apply"
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handlePrimaryCtaClick('state_a_start_application', 'Start your application', '/apply')}
                  >
                    Start your application
                  </Link>
                </div>
              ) : applicationStatus ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)' }}>task_alt</span>
                    <h3 style={{ fontWeight: 700, fontSize: '0.875rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Application Status</h3>
                  </div>
                  {applicationStatus.progressIndex !== null && (
                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }} aria-label="Application progress">
                      {MEMBER_APPLICATION_PROGRESS_STEPS.map((stepLabel, i) => {
                        const stepNum = i + 1;
                        const idx = applicationStatus.progressIndex!;
                        const done = stepNum < idx;
                        const current = stepNum === idx;
                        const locked = stepNum > idx;
                        return (
                          <div key={stepLabel} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                            <div
                              style={{
                                width: '100%',
                                height: current ? '4px' : '3px',
                                borderRadius: '9999px',
                                background: done
                                  ? 'var(--color-accent)'
                                  : current
                                    ? 'var(--color-accent)'
                                    : 'var(--outline-variant)',
                                opacity: locked ? 0.35 : 1,
                              }}
                            />
                            <span
                              style={{
                                fontSize: '0.8125rem',
                                fontWeight: current ? 700 : 600,
                                color: locked ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
                                opacity: locked ? 0.45 : 0.85,
                                textAlign: 'center',
                              }}
                            >
                              {stepLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="portal-card portal-card--flat portal-card--padded-sm" style={{ marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.25rem' }}>Current status</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{applicationStatus.label}</p>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>{applicationStatus.nextStep}</p>
                  {applicationStatus.showResponseEstimate && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', opacity: 0.8, marginTop: '0.5rem' }}>
                      We typically respond with your next step in 1 to 2 business days.
                    </p>
                  )}
                  <div className="portal-card portal-card--flat portal-card--padded-sm">
                    <p style={{ fontSize: '0.875rem', fontStyle: 'italic', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                      {applicationSupportCopy}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {showPreassessmentScore && (
                        <span style={{ padding: '0.25rem 0.625rem', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', color: 'var(--color-accent)', fontSize: '0.8125rem', borderRadius: '9999px', fontWeight: 600 }}>
                          Preassessment: {assessmentScorePct}%
                        </span>
                      )}
                      {enrolledAt && (
                        <span style={{ padding: '0.25rem 0.625rem', background: 'var(--surface-container-lowest)', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', borderRadius: '9999px', fontWeight: 600 }}>
                          Enrolled: {formatPortalDate(enrolledAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {/* ── 2. HELP STRIP — counselor contact + support CTA ── */}
      <div className="portal-card portal-card--flat portal-dashboard-help-strip">
        <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', fontSize: '1.25rem', flexShrink: 0 }}>support_agent</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', flex: 1, minWidth: '12rem' }}>
          Have questions? Your counselor is here to help.
        </span>
        <Link
          href="/dashboard/messages"
          className="btn btn-muted"
          style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}
          onClick={() => handleDashboardAction('help_counselor_clicked')}
        >
          Message Counselor
        </Link>
        <Link
          href="/dashboard/resources"
          style={{ color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
          onClick={() => handleDashboardAction('help_resources_clicked')}
        >
          Get Support
        </Link>
      </div>

      {/* ── 3. METRIC CARDS ── */}
      {(state === 'C' || state === 'D') && !homeOnly && (
        <div className="portal-dash-inset" style={{ marginBottom: '1.25rem' }}>
          <div className="portal-metric-strip">
            {metricCards.map((m) => (
              <PortalMetricCard key={m.label} {...m} />
            ))}
          </div>
        </div>
      )}

      {/* ── 4. MORE NEXT STEPS — demoted under Today card (capability kept) ── */}
      {nextStripActions.length > 0 && (
        <div className="portal-dash-inset" style={{ marginBottom: '1.5rem' }}>
          <MemberNextStepsStrip
            actions={nextStripActions.slice(0, 2)}
            prominence={dominantNextAction ? 'secondary' : 'primary'}
          />
        </div>
      )}

      {/* ── 5. Main content grid ── */}
      {!homeOnly && (
      <div className="portal-bento-grid">

      {/* ── Main Progress Card (states C/D: training in progress / completed) ── */}
      {(state === 'C' || state === 'D') && programTitle && (
          <section className="portal-card portal-card--flat" style={{ gridColumn: 'span 12' }}>
            <div className="portal-card__body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.35rem', color: 'var(--color-on-surface)' }}>
                    {progressCardTitle}
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                    {progressCardSummary}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '-0.04em' }}>
                    {progressPct}<span style={{ fontSize: '1.25rem' }}>%</span>
                  </span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>Progress</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{ position: 'relative', width: '100%', height: '8px', background: 'var(--surface-container-highest)', borderRadius: '9999px', marginBottom: '2rem' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: 'var(--color-accent)', borderRadius: '9999px', width: `${progressPct}%`, transition: 'width 0.5s ease' }} />
              </div>

              {/* Milestone journey dots */}
              <div className="portal-milestone-track">
                {checklistItems.map((item, i) => {
                  const isCurrent = !item.done && (i === 0 || checklistItems[i - 1].done);
                  const label = item.done ? item.doneLabel : item.pendingLabel;
                  return (
                    <div key={`${i}-${label}`} className="portal-milestone-step" style={{
                      opacity: item.done ? 0.5 : isCurrent ? 1 : 0.35,
                      color: isCurrent ? 'var(--color-accent)' : 'var(--color-on-surface-variant)',
                    }}>
                      {item.done ? (
                        <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', marginBottom: '0.5rem', '--ms-fill': 1 }}>check_circle</span>
                      ) : isCurrent ? (
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-accent)', boxShadow: '0 0 0 4px color-mix(in srgb, var(--color-accent) 18%, transparent)', animation: 'portal-pulse 2s infinite' }} />
                      ) : (
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--surface-container-highest)' }} />
                      )}
                      <p className="portal-milestone-step__label">{label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── Training hub teaser (states C/D — detail lives on /dashboard) ── */}
        {(state === 'C' || state === 'D') && programTitle && (
          <section
            className="portal-card portal-card--flat"
            style={{ gridColumn: 'span 12', borderLeft: '4px solid var(--color-accent)' }}
          >
            <div className="portal-card__body">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.5rem', flexShrink: 0, '--ms-fill': 1 } as object}>
                  school
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 0.35rem', color: 'var(--color-on-surface)' }}>
                    {t('myTrainingHubCardTitle')}
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.55 }}>
                    {t('myTrainingHubCardBody')}
                  </p>
                  {state === 'C' && nextMilestone ? (
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: '0.75rem 0 0' }}>
                      {t('myTrainingHubNextUp', { course: nextMilestone })}
                    </p>
                  ) : null}
                </div>
              </div>
              <Link
                href="/dashboard"
                className={dominantNextAction ? 'btn btn-muted' : 'btn btn-primary'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                onClick={() => handleDashboardAction('open_training_hub_clicked')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }}>open_in_new</span>
                {t('openMyTraining')}
              </Link>
            </div>
          </section>
        )}

        {/* ── Pre-Screening ── */}
        {assessmentDone && !preScreeningDone && (
          <section className="portal-card portal-card--flat" style={{ gridColumn: 'span 12' }}>
            <div className="portal-card__body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)' }}>assignment</span>
              <h3 style={{ fontWeight: 700, fontSize: '0.875rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pre-screening (before your interview)</h3>
            </div>
            <MemberPreScreeningForm />
            </div>
          </section>
        )}

        {/* ── Interview ── */}
        {assessmentDone && preScreeningDone && interviewEligible && !interviewCompletedAt && (
          <section className="portal-card portal-card--flat" style={{ gridColumn: 'span 12' }}>
            <div className="portal-card__body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)' }}>videocam</span>
              <h3 style={{ fontWeight: 700, fontSize: '0.875rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Interview</h3>
            </div>
            {interviewRequestedAt ? (
              <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
                We received your interview request on{' '}
                {formatPortalDateTime(interviewRequestedAt)}. A counselor will reach out by email.
              </p>
            ) : (
              <MemberInterviewRequestButton />
            )}
            </div>
          </section>
        )}

        {/* ── Keep moving (secondary when Today card already owns the primary CTA) ── */}
        <section style={{ gridColumn: 'span 12' }}>
          <div className="portal-dash-section-header">
            <h3 className="portal-heading-with-bar portal-section-heading" style={{ margin: 0 }}>
              {state === 'D' ? t('careerNextSteps') : t('keepMoving')}
            </h3>
            <Link
              href={state === 'A' ? '/dashboard/program' : '/dashboard'}
              className="portal-dash-section-header__action"
              onClick={() => handleDashboardAction('view_all_tracks_clicked')}
            >
              {state === 'A' ? t('viewProgramOptions') : t('viewAllTracks')}
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="portal-card portal-card--flat" style={{ padding: '1rem 1.1rem' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dominantNextAction ? 'var(--color-on-surface-variant)' : 'var(--color-accent)' }}>
                {state === 'A' ? t('stateGettingStarted') : state === 'B' ? t('yourNextStep') : state === 'C' ? t('firstCertTrainingStage') : t('trainingComplete')}
              </p>
              <h4 style={{ fontWeight: 700, fontSize: '1rem', margin: '0.45rem 0 0.35rem', color: 'var(--color-on-surface)' }}>
                {state === 'A'
                  ? noApplicationOnFile ? 'Start your application' : 'Choose your program'
                  : state === 'B'
                    ? starterProfileReviewRequired ? 'Review your profile details' : 'Complete your preassessment'
                    : state === 'C'
                      ? nextMilestone ?? 'Continue training'
                      : 'Build job readiness'}
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5, margin: 0 }}>
                {state === 'A'
                  ? noApplicationOnFile
                    ? 'Apply in about 10 minutes to get matched with the right no-cost program for your goals.'
                    : 'Select the one program track that fits your goals right now.'
                  : state === 'B'
                    ? starterProfileReviewRequired
                      ? `Confirm the contact and referral details entered for you.${starterProfileMissingFields.length ? ` Missing now: ${starterProfileMissingFields.join(', ')}.` : ''}`
                      : `A quick preassessment tailors your ${programTitle ?? 'training'} path and helps identify matching roles.`
                    : state === 'C'
                      ? `${completedCount} of ${totalCourses} courses marked complete. Keep moving toward job readiness.`
                      : `You've finished ${programTitle ?? 'your training'}. Finish readiness steps before applying for jobs.`}
              </p>
              <div style={{ marginTop: '0.9rem' }}>
                <Link
                  href={state === 'A'
                    ? (noApplicationOnFile ? '/apply' : '/dashboard/program')
                    : state === 'B'
                      ? (starterProfileReviewRequired ? '/dashboard/profile' : '/dashboard/assessment')
                      : state === 'C'
                        ? '/dashboard'
                        : '/dashboard/readiness'}
                  className={dominantNextAction ? 'btn btn-muted' : 'btn btn-primary'}
                  onClick={() => handleDashboardAction(
                    state === 'A'
                      ? (noApplicationOnFile ? 'start_application_clicked' : 'choose_program_clicked')
                      : state === 'B'
                        ? (starterProfileReviewRequired ? 'starter_profile_review_clicked' : 'assessment_clicked')
                        : state === 'C'
                          ? 'continue_training_clicked'
                          : 'career_readiness_clicked'
                  )}
                >
                  {state === 'A'
                    ? (noApplicationOnFile ? 'Start your application' : 'Choose your program')
                    : state === 'B'
                      ? (starterProfileReviewRequired ? 'Review profile' : 'Start preassessment')
                      : state === 'C'
                        ? 'Continue training'
                        : 'Build job readiness'}
                </Link>
              </div>
            </div>

            <div className="portal-card portal-card--flat" style={{ padding: '1rem 1.1rem' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
                Support
              </p>
              <h4 style={{ fontWeight: 700, fontSize: '1rem', margin: '0.45rem 0 0.35rem', color: 'var(--color-on-surface)' }}>Talk to a counselor</h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5, margin: 0 }}>
                Ask questions, get unstuck, or check what happens next in your program.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
                <Link href="/dashboard/messages" className="btn btn-muted" onClick={() => handleDashboardAction('help_counselor_clicked')}>
                  Message counselor
                </Link>
                <Link href="/dashboard/resources" style={{ color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 700, textDecoration: 'none', alignSelf: 'center' }} onClick={() => handleDashboardAction('help_resources_clicked')}>
                  Get support
                </Link>
              </div>
            </div>

            <div className="portal-card portal-card--flat" style={{ padding: '1rem 1.1rem' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
                Voice coach
              </p>
              <h4 style={{ fontWeight: 700, fontSize: '1rem', margin: '0.45rem 0 0.35rem', color: 'var(--color-on-surface)' }}>
                Practice out loud
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5, margin: 0 }}>
                Use voice tools for mock interviews, spoken answers, and confidence-building — without turning the homepage into a tool catalog.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
                <Link href="/dashboard/ai-tools/voice-interview" className="btn btn-muted" onClick={() => handleDashboardAction('ai_tools_clicked')}>
                  Open voice coach
                </Link>
                <Link href={primaryAction?.href ?? '/dashboard/ai-tools'} style={{ color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 700, textDecoration: 'none', alignSelf: 'center' }} onClick={() => handleDashboardAction(primaryAction ? 'primary_recommended_action_clicked' : 'ai_tools_clicked')}>
                  {primaryAction ? 'Open recommended tool' : 'Open career tools'}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Tools & Extras ── */}
        <section style={{ gridColumn: 'span 12' }}>
          <details className="portal-details">
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)', padding: '0.75rem 0', userSelect: 'none' }}>
              More tools &amp; resources
            </summary>
            <div className="portal-quick-actions-grid" style={{ marginTop: '1rem' }}>
              {[
                { href: '/dashboard/weekly-recap', label: 'Weekly recap', desc: 'Milestones and reminders', icon: 'event_note', action: 'weekly_recap_clicked' },
                { href: '/dashboard/ai-tools', label: 'Career tools', desc: 'Resume, cover letters, interviews', icon: 'auto_awesome', action: 'ai_tools_clicked' },
                { href: '/dashboard/learning', label: t('myTrainingMetricLabel'), desc: t('myTrainingHubCardBody'), icon: 'school', action: 'training_hub_clicked' },
                { href: '/dashboard/messages', label: 'Messages', desc: 'Counselor and team threads', icon: 'forum', action: 'quicklink_messages_clicked' },
                { href: '/dashboard/assessment', label: showPreassessmentPhase ? 'Training preassessment' : 'Assessment results', desc: showPreassessmentPhase ? 'Program readiness' : 'View your readiness results', icon: 'history_edu', action: 'quicklink_assessments_clicked' },
                { href: '/dashboard/resources', label: 'Resources', desc: 'Program materials', icon: 'terminal', action: 'quicklink_resources_clicked' },
              ].map((item) => (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => handleDashboardAction(item.action)}>
                  <div className="portal-card portal-card--flat" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-on-surface-variant)' }}>{item.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h5 style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>{item.label}</h5>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{item.desc}</p>
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', opacity: 0.3, flexShrink: 0 }}>chevron_right</span>
                  </div>
                </Link>
              ))}
            </div>
          </details>
        </section>

        {/* ── Recent Activity (collapsed) ── */}
        {recentActivity.length > 0 && (state === 'C' || state === 'D') && (
          <section className="portal-card portal-card--flat portal-card--padded" style={{ gridColumn: 'span 12' }}>
            <details className="portal-details">
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>Recent Activity</summary>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
                {recentActivity.map((a, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid color-mix(in srgb, var(--outline-variant) 40%, transparent)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                    <span>{a.label}</span>
                    <span style={{ opacity: 0.5 }}>{formatPortalDate(a.timestamp)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}

        {/* ── Onboarding Checklist (collapsed) ── */}
        {!checklistAllDone && (
          <section className="portal-card portal-card--flat portal-card--padded" style={{ gridColumn: 'span 12' }}>
            <details className="portal-details">
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>Onboarding Checklist</summary>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
                {([
                  { done: checklist.createAccount, label: 'Create account' },
                  { done: checklist.chooseProgram, label: noApplicationOnFile ? 'Start application' : 'Choose program' },
                  { done: checklist.completeAssessment, label: 'Complete preassessment' },
                  { done: checklist.startFirstCourse, label: 'Open your first course' },
                  { done: checklist.completeFirstCourse, label: 'Complete your first course' },
                ]).map(({ done, label }) => (
                  <li key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', fontSize: '0.875rem', color: done ? 'var(--color-on-surface-variant)' : 'var(--color-accent)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: done ? 'var(--color-green)' : 'var(--surface-container-highest)', '--ms-fill': done ? 1 : 0 }}>
                      {done ? 'check_circle' : 'circle'}
                    </span>
                    <span style={{ textDecoration: done ? 'line-through' : 'none' }}>{label}</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
      </div>
      )}
    </div>
  );
}
