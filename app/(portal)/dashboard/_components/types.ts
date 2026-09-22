import type { ReactNode } from 'react';
import type { getTranslations } from 'next-intl/server';
import type { MemberApplicationStatusView } from '@/lib/member/memberApplicationStatus';
import type { NextBestAction } from '@/lib/member/nextBestActions';
import type { FirstValueAction } from '@/lib/member/firstValueActions';
import type { CareerMatchResult } from '@/lib/onet/types';
import type { LevelName } from '@/lib/member/pointsConfig';
import type { MemberDashboardTab, MemberDashboardTabLink } from '@/lib/member/dashboardTabs';
import type { MemberCounselorContext } from '@/lib/member/counselorContext';

/** The `t` function from `getTranslations('dashboard')`, threaded from page.tsx. */
export type DashboardTranslator = Awaited<ReturnType<typeof getTranslations>>;

/** Dashboard state machine letter computed in page.tsx (memberState.stateLetter). */
export type DashboardStateLetter = 'A' | 'B' | 'C' | 'D';

/** Serialized application status built in page.tsx from memberState.application. */
export type ApplicationStatusSummary = {
  label: string;
  submittedAt: string | null;
  programInterest: string | null;
  nextStep: string;
  nextStepHref: string;
  showResponseEstimate: boolean;
  progressIndex: number | null;
  stage: MemberApplicationStatusView['stage'];
};

export type ProgramSelectorOption = {
  id: string;
  programSlug: string;
  programTitle: string;
  isPrimary: boolean;
};

export type PointsSummary = {
  total: number;
  level: LevelName;
};

export type PointsTransactionSummary = {
  id: string;
  event: string;
  points: number;
  note: string | null;
  createdAt: Date;
};

export type RecentToolSummary = {
  id: string;
  toolType: string;
  inputSummary: string | null;
  createdAt: Date;
};

/** Props for the extracted desktop view. All values are computed in page.tsx. */
export type DesktopDashboardProps = {
  activeTab: MemberDashboardTab;
  availableTabs: MemberDashboardTabLink[];
  userId: string;
  showMemberOnboarding: boolean;
  showMemberTour: boolean;
  readOnlyAudit: boolean;
  superAdmin: boolean;
  intakeExtra: {
    fullName: string | null;
    phone: string | null;
    interviewEligible: boolean | null;
    interviewRequestedAt: Date | null;
    interviewCompletedAt: Date | null;
    preScreeningResponse: { id: string } | null;
    onboardingCurrentStep: number;
    profile: {
      city: string | null;
      state: string | null;
      zip: string | null;
      profilePhone: string | null;
      profileAddress: string | null;
      referralSource: string | null;
    } | null;
  } | null;
  wizardProgramInterest: string;
  /** Assigned counselor + measured wait for the wizard's closing step; null when the wizard is not shown. */
  counselorContext: MemberCounselorContext | null;
  todayHero: ReactNode;
  skillMissionTeaser: ReactNode;
  showProgramSelector: boolean;
  enrolledProgram: string | null;
  programSelectorOptions: ProgramSelectorOption[];
  recommendedActions: Array<{ label: string; href: string }>;
  jobSearchUrl: string | null;
  aiToolsUsedCount: number;
  firstName: string;
  dominantNextAction: NextBestAction | null;
  showStuckCounselor: boolean;
  progressPercentDisplay: number;
  nextBestActions: NextBestAction[];
  assessmentCompleted: boolean;
  starterProfileReviewRequired: boolean;
  starterProfileMissingLabels: string[];
  dashboardState: DashboardStateLetter;
  programTitle: string | undefined;
  enrolledAt: Date | null;
  assessmentScorePct: number | null;
  completedCount: number;
  totalCourses: number;
  nextMilestone: string | undefined;
  lastThree: Array<{ label: string; timestamp: Date }>;
  checklist: {
    createAccount: boolean;
    chooseProgram: boolean;
    completeAssessment: boolean;
    startFirstCourse: boolean;
    completeFirstCourse: boolean;
  };
  checklistAllDone: boolean;
  applicationStatus: ApplicationStatusSummary | null;
  noApplicationOnFile: boolean;
  userAge: number | null;
  isMinor: boolean;
  showFirstValuePanel: boolean;
  firstValueActions: FirstValueAction[];
  firstValueSecondsSinceSignup: number | null;
  progressStripProps: {
    intake: boolean;
    assessment: boolean;
    trainingStarted: boolean;
    certsComplete: boolean;
    employed: boolean;
  };
  careerMatchFromProfile: CareerMatchResult | null;
  careerPlanTrainingNextStep: {
    programTitle: string;
    href: string;
    ctaLabel: string;
    detail: string;
  } | null;
  memberPoints: PointsSummary | null;
  recentTx: PointsTransactionSummary[];
  jobOffers: Array<{ id: string; company: string }>;
  showMatchedRoles: boolean;
  /** First-cert milestone progress (0–100) from getMemberState. */
  firstCertProgressPercent: number;
};
