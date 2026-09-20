/**
 * Extended apply-flow eligibility fields (WS4).
 *
 * Kept separate from primaryBarrierOptions so barrier multi-select stays stable
 * while ops can collect discrete unemployment / benefits / attribution answers.
 * School / CHS paths skip these (see ApplyEligibilityClient + signup route).
 */

import {
  CENTRAL_TEXAS_REFERRAL_SOURCES,
  REFERRAL_SOURCE_COMMUNITY_AMBASSADOR,
  REFERRAL_SOURCE_OTHER_PARTNER,
} from '@/lib/referralSources';

export const YES_NO = ['yes', 'no'] as const;
export type YesNo = (typeof YES_NO)[number];

/**
 * Hear-about options for the public apply screener (adult / paid paths).
 * The 9/2/26 ops list dropped the duplicate "Partner or community ambassador"
 * row: "Community Ambassador (write in)" and "Other Partner (write in)" already
 * cover it. The constant below stays so previously saved answers keep working.
 */
export const APPLY_HEAR_ABOUT_OPTIONS = [...CENTRAL_TEXAS_REFERRAL_SOURCES] as const;

export type ApplyHearAboutOption = (typeof APPLY_HEAR_ABOUT_OPTIONS)[number];

export const APPLY_HEAR_ABOUT_OTHER = 'Other / write in';
/** Legacy stored value (pre-9/2/26 menu row); still detected as an ambassador referral. */
export const APPLY_HEAR_ABOUT_AMBASSADOR = 'Partner or community ambassador';

export function isYesNo(value: unknown): value is YesNo {
  return value === 'yes' || value === 'no';
}

export function normalizeYesNo(value: unknown): YesNo | null {
  if (isYesNo(value)) return value;
  return null;
}

export function normalizeHearAbout(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 200);
}

export function hearAboutNeedsOther(hearAbout: string | null | undefined): boolean {
  const value = hearAbout ?? '';
  return (
    value === APPLY_HEAR_ABOUT_OTHER ||
    value === REFERRAL_SOURCE_OTHER_PARTNER ||
    value === REFERRAL_SOURCE_COMMUNITY_AMBASSADOR ||
    value.toLowerCase() === 'other'
  );
}

export function hearAboutSuggestsAmbassador(hearAbout: string | null | undefined): boolean {
  const v = (hearAbout ?? '').toLowerCase();
  return v.includes('ambassador') || v.includes('partner');
}

/**
 * Layoff / last-employer company field visibility.
 *
 * Always shown in the adult eligibility block (apply, member dashboard, /q
 * token forms). Ops (Mike) expects this question alongside unemployment /
 * SNAP / hear-about — not gated behind a prior "yes", which hid it on first
 * load and made the form look incomplete.
 *
 * Input is retained for call-site compatibility; unemployment answers no
 * longer gate visibility.
 */
export function layoffCompanyApplicable(_input: {
  unemployedOrUnderemployed: YesNo | null;
  receivingUnemployment: YesNo | null;
  exhaustedUnemployment: YesNo | null;
}): boolean {
  return true;
}
