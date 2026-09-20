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

/** Plain-text lines for Application.notes / admin email notes blocks. */
export function eligibilityFieldsPlainLines(fields: EligibilityScreeningFields): string[] {
  const lines: string[] = [];
  if (typeof fields.qualifies === 'boolean') {
    lines.push(
      `Quick eligibility fit: ${fields.qualifies ? 'yes' : 'review'} (${fields.yesCount ?? 0}/3)`,
    );
  }
  if (fields.q1) lines.push(`Eligibility Q1 (unemployed/underemployed): ${fields.q1}`);
  if (fields.q2) lines.push(`Eligibility Q2 (household income < $60k): ${fields.q2}`);
  if (fields.q3) lines.push(`Eligibility Q3 (work authorization): ${fields.q3}`);
  if (fields.receivingUnemployment) {
    lines.push(`Receiving unemployment: ${fields.receivingUnemployment}`);
  }
  if (fields.exhaustedUnemployment) {
    lines.push(`Exhausted unemployment: ${fields.exhaustedUnemployment}`);
  }
  if (fields.layoffCompany) lines.push(`Layoff / last employer: ${fields.layoffCompany}`);
  if (fields.snapWic) lines.push(`SNAP/WIC: ${fields.snapWic}`);
  if (fields.publicAssistancePrograms?.length) {
    lines.push(`Benefit programs: ${formatPublicAssistancePrograms(fields.publicAssistancePrograms)}`);
  }
  if (fields.publicAssistanceHelpRequested) {
    lines.push(`Wants help applying for benefits: ${fields.publicAssistanceHelpRequested}`);
  }
  if (fields.hearAbout) lines.push(`Heard about us: ${fields.hearAbout}`);
  if (fields.hearAboutOther) lines.push(`Heard about us (other): ${fields.hearAboutOther}`);
  if (fields.partnerAmbassadorReferral) {
    lines.push(`Partner/ambassador referral: ${fields.partnerAmbassadorReferral}`);
  }
  return lines;
}
