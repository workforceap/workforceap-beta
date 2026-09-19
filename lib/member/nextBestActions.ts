/**
 * Prioritized “next best actions” for the member dashboard.
 * Pure function — easy to unit test and tune without DB calls.
 */

export type NextBestAction = {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  variant: 'urgent' | 'default';
  /** Higher sorts first */
  weight: number;
};

export type NextBestActionsContext = {
  /** Legacy display stage; predicates use facts because loaders map letters differently. */
  state: 'A' | 'B' | 'C' | 'D';
  noApplicationOnFile: boolean;
  enrolledProgram: string | null;
  assessmentCompleted: boolean;
  completedCourseCount?: number;
  starterProfileReviewRequired?: boolean;
  starterProfileMissingFields?: string[];
  hasResume: boolean;
  hasCompletedInterviewPractice?: boolean;
  profileCompletenessPct: number;
  profileMissingFields?: string[];
  jobApplicationCount: number;
  counselorUnreadCount: number;
  weeklyRecapUnopened: boolean;
  /** True when a WAP CourseEnrollment row exists; does not prove provider access. */
  courseEnrollmentActive?: boolean;
  placementPlacedAt?: Date | null;
  placementRetentionDecision?: string | null;
  /** True when the placement's retention outcome indicates the member lost/left the job (retentionDecision === 'not_retained' or retentionStatus === 'separated'). */
  placementSeparated?: boolean;
  /** When true, surfaces “continue training” ahead of lower-priority chores. */
  trainingCoursesIncomplete?: boolean;
  nextIncompleteCourseName?: string | null;
};

export function buildNextBestActions(ctx: NextBestActionsContext): NextBestAction[] {
  const out: NextBestAction[] = [];

  if (ctx.noApplicationOnFile) {
    out.push({
      id: 'submit_application',
      title: 'Submit a program application',
      body: "Takes about 10 minutes — we'll match you to a funded program and connect you with a counselor.",
      href: '/apply',
      cta: 'Start application',
      variant: 'urgent',
      weight: 100,
    });
  }

  if (!ctx.noApplicationOnFile && !ctx.enrolledProgram) {
    out.push({
      id: 'choose_program',
      title: 'Choose your program',
      body: 'Enrollment is tied to one funded program. Pick the track that fits your goals.',
      href: '/dashboard/program',
      cta: 'Choose program',
      variant: 'urgent',
      weight: 95,
    });
  }

  if (
    !!ctx.enrolledProgram &&
    ctx.assessmentCompleted &&
    ctx.courseEnrollmentActive === false
  ) {
    out.push({
      id: 'path_to_cert',
      title: 'See your path to certification',
      body: 'Understand how staff enrolls you in Coursera, what happens before your first class, and how exams fit in.',
      href: '/dashboard/program/start',
      cta: 'Open enrollment guide',
      variant: 'default',
      weight: 86,
    });
  }

  if (!!ctx.enrolledProgram && !ctx.assessmentCompleted) {
    if (ctx.starterProfileReviewRequired) {
      const missing = ctx.starterProfileMissingFields?.slice(0, 3) ?? [];
      const missingNote = missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '';
      out.push({
        id: 'review_starter_profile',
        title: 'Review your starter profile details',
        body: `Before WorkforceAP unlocks your Training Preassessment, confirm the contact and referral details your counselor entered.${missingNote}`,
        href: '/dashboard/profile',
        cta: 'Review profile',
        variant: 'urgent',
        weight: 92,
      });
    } else {
      out.push({
        id: 'skills_assessment',
        title: 'Complete your Training Preassessment',
        // A member with an enrolled program has already chosen it — do not tell
        // them to pick one first (rendered 2026-09-18 for an enrolled member).
        body: ctx.enrolledProgram
          ? 'This short preassessment helps personalize your training plan and identify roles that may be a good fit.'
          : 'After you choose a program, this short preassessment helps personalize your training plan and identify roles that may be a good fit.',
        href: '/dashboard/assessment',
        cta: 'Start preassessment',
        variant: 'urgent',
        weight: 90,
      });
    }
  }

  if (
    ctx.assessmentCompleted &&
    !!ctx.enrolledProgram &&
    ctx.trainingCoursesIncomplete &&
    (ctx.nextIncompleteCourseName ?? '').length > 0
  ) {
    out.push({
      id: 'continue_training',
      title: `Continue training: ${ctx.nextIncompleteCourseName}`,
      body: 'Open My Program for your next module, lesson links, and course checklist.',
      href: '/dashboard/program',
      cta: 'Open My Program',
      variant: 'urgent',
      weight: 86,
    });
  }

  if (ctx.counselorUnreadCount > 0) {
    out.push({
      id: 'counselor_messages',
      title: 'Message from your team',
      body:
        ctx.counselorUnreadCount === 1
          ? 'You have an unread message from your counselor or program team.'
          : `You have ${ctx.counselorUnreadCount} unread messages from your counselor or program team.`,
      href: '/dashboard/messages',
      cta: 'Open messages',
      variant: 'urgent',
      weight: 88,
    });
  }

  if (
    ctx.assessmentCompleted &&
    !!ctx.enrolledProgram &&
    (ctx.completedCourseCount ?? 0) === 0 &&
    !(ctx.trainingCoursesIncomplete && (ctx.nextIncompleteCourseName ?? '').length > 0)
  ) {
    out.push({
      id: 'launch_first_course',
      title: 'Launch your first course',
      body: 'Start training now so your first certificate, resume work, and job-readiness steps stay in motion together.',
      href: '/dashboard/program',
      cta: 'Open My Program',
      variant: 'urgent',
      weight: 86,
    });

    out.push({
      id: 'see_training_plan',
      title: 'See how training leads to job help',
      body: 'Get the simple step-by-step: preassessment, Coursera training, certificates, AI coaching, and counselor support.',
      href: '/dashboard/guide',
      cta: 'View guide',
      variant: 'default',
      weight: 79,
    });
  }

  if (!!ctx.enrolledProgram && !ctx.hasResume) {
    out.push({
      id: 'upload_resume',
      title: 'Add your resume',
      body: 'Upload a resume so employers and AI tools can tailor help to your background.',
      href: '/dashboard/ai-tools/resume-studio?view=rewrite',
      cta: 'Try resume rewriter',
      variant: 'default',
      weight: 80,
    });
  }

  if (ctx.placementPlacedAt && !ctx.placementRetentionDecision) {
    const days = (Date.now() - ctx.placementPlacedAt.getTime()) / 86400000;
    if (days >= 85 && days <= 130) {
      out.push({
        id: 'placement_retention_window_90',
        title: 'Quick check-in on your new role',
        body: 'You have been placed for a few months. If anything changed at work, message your counselor so grant reporting stays accurate.',
        href: '/dashboard/messages',
        cta: 'Message counselor',
        variant: 'default',
        weight: 74,
      });
    } else if (days >= 175 && days <= 230) {
      out.push({
        id: 'placement_retention_window_180',
        title: 'Six-month placement follow-up',
        body: 'Counselors use your updates for retention reporting. Send a short note in Counselor Chat if you have not already.',
        href: '/dashboard/messages',
        cta: 'Open Counselor Chat',
        variant: 'default',
        weight: 73,
      });
    }
  }

  // Job-loss re-activation: retentionDecision/retentionStatus indicates the
  // placement ended (separation). Supportive, high-weight nudge back toward
  // the job board + counselor rather than the routine 90/180 check-in above
  // (which only fires while retention is still undecided).
  if (ctx.placementSeparated) {
    out.push({
      id: 'placement_job_loss_reactivate',
      title: "Let's get you back on track",
      body: 'Job changes happen. Browse new openings that match your training and certifications — your counselor can help you get moving again.',
      href: '/dashboard/jobs',
      cta: 'Browse jobs',
      variant: 'urgent',
      weight: 91,
    });

    out.push({
      id: 'placement_job_loss_counselor',
      title: 'Talk to your counselor about next steps',
      body: 'Let your counselor know what happened — they can help with a job search plan and may have support options available.',
      href: '/dashboard/messages',
      cta: 'Message counselor',
      variant: 'urgent',
      weight: 90,
    });
  }

  if (!!ctx.enrolledProgram && ctx.assessmentCompleted && !ctx.hasCompletedInterviewPractice) {
    out.push({
      id: 'interview_practice',
      title: 'Practice your interview answers',
      body: 'Use guided interview practice to prepare for recruiter screens and counselor interviews.',
      href: '/dashboard/ai-tools/interview-practice?prefill=true',
      cta: 'Practice interviews',
      variant: 'default',
      weight: 72,
    });

    out.push({
      id: 'career_readiness',
      title: 'Build your job readiness plan',
      body: 'Review your readiness checklist so applications, interview prep, and counselor guidance stay in sync.',
      href: '/dashboard/readiness',
      cta: 'Open readiness',
      variant: 'default',
      weight: 68,
    });
  }

  if (
    ctx.assessmentCompleted &&
    !!ctx.enrolledProgram &&
    ctx.jobApplicationCount === 0
  ) {
    out.push({
      id: 'job_tracker',
      title: 'Track your first application',
      body: 'Save roles from our job board or add outside applications to keep momentum visible.',
      href: '/dashboard/job-applications',
      cta: 'Open tracker',
      variant: 'default',
      weight: 60,
    });
  }

  if (ctx.profileCompletenessPct < 55 && ctx.enrolledProgram) {
    const missing = ctx.profileMissingFields?.slice(0, 3) ?? [];
    const missingNote = missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '';
    out.push({
      id: 'complete_profile',
      title: 'Strengthen your profile',
      body: `Profile ${ctx.profileCompletenessPct}% complete — employers and AI tools use this data.${missingNote}`,
      href: '/dashboard/profile',
      cta: 'Complete profile',
      variant: 'default',
      weight: 45,
    });
  }

  if (ctx.weeklyRecapUnopened) {
    out.push({
      id: 'weekly_recap',
      title: 'Your weekly recap is ready',
      body: 'See what you accomplished this week and suggested focus areas.',
      href: '/dashboard/weekly-recap',
      cta: 'View recap',
      variant: 'default',
      weight: 40,
    });
  }

  // Always offer at least one default — never let a fresh member see a
  // blank "what's next" surface.
  out.push({
    id: 'default_counselor',
    title: 'Talk to your counselor',
    body: 'Not sure what to do next? Send a quick message — your counselor can suggest the best step from here.',
    href: '/dashboard/messages',
    cta: 'Message counselor',
    variant: 'default',
    weight: 1,
  });

  out.sort((a, b) => b.weight - a.weight);

  const seen = new Set<string>();
  const deduped: NextBestAction[] = [];
  for (const a of out) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    deduped.push(a);
  }

  return deduped.slice(0, 4);
}
