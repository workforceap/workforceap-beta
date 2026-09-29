import type { Application, ApplicationStatus } from '@prisma/client';

export type MemberApplicationStage =
  | 'applied'
  | 'under_review'
  | 'accepted'
  | 'enrolled'
  | 'active'
  | 'rejected';

export const MEMBER_APPLICATION_PROGRESS_STEPS = [
  'Applied',
  'Under review',
  'Approved',
  'Program selected',
  'Training preassessment complete',
] as const;

export type MemberApplicationStatusView = {
  stage: MemberApplicationStage;
  label: string;
  submittedAt: Date | null;
  programInterest: string | null;
  nextStep: string;
  nextStepHref: string;
  showResponseEstimate: boolean;
  /** 1–5 = index in MEMBER_APPLICATION_PROGRESS_STEPS; null when not on linear path (e.g. rejected) */
  progressIndex: number | null;
};

function stageFromRow(
  app: Pick<Application, 'status' | 'programInterest' | 'submittedAt' | 'createdAt'>,
  member: { enrolledProgram: string | null; enrolledAt: Date | null; assessmentCompleted: boolean }
): MemberApplicationStage {
  // Enrollment supersedes application status — once enrolled, show training state
  if (member.enrolledProgram) {
    if (member.assessmentCompleted) return 'active';
    return 'enrolled';
  }
  if (app.status === 'DENIED') return 'rejected';
  if (app.status === 'PENDING') return 'applied';
  if (app.status === 'NEEDS_INFO') return 'under_review';
  if (app.status === 'APPROVED') return 'accepted';
  return 'applied';
}

export function buildMemberApplicationStatusView(
  app: Pick<Application, 'status' | 'programInterest' | 'submittedAt' | 'createdAt'> | null,
  member: { enrolledProgram: string | null; enrolledAt: Date | null; assessmentCompleted: boolean },
  intake?: {
    preScreeningDone: boolean;
    interviewEligible: boolean;
    interviewRequested: boolean;
    interviewCompleted: boolean;
  }
): MemberApplicationStatusView | null {
  if (!app) return null;

  const stage = stageFromRow(app, member);
  const submittedAt = app.submittedAt ?? app.createdAt;
  const programInterest = app.programInterest ?? null;

  const showResponseEstimate = app.status === 'PENDING' || app.status === 'NEEDS_INFO';

  const labels: Record<MemberApplicationStage, string> = {
    applied: 'Applied',
    under_review: 'Under review',
    accepted: 'Approved',
    enrolled: 'Program selected',
    active: 'Training preassessment complete',
    rejected: 'Application closed',
  };

  // Active stage next steps vary by pre-screening / interview progress
  const activeNextStep = ((): { text: string; href: string } => {
    if (!intake) {
      return {
        text: 'Your Training Preassessment is complete. Follow the next step on your dashboard to keep moving toward training and job support.',
        href: '/dashboard/ai-tools',
      };
    }
    if (intake.interviewCompleted) {
      return {
        text: 'Interview complete. Keep working through training and job search steps.',
        href: '/dashboard/ai-tools',
      };
    }
    if (intake.interviewRequested) {
      return {
        text: 'Interview requested — watch your email for scheduling details.',
        href: '/dashboard/messages',
      };
    }
    if (intake.interviewEligible) {
      return {
        text: "You're interview eligible. Request your interview or attend a scheduled session.",
        // WAP-197: the interview request lives on the Skills check page.
        href: '/dashboard/assessment#interview',
      };
    }
    if (intake.preScreeningDone) {
      return {
        text: 'Pre-screening submitted — a counselor will review and reach out by email.',
        href: '/dashboard/messages',
      };
    }
    return {
      text: 'Complete your pre-screening to become interview eligible.',
      // WAP-197: the pre-screening form lives on the Skills check page.
      href: '/dashboard/assessment#pre-screening',
    };
  })();

  const nextSteps: Record<MemberApplicationStage, string> = {
    applied:
      'Our team is reviewing your application. Watch your email for next steps from a counselor.',
    under_review:
      'We may need a bit more information. Check your email for any requests from our team.',
    accepted:
      'Choose your program and complete your profile so we can finalize enrollment.',
    enrolled:
      'Complete your Training Preassessment so your dashboard can show the right training steps.',
    active: activeNextStep.text,
    rejected:
      "We're unable to move forward with this application at this time. Reach out to us at info@workforceap.org if you have questions or would like to discuss next steps.",
  };

  const nextStepHrefs: Record<MemberApplicationStage, string> = {
    applied: '/dashboard/messages',
    under_review: '/dashboard/messages',
    accepted: '/dashboard/profile',
    enrolled: '/dashboard/assessment',
    active: activeNextStep.href,
    rejected: 'mailto:info@workforceap.org',
  };

  const progressIndex: number | null =
    stage === 'applied'
      ? 1
      : stage === 'under_review'
        ? 2
        : stage === 'accepted'
          ? 3
          : stage === 'enrolled'
            ? 4
            : stage === 'active'
              ? 5
              : null;

  return {
    stage,
    label: labels[stage],
    submittedAt,
    programInterest,
    nextStep: nextSteps[stage],
    nextStepHref: nextStepHrefs[stage],
    showResponseEstimate,
    progressIndex,
  };
}

export function applicationStatusForPublicLookup(status: ApplicationStatus): 'applied' | 'under_review' | 'accepted' | 'rejected' {
  if (status === 'DENIED') return 'rejected';
  if (status === 'APPROVED') return 'accepted';
  if (status === 'NEEDS_INFO') return 'under_review';
  return 'applied';
}
