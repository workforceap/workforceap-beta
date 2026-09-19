import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import DashboardHomeClient from '@/components/portal/DashboardHomeClient';
import PortalEntryClient from '@/components/onboarding/PortalEntryClient';
import { MEMBER_PORTAL_TOUR_STEPS } from '@/lib/onboarding/portalTourSteps';
import MemberDashboardVoiceSectionLazy from '@/components/portal/MemberDashboardVoiceSectionLazy';
import VoiceSectionErrorBoundary from '@/components/portal/VoiceSectionErrorBoundary';
import MemberProgressStrip from '@/components/portal/MemberProgressStrip';
import GoalsModule from '@/components/portal/GoalsModule';
import PortalEntryErrorBoundary from '@/components/portal/PortalEntryErrorBoundary';
import DashboardProgramSelector from '@/components/portal/DashboardProgramSelector';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import JobsSkeleton from '@/components/dashboard/JobsSkeleton';
import ErrorBoundary from '@/components/error/ErrorBoundary';
import DashboardErrorFallback from '@/components/error/DashboardErrorFallback';
import RequestHelpButton from '@/components/portal/RequestHelpButton';
import MemberFeedbackButton from '@/components/portal/MemberFeedbackButton';
import MemberFirstCertProgressBar from '@/components/portal/MemberFirstCertProgressBar';
import type { DesktopDashboardProps } from './types';

const MemberCareerPathSection = dynamic(
  () => import('@/components/portal/MemberCareerPathSection'),
  { loading: () => null }
);
const MatchedRoles = dynamic(() => import('@/components/portal/MatchedRoles'), {
  loading: () => <JobsSkeleton count={4} />,
});
const LogCertificationModal = dynamic(() => import('../LogCertificationModal'), {
  loading: () => null,
});
const PlacementConfirmationStrip = dynamic(() => import('../PlacementConfirmationStrip'), {
  loading: () => null,
});
const PointsWidget = dynamic(() => import('@/components/portal/PointsWidget'), {
  loading: () => null,
});

/* Desktop view (hidden on mobile) - extracted verbatim from page.tsx. All
   data is loaded in page.tsx and passed down; nothing is re-fetched here. */
export default function DesktopDashboard({
  activeTab,
  availableTabs,
  userId,
  showMemberOnboarding,
  showMemberTour,
  readOnlyAudit,
  superAdmin,
  intakeExtra,
  wizardProgramInterest,
  todayHero,
  skillMissionTeaser,
  showProgramSelector,
  enrolledProgram,
  programSelectorOptions,
  recommendedActions,
  jobSearchUrl,
  aiToolsUsedCount,
  firstName,
  dominantNextAction,
  showStuckCounselor,
  progressPercentDisplay,
  nextBestActions,
  assessmentCompleted,
  starterProfileReviewRequired,
  starterProfileMissingLabels,
  dashboardState,
  programTitle,
  enrolledAt,
  assessmentScorePct,
  completedCount,
  totalCourses,
  nextMilestone,
  lastThree,
  checklist,
  checklistAllDone,
  applicationStatus,
  noApplicationOnFile,
  userAge,
  isMinor,
  showFirstValuePanel,
  firstValueActions,
  firstValueSecondsSinceSignup,
  progressStripProps,
  careerMatchFromProfile,
  careerPlanTrainingNextStep,
  memberPoints,
  recentTx,
  jobOffers,
  showMatchedRoles,
  firstCertProgressPercent,
}: DesktopDashboardProps) {
  return (
      <div className="wa-hidden md:wa-block">
        <PortalEntryErrorBoundary>
          <Suspense fallback={<DashboardSkeleton />}>
            <PortalEntryClient
              portal="member"
              tourStorageUserId={userId}
              showOnboardingWizard={showMemberOnboarding}
              showTour={showMemberTour}
              readOnlyAudit={readOnlyAudit}
              isSuperAdmin={superAdmin}
              tourSteps={MEMBER_PORTAL_TOUR_STEPS}
              wizardProps={{
                initialFullName: intakeExtra?.fullName ?? '',
                initialPhone: intakeExtra?.profile?.profilePhone ?? intakeExtra?.phone ?? '',
                initialAddress: intakeExtra?.profile?.profileAddress ?? '',
                initialCity: intakeExtra?.profile?.city ?? '',
                initialState: intakeExtra?.profile?.state ?? '',
                initialZip: intakeExtra?.profile?.zip ?? '',
                initialProgramInterest: wizardProgramInterest,
                initialReferralSource: intakeExtra?.profile?.referralSource ?? '',
                initialStep: intakeExtra?.onboardingCurrentStep ?? 0,
              }}
            >
              {activeTab === 'home' ? (
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.25rem 2rem 0' }}>
                  {todayHero}
                </div>
              ) : null}
              {showProgramSelector && enrolledProgram && activeTab !== 'opportunities' && (
                <div
                  style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '0.75rem 2rem 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 800,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    Active program
                  </span>
                  <DashboardProgramSelector
                    options={programSelectorOptions}
                    activeProgramSlug={enrolledProgram}
                  />
                </div>
              )}
              {availableTabs.length > 1 ? (
                <nav
                  aria-label="Dashboard sections"
                  style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '1rem 2rem 1.25rem',
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  {availableTabs.map((tab) => (
                    <a
                      key={tab.id}
                      href={tab.href}
                      aria-current={activeTab === tab.id ? 'page' : undefined}
                      style={{
                        padding: '0.6rem 0.95rem',
                        borderRadius: '999px',
                        textDecoration: 'none',
                        fontSize: '0.875rem',
                        fontWeight: 800,
                        color: activeTab === tab.id ? 'var(--color-on-primary)' : 'var(--color-on-surface)',
                        background: activeTab === tab.id ? 'var(--color-primary)' : 'var(--surface-container-low)',
                      }}
                    >
                      {tab.label}
                    </a>
                  ))}
                </nav>
              ) : null}
              {activeTab === 'home' ? (
                <>
                  <ErrorBoundary fallback={<DashboardErrorFallback section="profile" />}>
                    <Suspense fallback={<DashboardSkeleton />}>
                      <DashboardHomeClient
                        recommendedActions={recommendedActions}
                        jobSearchUrl={jobSearchUrl}
                        aiToolsUsedCount={aiToolsUsedCount}
                        firstName={firstName}
                        dominantNextAction={dominantNextAction}
                        showStuckCounselorStrip={showStuckCounselor}
                        blendedTrainingProgressPct={progressPercentDisplay}
                        nextBestActions={nextBestActions}
                        assessmentDone={assessmentCompleted}
                        preScreeningDone={!!intakeExtra?.preScreeningResponse}
                        interviewEligible={intakeExtra?.interviewEligible ?? false}
                        interviewRequestedAt={intakeExtra?.interviewRequestedAt ?? null}
                        interviewCompletedAt={intakeExtra?.interviewCompletedAt ?? null}
                        starterProfileReviewRequired={starterProfileReviewRequired}
                        starterProfileMissingFields={starterProfileMissingLabels}
                        state={dashboardState}
                        programTitle={programTitle}
                        enrolledAt={enrolledAt}
                        assessmentScorePct={assessmentScorePct}
                        completedCount={completedCount}
                        totalCourses={totalCourses}
                        nextMilestone={nextMilestone}
                        recentActivity={lastThree}
                        checklist={checklist}
                        checklistAllDone={checklistAllDone}
                        applicationStatus={applicationStatus}
                        noApplicationOnFile={noApplicationOnFile}
                        age={userAge}
                        isMinor={isMinor}
                        showFirstValuePanel={showFirstValuePanel}
                        firstValueActions={firstValueActions}
                        firstValueSecondsSinceSignup={firstValueSecondsSinceSignup}
                        homeOnly
                      />
                    </Suspense>
                  </ErrorBoundary>
                  <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2rem 0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <RequestHelpButton />
                    <MemberFeedbackButton />
                  </div>
                </>
              ) : null}
              {activeTab === 'learning' ? (
                <>
                  <div
                    style={{
                      maxWidth: 1200,
                      margin: '0 auto',
                      padding: '0 2rem 1.25rem',
                    }}
                  >
                    <ErrorBoundary fallback={<DashboardErrorFallback section="progress" />}>
                      <MemberFirstCertProgressBar
                        progress={{
                          percent: firstCertProgressPercent,
                          stageLabel: totalCourses > 0 && completedCount === totalCourses
                            ? 'Training courses complete'
                            : assessmentCompleted ? 'Recorded course progress' : 'Complete your assessment',
                          isComplete: totalCourses > 0 && completedCount === totalCourses,
                          stepsComplete: completedCount,
                          stepsTotal: totalCourses,
                        }}
                      />
                    </ErrorBoundary>
                  </div>
                  <div
                    style={{
                      maxWidth: 1200,
                      margin: '0 auto',
                      padding: '0 2rem 1.25rem',
                    }}
                  >
                    <ErrorBoundary fallback={<DashboardErrorFallback section="progress" />}>
                      <MemberProgressStrip {...progressStripProps} />
                    </ErrorBoundary>
                  </div>
                  <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2rem 1.25rem' }}>
                    <ErrorBoundary fallback={<DashboardErrorFallback section="progress" />}>
                      {skillMissionTeaser}
                    </ErrorBoundary>
                  </div>
                  <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2rem' }}>
                    <ErrorBoundary fallback={<DashboardErrorFallback section="progress" />}>
                      <MemberCareerPathSection
                        careerMatch={careerMatchFromProfile}
                        coursesCompletedCount={completedCount}
                        trainingNextStep={careerPlanTrainingNextStep}
                      />
                    </ErrorBoundary>
                    <ErrorBoundary fallback={<DashboardErrorFallback section="progress" />}>
                      <div id="goals" role="region" aria-label="Goals" style={{ maxWidth: 520, marginBottom: 'var(--space-6)', scrollMarginTop: '5rem' }}>
                        <GoalsModule />
                      </div>
                    </ErrorBoundary>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
                      <div style={{ maxWidth: '300px' }}>
                        <ErrorBoundary fallback={<DashboardErrorFallback section="training" />}>
                          <LogCertificationModal />
                        </ErrorBoundary>
                      </div>
                      {memberPoints && (
                        <div style={{ flex: '1 1 280px', maxWidth: '340px' }}>
                          <PointsWidget total={memberPoints.total} level={memberPoints.level} recent={recentTx} />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
              {activeTab === 'opportunities' ? (
                <>
                  <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2rem 1.5rem' }}>
                    <VoiceSectionErrorBoundary>
                      <MemberDashboardVoiceSectionLazy />
                    </VoiceSectionErrorBoundary>
                  </div>
                  <ErrorBoundary fallback={<DashboardErrorFallback section="activity" />}>
                    <PlacementConfirmationStrip offers={jobOffers} />
                  </ErrorBoundary>
                  {showMatchedRoles && (userAge === null || userAge >= 14) ? (
                    <ErrorBoundary fallback={<DashboardErrorFallback section="jobs" />}>
                      <Suspense fallback={<JobsSkeleton count={4} />}>
                        <MatchedRoles />
                      </Suspense>
                    </ErrorBoundary>
                  ) : null}
                </>
              ) : null}
              {/* Recent AI Activity is rendered in the mobile view above ΓÇö
                  suppressed here so the same data doesn't appear twice in the DOM
                  on wider viewports. DashboardHomeClient surfaces activity inline. */}
            </PortalEntryClient>
          </Suspense>
        </PortalEntryErrorBoundary>
      </div>
  );
}
