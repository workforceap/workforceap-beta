/**
 * Saved workflow facts only. Neither enrollment nor staff approval proves provider access.
 *
 * WAP-91: besides the three saved states, the member sees which stage is the
 * current one, when that stage entered its current state (only when that
 * moment is actually stored), who owns the next move and what happens next.
 * Nothing here is inferred from mutable timestamps such as `updatedAt`.
 */
export type MemberApprovalFacts = {
  applications?: Array<{ status: string; submittedAt: Date | null }>;
  wioaReviewStatus?: string | null;
  /** Written by staff on every WIOA review status change, so it dates the current intake state. */
  wioaReviewedAt?: Date | null;
  courseraEnrollmentApproved?: boolean;
  courseraEnrollmentApprovedAt?: Date | null;
  /** Active counselor assignment (newest first) — names who owns staff-side steps. */
  counselorAssignments?: Array<{
    counselor: { user: { fullName: string | null } | null } | null;
  }>;
};

export type ApprovalStageKey = 'application' | 'intake' | 'training';
export type ApprovalStageState = 'complete' | 'current' | 'upcoming' | 'blocked';
export type ApprovalOwner = 'member' | 'staff' | 'counselor' | 'none';

export type MemberApprovalStage = {
  state: ApprovalStageState;
  /** ISO date the stage entered its current pending state; null when not stored. */
  startedAt: string | null;
  /** ISO date the stage completed (verified/approved) or was closed; null when not stored. */
  completedAt: string | null;
  owner: ApprovalOwner;
  /** `memberApproval.next.<stage>.<nextKey>` translation key suffix. */
  nextKey: string;
};

export type MemberApprovalStatus = {
  application: 'not_submitted' | 'pending' | 'needs_info' | 'approved' | 'denied' | 'unknown';
  submittedAt: string | null;
  intake: 'pending' | 'in_review' | 'verified' | 'not_eligible' | 'needs_info' | 'unknown';
  reviewedAt: string | null;
  training: 'approved' | 'pending' | 'unknown';
  approvedAt: string | null;
  providerAccess: 'unknown';
  /** The stage the member is waiting on; `complete` once training is approved. */
  currentStage: ApprovalStageKey | 'complete';
  /** Saved full name of the active counselor, when one is assigned. */
  counselorName: string | null;
  stages: Record<ApprovalStageKey, MemberApprovalStage>;
};

const applicationStates = { PENDING: 'pending', NEEDS_INFO: 'needs_info', APPROVED: 'approved', DENIED: 'denied' } as const;
const intakeStates = ['pending', 'in_review', 'verified', 'not_eligible', 'needs_info'] as const;
const INTAKE_PENDING_STATES: ReadonlySet<MemberApprovalStatus['intake']> = new Set(['pending', 'in_review', 'needs_info']);
const INTAKE_DECIDED_STATES: ReadonlySet<MemberApprovalStatus['intake']> = new Set(['verified', 'not_eligible']);

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function staffOwner(counselorName: string | null): ApprovalOwner {
  return counselorName ? 'counselor' : 'staff';
}

export function buildMemberApprovalStatus(facts: MemberApprovalFacts): MemberApprovalStatus {
  const application = facts.applications?.[0];
  const applicationState: MemberApprovalStatus['application'] = application
    ? applicationStates[application.status as keyof typeof applicationStates] ?? 'unknown'
    : facts.applications ? 'not_submitted' : 'unknown';
  const intake: MemberApprovalStatus['intake'] = intakeStates.includes(
    facts.wioaReviewStatus as typeof intakeStates[number],
  )
    ? (facts.wioaReviewStatus as typeof intakeStates[number])
    : 'unknown';
  const training: MemberApprovalStatus['training'] = facts.courseraEnrollmentApproved === true
    ? 'approved'
    : facts.courseraEnrollmentApproved === false ? 'pending' : 'unknown';

  const submittedAt = iso(application?.submittedAt);
  const reviewedAt = iso(facts.wioaReviewedAt);
  const approvedAt = training === 'approved' ? iso(facts.courseraEnrollmentApprovedAt) : null;
  const counselorName = facts.counselorAssignments?.[0]?.counselor?.user?.fullName?.trim() || null;

  const applicationComplete = applicationState === 'approved';
  const intakeComplete = intake === 'verified';
  const trainingComplete = training === 'approved';

  const currentStage: MemberApprovalStatus['currentStage'] = !applicationComplete
    ? 'application'
    : !intakeComplete
      ? 'intake'
      : !trainingComplete
        ? 'training'
        : 'complete';

  // ── Application ──
  const applicationOwner: ApprovalOwner = (() => {
    switch (applicationState) {
      case 'not_submitted':
      case 'needs_info':
      case 'denied':
        return 'member';
      case 'pending':
      case 'unknown':
        return staffOwner(counselorName);
      case 'approved':
        return 'none';
    }
  })();
  const applicationStage: MemberApprovalStage = {
    state: applicationComplete ? 'complete' : applicationState === 'denied' ? 'blocked' : 'current',
    // The saved submission moment is when review began. Application decisions
    // have no dedicated decided-at column, so completion is not dated here.
    startedAt: applicationState === 'not_submitted' ? null : submittedAt,
    completedAt: null,
    owner: applicationOwner,
    nextKey: applicationState,
  };

  // ── Intake review ──
  const intakeState: ApprovalStageState = intakeComplete
    ? 'complete'
    : intake === 'not_eligible'
      ? 'blocked'
      : currentStage === 'intake'
        ? 'current'
        : 'upcoming';
  const intakeOwner: ApprovalOwner = intakeState === 'upcoming' || intakeState === 'complete'
    ? 'none'
    : intake === 'needs_info'
      ? 'member'
      : staffOwner(counselorName);
  const intakeStage: MemberApprovalStage = {
    state: intakeState,
    // Staff write wioaReviewedAt on every status change, so for a pending
    // state it dates when that state began. The member self-screen sets
    // `pending` without a timestamp, which stays "not recorded".
    startedAt: INTAKE_PENDING_STATES.has(intake) ? reviewedAt : null,
    completedAt: INTAKE_DECIDED_STATES.has(intake) ? reviewedAt : null,
    owner: intakeOwner,
    nextKey: intakeState === 'upcoming' ? 'upcoming' : intake,
  };

  // ── Training approval ──
  const trainingState: ApprovalStageState = trainingComplete
    ? 'complete'
    : currentStage === 'training'
      ? 'current'
      : 'upcoming';
  const trainingOwner: ApprovalOwner = trainingState === 'upcoming'
    ? 'none'
    : trainingComplete
      ? 'member'
      : staffOwner(counselorName);
  const trainingStage: MemberApprovalStage = {
    state: trainingState,
    // No column records when training approval became pending; do not infer
    // it from the intake verification date.
    startedAt: null,
    completedAt: approvedAt,
    owner: trainingOwner,
    nextKey: trainingState === 'upcoming' ? 'upcoming' : training,
  };

  return {
    application: applicationState,
    submittedAt,
    intake,
    reviewedAt,
    training,
    approvedAt,
    providerAccess: 'unknown',
    currentStage,
    counselorName,
    stages: { application: applicationStage, intake: intakeStage, training: trainingStage },
  };
}
