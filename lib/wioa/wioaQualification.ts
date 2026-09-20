/**
 * Self-service WIOA screening — informational only, not a legal eligibility determination.
 */

import {
  formatPublicAssistancePrograms,
  normalizePublicAssistancePrograms,
  wicOnlyPublicAssistance,
  type PublicAssistanceProgram,
} from '@/lib/apply/publicAssistance';

export type WioaBarrier =
  | 'none'
  | 'basic_skills'
  | 'english_language'
  | 'criminal_record'
  | 'transportation'
  | 'childcare'
  | 'housing'
  | 'other';

export type WioaQualificationAnswers = {
  /** Age 14+ for WIOA youth programs; 18+ for adult */
  ageBracket: 'under18' | '18_24' | '25_54' | '55_plus';
  countyOrZip: string;
  /** Primary barrier to employment or training */
  primaryBarrier: WioaBarrier;
  /** Receiving or recently received unemployment / layoff */
  dislocatedWorker: boolean;
  /** Household income roughly at or below self-sufficiency (self-reported) */
  lowIncomeSelfReport: boolean;
  /** Interested in training for in-demand occupation */
  trainingInterest: boolean;
  /** Completed orientation or intake with WorkforceAP (self-reported) */
  completedIntakeSelfReport: boolean;
  /**
   * Receiving TANF, WIC, and/or SNAP (food stamps). Added 9/2/26; optional so
   * snapshots saved before the question existed still parse (null = not asked).
   */
  publicAssistanceSelfReport?: boolean | null;
  /**
   * WAP-53 follow-ups after a Yes above: which programs (tanf | wic | snap |
   * other_unsure) and whether the person wants help applying. Optional so
   * every earlier snapshot still parses; `wic` alone is not treated as a
   * definitive low-income indicator (see computeWioaSignal).
   */
  publicAssistancePrograms?: PublicAssistanceProgram[] | null;
  publicAssistanceHelpRequested?: boolean | null;
};

export type WioaEligibilitySignal = 'likely' | 'possible' | 'review' | 'unclear';

export type WioaReason =
  | { code: 'public_assistance' | 'wic_only_review' | 'low_income' | 'dislocated_worker' | 'training_interest' | 'intake_complete' | 'youth_review' | 'staff_review' }
  | { code: 'barrier'; params: { barrier: WioaBarrier } };

type SnapshotFields = {
  answers: WioaQualificationAnswers;
  signal: WioaEligibilitySignal;
  submittedAt: string;
};

/** Preserve historical prose; only new writes use language-neutral reasons. */
export type WioaQualificationSnapshot = SnapshotFields & (
  | { version: 1; reasons: string[] }
  | { version: 2; reasons: WioaReason[] }
);

export function parseWioaQualificationSnapshot(raw: unknown): WioaQualificationSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const signal = o.signal;
  if (
    (o.version !== 1 && o.version !== 2) ||
    typeof o.submittedAt !== 'string' ||
    (signal !== 'likely' && signal !== 'possible' && signal !== 'review' && signal !== 'unclear') ||
    !Array.isArray(o.reasons)
  ) {
    return null;
  }
  const answers = parseWioaAnswers(o.answers);
  if (!answers) return null;
  const fields: SnapshotFields = { answers, signal, submittedAt: o.submittedAt };
  if (o.version === 1) {
    return o.reasons.every((reason) => typeof reason === 'string')
      ? { ...fields, version: 1, reasons: o.reasons }
      : null;
  }
  const reasons = o.reasons.map(parseWioaReason);
  if (reasons.some((reason) => reason === null)) return null;
  return { ...fields, version: 2, reasons: reasons as WioaReason[] };
}

const BARRIER_LABELS: Record<WioaBarrier, string> = {
  none: 'No major barrier right now',
  basic_skills: 'Basic skills / digital literacy',
  english_language: 'English language support',
  criminal_record: 'Background / record questions',
  transportation: 'Transportation',
  childcare: 'Childcare',
  housing: 'Housing stability',
  other: 'Other',
};

export function barrierLabel(b: WioaBarrier): string {
  return BARRIER_LABELS[b] ?? b;
}

/** Staff-facing Yes / No / Not answered label for the TANF / WIC / SNAP question. */
export function publicAssistanceLabel(value: boolean | null | undefined): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Not answered';
}

/** Staff-facing program detail: "TANF, SNAP / food stamps", or "Not specified" after a Yes without detail. */
export function publicAssistanceProgramsLabel(answers: Pick<WioaQualificationAnswers, 'publicAssistanceSelfReport' | 'publicAssistancePrograms'>): string {
  if (answers.publicAssistanceSelfReport !== true) return '—';
  const label = formatPublicAssistancePrograms(answers.publicAssistancePrograms ?? []);
  return label || 'Not specified';
}

/** Staff-facing help-applying label; always a signal for follow-up, never verified enrollment. */
export function publicAssistanceHelpLabel(answers: Pick<WioaQualificationAnswers, 'publicAssistanceSelfReport' | 'publicAssistanceHelpRequested'>): string {
  if (answers.publicAssistanceSelfReport !== true) return '—';
  if (answers.publicAssistanceHelpRequested === true) return 'Yes — wants help applying';
  if (answers.publicAssistanceHelpRequested === false) return 'No';
  return 'Not answered';
}

const REASON_TEXT = {
  public_assistance: 'You shared that you receive TANF, WIC, or SNAP (food stamps), which usually meets WIOA low-income guidelines once staff verify it.',
  wic_only_review: 'You shared that you receive WIC. WIC on its own does not confirm WIOA low-income eligibility, so staff will review your household income with you.',
  low_income: 'You shared that your household income may fit common WIOA income guidelines, which staff can verify.',
  dislocated_worker: 'You reported being unemployed or laid off, which often fits WIOA dislocated worker pathways.',
  training_interest: 'You said you want training for an in-demand occupation, which is a strong match for many WIOA-funded plans.',
  intake_complete: 'You said you already completed intake or orientation, which can help staff move faster on next steps.',
  youth_review: 'Youth eligibility is reviewed differently, so WorkforceAP staff will confirm age, school status, and program fit.',
  staff_review: 'Complete a conversation with WorkforceAP staff or your local American Job Center to confirm WIOA eligibility and next steps.',
} as const;

function barrierReasonText(barrier: WioaBarrier): string {
  return `You identified a barrier, ${barrierLabel(barrier)}, which can strengthen the case for supportive services alongside training.`;
}

function parseWioaReason(raw: unknown): WioaReason | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.code === 'barrier') {
    const barrier = (o.params as Record<string, unknown> | null)?.barrier;
    return typeof barrier === 'string' && Object.hasOwn(BARRIER_LABELS, barrier)
      ? { code: 'barrier', params: { barrier: barrier as WioaBarrier } }
      : null;
  }
  return typeof o.code === 'string' && Object.hasOwn(REASON_TEXT, o.code)
    ? { code: o.code as Exclude<WioaReason['code'], 'barrier'> }
    : null;
}

/** Exact matching only: do not infer a reason from arbitrary historical prose. */
function legacyReason(text: string): WioaReason | null {
  for (const [code, message] of Object.entries(REASON_TEXT)) {
    if (text === message) return { code: code as Exclude<WioaReason['code'], 'barrier'> };
  }
  for (const barrier of Object.keys(BARRIER_LABELS) as WioaBarrier[]) {
    if (text === barrierReasonText(barrier)) return { code: 'barrier', params: { barrier } };
  }
  return null;
}

type WioaTranslate = (key: string, values?: Record<string, string>) => string;

/** English by default for staff/email; member/public UI supplies its active translator. */
export function formatWioaReasons(snapshot: WioaQualificationSnapshot, translate?: WioaTranslate): string[] {
  if (snapshot.reasons.length === 0) {
    return [translate ? translate('reasons.unavailable') : 'No explanation was saved with this assessment.'];
  }
  return snapshot.reasons.map((saved) => {
    const reason = typeof saved === 'string' ? legacyReason(saved) : saved;
    if (!reason) {
      const text = saved as string;
      return translate ? translate('reasons.legacy', { text }) : `Saved explanation (original language): ${text}`;
    }
    if (reason.code === 'barrier') {
      return translate
        ? translate('reasons.barrier', { barrier: translate(`barriers.${reason.params.barrier}`) })
        : barrierReasonText(reason.params.barrier);
    }
    return translate ? translate(`reasons.${reason.code}`) : REASON_TEXT[reason.code];
  });
}

/**
 * Heuristic signal for UI routing — counselors make final WIOA determinations.
 */
export function computeWioaSignal(answers: WioaQualificationAnswers): {
  signal: WioaEligibilitySignal;
  reasons: WioaReason[];
} {
  const reasons: WioaReason[] = [];
  const hasBarrier = answers.primaryBarrier !== 'none';
  const isYouth = answers.ageBracket === 'under18';
  const receivesPublicAssistance = answers.publicAssistanceSelfReport === true;
  // WAP-53: WIC alone is a nutrition benefit with its own income test, not a
  // WIOA categorical low-income qualifier. Only count public assistance when
  // the person named TANF/SNAP/other, or gave no detail (legacy snapshots).
  const wicOnly = receivesPublicAssistance && wicOnlyPublicAssistance(answers.publicAssistancePrograms);
  const receivesQualifyingAssistance = receivesPublicAssistance && !wicOnly;
  // Receiving TANF / SNAP is itself a WIOA low-income indicator, so it counts
  // the same way as the self-reported income question.
  const lowIncome = answers.lowIncomeSelfReport || receivesQualifyingAssistance;
  const coreQualifierCount =
    (lowIncome ? 1 : 0) +
    (answers.dislocatedWorker ? 1 : 0) +
    (hasBarrier ? 1 : 0);

  if (receivesQualifyingAssistance) {
    reasons.push({ code: 'public_assistance' });
  } else if (wicOnly) {
    reasons.push({ code: 'wic_only_review' });
  }
  if (answers.lowIncomeSelfReport) {
    reasons.push({ code: 'low_income' });
  }
  if (answers.dislocatedWorker) {
    reasons.push({ code: 'dislocated_worker' });
  }
  if (hasBarrier) {
    reasons.push({ code: 'barrier', params: { barrier: answers.primaryBarrier } });
  }
  if (answers.trainingInterest) {
    reasons.push({ code: 'training_interest' });
  }
  if (answers.completedIntakeSelfReport) {
    reasons.push({ code: 'intake_complete' });
  }

  let signal: WioaEligibilitySignal = 'review';

  if (isYouth) {
    signal = coreQualifierCount >= 1 || answers.trainingInterest ? 'possible' : 'unclear';
    reasons.push({ code: 'youth_review' });
  } else if (answers.dislocatedWorker) {
    signal = 'likely';
  } else if (
    (lowIncome && hasBarrier) ||
    coreQualifierCount >= 2 ||
    (lowIncome && answers.completedIntakeSelfReport)
  ) {
    signal = 'likely';
  } else if (coreQualifierCount >= 1 || answers.trainingInterest || answers.completedIntakeSelfReport) {
    signal = 'possible';
  }

  if (reasons.length === 0) {
    reasons.push({ code: 'staff_review' });
  }

  return { signal, reasons };
}

export function parseWioaAnswers(raw: unknown): WioaQualificationAnswers | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ageBracket = o.ageBracket;
  const primaryBarrier = o.primaryBarrier;
  if (
    ageBracket !== 'under18' &&
    ageBracket !== '18_24' &&
    ageBracket !== '25_54' &&
    ageBracket !== '55_plus'
  ) {
    return null;
  }
  if (
    typeof o.countyOrZip !== 'string' ||
    typeof o.dislocatedWorker !== 'boolean' ||
    typeof o.lowIncomeSelfReport !== 'boolean' ||
    typeof o.trainingInterest !== 'boolean' ||
    typeof o.completedIntakeSelfReport !== 'boolean'
  ) {
    return null;
  }
  const barriers: WioaBarrier[] = [
    'none',
    'basic_skills',
    'english_language',
    'criminal_record',
    'transportation',
    'childcare',
    'housing',
    'other',
  ];
  if (!barriers.includes(primaryBarrier as WioaBarrier)) return null;
  // Optional: older snapshots never asked this, and a non-boolean value must not
  // invalidate the rest of the screening.
  const publicAssistanceSelfReport =
    typeof o.publicAssistanceSelfReport === 'boolean' ? o.publicAssistanceSelfReport : null;
  // WAP-53 follow-ups only mean anything after a Yes; unknown program values
  // are dropped rather than failing the whole snapshot.
  const publicAssistancePrograms =
    publicAssistanceSelfReport === true ? normalizePublicAssistancePrograms(o.publicAssistancePrograms) : [];
  const publicAssistanceHelpRequested =
    publicAssistanceSelfReport === true && typeof o.publicAssistanceHelpRequested === 'boolean'
      ? o.publicAssistanceHelpRequested
      : null;

  return {
    ageBracket,
    countyOrZip: o.countyOrZip.trim().slice(0, 120),
    primaryBarrier: primaryBarrier as WioaBarrier,
    dislocatedWorker: o.dislocatedWorker,
    lowIncomeSelfReport: o.lowIncomeSelfReport,
    trainingInterest: o.trainingInterest,
    completedIntakeSelfReport: o.completedIntakeSelfReport,
    publicAssistanceSelfReport,
    // Only materialize the follow-up keys when they carry information, so a
    // snapshot saved before WAP-53 round-trips through parse unchanged.
    ...(publicAssistancePrograms.length > 0 ? { publicAssistancePrograms } : {}),
    ...(publicAssistanceHelpRequested !== null ? { publicAssistanceHelpRequested } : {}),
  };
}
