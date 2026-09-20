/**
 * Applicant auto-review TRIAGE — pre-sorts open applications for the admin
 * review queue and pre-fills the review checklist from data the applicant has
 * already given us. It never decides anything: approve / deny / needs-info stay
 * a human click on the existing buttons, and nothing here changes who may
 * click them or what happens when they do.
 *
 * Rules are deliberately conservative and explainable. Every bucket comes with
 * plain-language reasons, and the vocabulary is "intake complete" / "concern
 * flagged" — never "eligible" or "approved", because the apply-stage screen
 * marks `qualifies` when ANY ONE of three yes/no questions is yes (one of them
 * being work authorization), which is an intake signal, not a determination.
 *
 * Pure function over already-stored data; no new columns, no I/O.
 */

import type { WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { wicOnlyPublicAssistance } from '@/lib/apply/publicAssistance';

export type ApplicantTriageBucket =
  | 'ready_to_review'
  | 'needs_human'
  | 'missing_info'
  | 'not_eligible_signal';

export const APPLICANT_TRIAGE_BUCKETS: readonly ApplicantTriageBucket[] = [
  'ready_to_review',
  'needs_human',
  'missing_info',
  'not_eligible_signal',
];

/** Stable machine codes; the UI maps them to (translated) copy. */
export type ApplicantTriageReasonCode =
  | 'work_auth_answered_no'
  | 'staff_marked_not_eligible'
  | 'staff_requested_info'
  | 'staff_wioa_needs_info'
  | 'contact_incomplete'
  | 'program_missing'
  | 'program_unrecognized'
  | 'intake_screening_missing'
  | 'work_auth_unanswered'
  | 'work_auth_conflict'
  | 'funding_fit_not_indicated'
  | 'wioa_signal_unclear'
  | 'minor_applicant'
  | 'wioa_review_in_progress'
  | 'help_applying_requested'
  | 'intake_complete';

export type ApplicantTriageChecklistKey =
  | 'contact'
  | 'program'
  | 'intake_screening'
  | 'work_authorization'
  | 'funding_fit_signal'
  | 'partner_referral'
  | 'wioa_staff_review';

export type ApplicantTriageChecklistItem = {
  key: ApplicantTriageChecklistKey;
  /** English default; UI may replace it with a translated label. */
  label: string;
  ok: boolean;
};

export type ApplicantTriageResult = {
  bucket: ApplicantTriageBucket;
  /** English defaults, one per `reasonCodes` entry, same order. */
  reasons: string[];
  reasonCodes: ApplicantTriageReasonCode[];
  checklist: ApplicantTriageChecklistItem[];
};

export type YesNo = 'yes' | 'no' | null | undefined;

export type ApplicantTriageInput = {
  application: {
    status: 'PENDING' | 'APPROVED' | 'DENIED' | 'NEEDS_INFO';
    programInterest: string | null;
    referralPartnerId?: string | null;
    referralSource?: string | null;
  };
  user: {
    fullName: string | null;
    email: string | null;
    phone: string | null;
    programInterest: string | null;
    /** staff WIOA workflow: pending | in_review | verified | not_eligible | needs_info */
    wioaReviewStatus: string | null;
  };
  profile: {
    profilePhone?: string | null;
    authorizedToWork?: boolean | null;
    usCitizen?: boolean | null;
    isMinor?: boolean | null;
  } | null;
  /** Apply-funnel quick screen (q1 unemployed/underemployed, q2 income < $60k, q3 work authorization). */
  applyScreening: {
    q1: YesNo;
    q2: YesNo;
    q3: YesNo;
    receivingUnemployment?: YesNo;
    snapWic?: YesNo;
    /** WAP-53: programs named after snapWic = yes (tanf | wic | snap | other_unsure). */
    publicAssistancePrograms?: string[] | null;
    /** WAP-53: applicant wants help applying for benefits — a staff action signal. */
    publicAssistanceHelpRequested?: YesNo;
    partnerAmbassadorReferral?: string | null;
  } | null;
  /** Parsed portal WIOA self-screening snapshot, if the member completed it. */
  wioaSnapshot: WioaQualificationSnapshot | null;
  /** Whether the program the applicant chose resolves to a catalog program. `null` = caller did not check. */
  programRecognized: boolean | null;
  /** Any partner referral row on the member (independent of the application's referralPartnerId). */
  hasPartnerReferral?: boolean;
};

export const APPLICANT_TRIAGE_REASON_TEXT: Record<ApplicantTriageReasonCode, string> = {
  work_auth_answered_no: 'Applicant answered "no" to work authorization at intake',
  staff_marked_not_eligible: 'Staff WIOA review is marked not eligible',
  staff_requested_info: 'Staff already asked the applicant for more information',
  staff_wioa_needs_info: 'Staff WIOA review is waiting on more information',
  contact_incomplete: 'Name, email or phone is missing',
  program_missing: 'No program chosen',
  program_unrecognized: 'Chosen program is not in the catalog',
  intake_screening_missing: 'No intake screening answers on file',
  work_auth_unanswered: 'Work authorization was not answered',
  work_auth_conflict: 'Work authorization answers conflict across intake forms',
  funding_fit_not_indicated: 'Intake answers do not indicate a funding fit yet',
  wioa_signal_unclear: 'Portal WIOA self-screening signal is unclear',
  minor_applicant: 'Applicant is under 18 (parental consent path)',
  wioa_review_in_progress: 'Staff WIOA review is still in progress',
  help_applying_requested: 'Applicant asked for help applying for TANF / WIC / SNAP benefits',
  intake_complete: 'Intake complete: contact, program, screening and work authorization on file',
};

export const APPLICANT_TRIAGE_CHECKLIST_TEXT: Record<ApplicantTriageChecklistKey, string> = {
  contact: 'Contact details on file',
  program: 'Program chosen and in catalog',
  intake_screening: 'Intake screening answered',
  work_authorization: 'Work authorization answered yes',
  funding_fit_signal: 'Intake indicates a funding fit (not a determination)',
  partner_referral: 'Partner or ambassador referral noted',
  wioa_staff_review: 'Staff WIOA review recorded as verified',
};

export const APPLICANT_TRIAGE_BUCKET_TEXT: Record<ApplicantTriageBucket, string> = {
  ready_to_review: 'Ready to review',
  needs_human: 'Needs a human look',
  missing_info: 'Missing information',
  not_eligible_signal: 'Concern flagged',
};

function nonEmpty(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Tri-state work authorization from every place the applicant may have answered it. */
function workAuthorization(input: ApplicantTriageInput): { value: boolean | null; conflict: boolean } {
  const votes: boolean[] = [];
  if (input.applyScreening?.q3 === 'yes') votes.push(true);
  if (input.applyScreening?.q3 === 'no') votes.push(false);
  if (typeof input.profile?.authorizedToWork === 'boolean') votes.push(input.profile.authorizedToWork);
  if (input.profile?.usCitizen === true) votes.push(true);
  if (votes.length === 0) return { value: null, conflict: false };
  const anyYes = votes.includes(true);
  const anyNo = votes.includes(false);
  if (anyYes && anyNo) return { value: null, conflict: true };
  return { value: anyYes, conflict: false };
}

/**
 * Whether the intake answers point at a funding fit. Work authorization on its
 * own is NOT a fit signal (it is a prerequisite), which is the difference
 * between this and the apply screen's `qualifies` flag.
 */
function fundingFitIndicated(input: ApplicantTriageInput): boolean {
  const s = input.applyScreening;
  // WAP-53: WIC on its own is not a WIOA low-income indicator, so a "yes"
  // whose only named program is WIC does not count as a fit signal.
  const publicAssistanceFit = s?.snapWic === 'yes' && !wicOnlyPublicAssistance(s.publicAssistancePrograms);
  if (s && (s.q1 === 'yes' || s.q2 === 'yes' || s.receivingUnemployment === 'yes' || publicAssistanceFit)) return true;
  const w = input.wioaSnapshot;
  if (w) {
    if (w.signal === 'likely' || w.signal === 'possible') return true;
    const a = w.answers;
    const wioaAssistanceFit = a.publicAssistanceSelfReport === true && !wicOnlyPublicAssistance(a.publicAssistancePrograms);
    if (a.dislocatedWorker || a.lowIncomeSelfReport || wioaAssistanceFit) return true;
  }
  return false;
}

export function triageApplicant(input: ApplicantTriageInput): ApplicantTriageResult {
  const codes: ApplicantTriageReasonCode[] = [];
  const add = (code: ApplicantTriageReasonCode) => {
    if (!codes.includes(code)) codes.push(code);
  };

  // ---- facts -------------------------------------------------------------
  const phone = input.user.phone ?? input.profile?.profilePhone ?? null;
  const contactOk = nonEmpty(input.user.fullName) && nonEmpty(input.user.email) && nonEmpty(phone);

  const programInterest = input.application.programInterest ?? input.user.programInterest;
  const programChosen = nonEmpty(programInterest);
  const programOk = programChosen && input.programRecognized !== false;

  const screeningOk = input.applyScreening != null || input.wioaSnapshot != null;

  const auth = workAuthorization(input);

  const fitOk = fundingFitIndicated(input);

  const partnerOk =
    nonEmpty(input.application.referralPartnerId) ||
    input.hasPartnerReferral === true ||
    nonEmpty(input.applyScreening?.partnerAmbassadorReferral);

  const wioaStatus = input.user.wioaReviewStatus;
  const wioaVerified = wioaStatus === 'verified';

  const isMinor = input.profile?.isMinor === true || input.wioaSnapshot?.answers.ageBracket === 'under18';

  // ---- concern signals (hard, explicit, applicant- or staff-stated) --------
  let concern = false;
  if (auth.value === false) {
    concern = true;
    add('work_auth_answered_no');
  }
  if (wioaStatus === 'not_eligible') {
    concern = true;
    add('staff_marked_not_eligible');
  }

  // ---- missing information -------------------------------------------------
  let missing = false;
  if (input.application.status === 'NEEDS_INFO') {
    missing = true;
    add('staff_requested_info');
  }
  if (wioaStatus === 'needs_info') {
    missing = true;
    add('staff_wioa_needs_info');
  }
  if (!contactOk) {
    missing = true;
    add('contact_incomplete');
  }
  if (!programChosen) {
    missing = true;
    add('program_missing');
  }
  if (!screeningOk) {
    missing = true;
    add('intake_screening_missing');
  }
  if (screeningOk && auth.value === null && !auth.conflict) {
    missing = true;
    add('work_auth_unanswered');
  }

  // ---- ambiguity → human ----------------------------------------------------
  let human = false;
  if (auth.conflict) {
    human = true;
    add('work_auth_conflict');
  }
  if (programChosen && input.programRecognized === false) {
    human = true;
    add('program_unrecognized');
  }
  if (screeningOk && !fitOk) {
    human = true;
    add('funding_fit_not_indicated');
  }
  if (input.wioaSnapshot && (input.wioaSnapshot.signal === 'review' || input.wioaSnapshot.signal === 'unclear') && fitOk) {
    human = true;
    add('wioa_signal_unclear');
  }
  if (isMinor) {
    human = true;
    add('minor_applicant');
  }
  if (wioaStatus === 'pending' || wioaStatus === 'in_review') {
    human = true;
    add('wioa_review_in_progress');
  }

  let bucket: ApplicantTriageBucket;
  if (concern) bucket = 'not_eligible_signal';
  else if (missing) bucket = 'missing_info';
  else if (human) bucket = 'needs_human';
  else {
    bucket = 'ready_to_review';
    add('intake_complete');
  }

  // ---- staff action signals (never move the bucket) -------------------------
  // WAP-53: a request for help applying for benefits is something a counselor
  // should act on; it is not evidence of enrollment and not a triage concern.
  if (
    input.applyScreening?.publicAssistanceHelpRequested === 'yes' ||
    input.wioaSnapshot?.answers.publicAssistanceHelpRequested === true
  ) {
    add('help_applying_requested');
  }

  const checklistItems: Array<{ key: ApplicantTriageChecklistKey; ok: boolean }> = [
    { key: 'contact', ok: contactOk },
    { key: 'program', ok: programOk },
    { key: 'intake_screening', ok: screeningOk },
    { key: 'work_authorization', ok: auth.value === true },
    { key: 'funding_fit_signal', ok: fitOk },
    { key: 'partner_referral', ok: partnerOk },
    { key: 'wioa_staff_review', ok: wioaVerified },
  ];
  const checklist: ApplicantTriageChecklistItem[] = checklistItems.map((item) => ({
    ...item,
    label: APPLICANT_TRIAGE_CHECKLIST_TEXT[item.key],
  }));

  return {
    bucket,
    reasonCodes: codes,
    reasons: codes.map((c) => APPLICANT_TRIAGE_REASON_TEXT[c]),
    checklist,
  };
}

/** Display payload safe to hand to a client component (all strings resolved). */
export type ApplicantTriageDisplay = {
  bucket: ApplicantTriageBucket;
  label: string;
  reasons: string[];
  checklist: ApplicantTriageChecklistItem[];
};

/**
 * Resolve every code in a result to copy via `t` (e.g. next-intl's `admin`
 * namespace). Falls back to the English defaults when a key is missing so a
 * locale gap can never blank the chip.
 */
export function localizeApplicantTriage(
  result: ApplicantTriageResult,
  t: (key: string) => string,
): ApplicantTriageDisplay {
  const safe = (key: string, fallback: string): string => {
    try {
      const v = t(key);
      return typeof v === 'string' && v && v !== key && !v.startsWith('admin.') ? v : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    bucket: result.bucket,
    label: safe(`applicantTriage.bucket.${result.bucket}`, APPLICANT_TRIAGE_BUCKET_TEXT[result.bucket]),
    reasons: result.reasonCodes.map((c) => safe(`applicantTriage.reason.${c}`, APPLICANT_TRIAGE_REASON_TEXT[c])),
    checklist: result.checklist.map((item) => ({
      ...item,
      label: safe(`applicantTriage.checklist.${item.key}`, item.label),
    })),
  };
}

/** Queue ordering: ready first (unblock approvals), then quick asks for info, then judgement calls, then concerns. */
export const APPLICANT_TRIAGE_BUCKET_RANK: Record<ApplicantTriageBucket, number> = {
  ready_to_review: 0,
  missing_info: 1,
  needs_human: 2,
  not_eligible_signal: 3,
};
