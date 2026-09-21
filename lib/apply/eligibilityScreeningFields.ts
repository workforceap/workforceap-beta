/**
 * Shared shape + formatters for WS4 adult eligibility screening answers.
 * Used by confirmation emails, admin alerts, and CSV / datasheet exports.
 */

import { formatPublicAssistancePrograms } from './publicAssistance';

export type EligibilityScreeningFields = {
  receivingUnemployment?: string | null;
  exhaustedUnemployment?: string | null;
  layoffCompany?: string | null;
  snapWic?: string | null;
  /** WAP-53: programs named after snapWic = yes (tanf | wic | snap | other_unsure). */
  publicAssistancePrograms?: string[] | null;
  /** WAP-53: wants help applying for benefits (yes | no) — a staff signal, stored separately from receipt. */
  publicAssistanceHelpRequested?: string | null;
  hearAbout?: string | null;
  hearAboutOther?: string | null;
  partnerAmbassadorReferral?: string | null;
  /** Triad q1/q2/q3 when present (apply / questionnaire). */
  q1?: string | null;
  q2?: string | null;
  q3?: string | null;
  qualifies?: boolean | null;
  yesCount?: number | null;
};

/** CSV / table column headers for the eligibility datasheet. */
export const ELIGIBILITY_DATASHEET_COLUMNS = [
  'Receiving Unemployment',
  'Exhausted Unemployment',
  'Layoff Company',
  'SNAP/WIC',
  'Heard About Us',
  'Heard About Us (Other)',
  'Partner/Ambassador Referral',
  'Eligibility Q1',
  'Eligibility Q2',
  'Eligibility Q3',
  'Eligibility Qualifies',
  'Eligibility Yes Count',
  // WAP-53 — appended so existing column positions stay stable for consumers.
  'Public Assistance Programs',
  'Wants Help Applying',
] as const;

export type EligibilityDatasheetColumn = (typeof ELIGIBILITY_DATASHEET_COLUMNS)[number];

export function hasEligibilityScreeningFields(
  fields: EligibilityScreeningFields | null | undefined,
): boolean {
  if (!fields) return false;
  return Boolean(
    fields.receivingUnemployment ||
      fields.exhaustedUnemployment ||
      fields.layoffCompany ||
      fields.snapWic ||
      (fields.publicAssistancePrograms?.length ?? 0) > 0 ||
      fields.publicAssistanceHelpRequested ||
      fields.hearAbout ||
      fields.hearAboutOther ||
      fields.partnerAmbassadorReferral ||
      fields.q1 ||
      fields.q2 ||
      fields.q3 ||
      typeof fields.qualifies === 'boolean' ||
      typeof fields.yesCount === 'number',
  );
}

/**
 * How many screening answers are present. WAP-170: emails carry this count
 * (and the quick-fit flag) instead of the answers, so an inbox never becomes a
 * second store of special-category data.
 */
export function eligibilityScreeningAnswerCount(
  fields: EligibilityScreeningFields | null | undefined,
): number {
  if (!fields) return 0;
  const textAnswers = [
    fields.q1,
    fields.q2,
    fields.q3,
    fields.receivingUnemployment,
    fields.exhaustedUnemployment,
    fields.layoffCompany,
    fields.snapWic,
    fields.publicAssistanceHelpRequested,
    fields.hearAbout,
    fields.hearAboutOther,
    fields.partnerAmbassadorReferral,
  ].filter((value) => typeof value === 'string' && value.trim().length > 0).length;
  return textAnswers + ((fields.publicAssistancePrograms?.length ?? 0) > 0 ? 1 : 0);
}

/** Ordered cell values matching {@link ELIGIBILITY_DATASHEET_COLUMNS}. */
export function eligibilityDatasheetCells(
  fields: EligibilityScreeningFields | null | undefined,
): string[] {
  const f = fields ?? {};
  return [
    f.receivingUnemployment ?? '',
    f.exhaustedUnemployment ?? '',
    f.layoffCompany ?? '',
    f.snapWic ?? '',
    f.hearAbout ?? '',
    f.hearAboutOther ?? '',
    f.partnerAmbassadorReferral ?? '',
    f.q1 ?? '',
    f.q2 ?? '',
    f.q3 ?? '',
    typeof f.qualifies === 'boolean' ? (f.qualifies ? 'yes' : 'no') : '',
    typeof f.yesCount === 'number' ? String(f.yesCount) : '',
    formatPublicAssistancePrograms(f.publicAssistancePrograms),
    f.publicAssistanceHelpRequested ?? '',
  ];
}

/**
 * True when any WS4/WS5 screening answer is present: the triad, the quick-fit
 * flag, unemployment / layoff / benefit answers. Referral fields (hear-about,
 * ambassador) are not screening answers.
 */
export function hasEligibilityScreeningAnswers(
  fields: EligibilityScreeningFields | null | undefined,
): boolean {
  if (!fields) return false;
  return Boolean(
    fields.q1 ||
      fields.q2 ||
      fields.q3 ||
      typeof fields.qualifies === 'boolean' ||
      typeof fields.yesCount === 'number' ||
      fields.receivingUnemployment ||
      fields.exhaustedUnemployment ||
      fields.layoffCompany ||
      fields.snapWic ||
      (fields.publicAssistancePrograms?.length ?? 0) > 0 ||
      fields.publicAssistanceHelpRequested,
  );
}

/**
 * The one screening line allowed in `Application.notes` and the staff alert
 * (WAP-170/172): a pointer, never an answer or the quick-fit flag. The answers
 * live in `ApplyEligibilityScreening`, read on the member's admin page;
 * `Application.notes` is also returned verbatim by the member's self-serve
 * export and copied into the admin alert email, so neither may carry them.
 */
const ELIGIBILITY_SCREENING_NOTES_POINTER =
  'Eligibility screening: on file (answers on the member record in admin, not in these notes)';

export function eligibilityScreeningNotesPointer(
  fields: EligibilityScreeningFields | null | undefined,
): string | null {
  return hasEligibilityScreeningAnswers(fields) ? ELIGIBILITY_SCREENING_NOTES_POINTER : null;
}
