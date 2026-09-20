/**
 * Conversion value constants — used by the Google Ads "import conversions
 * with value" pipeline so the campaign optimizer can learn CPA → LTV per
 * signup. The dollar values are placeholders the growth team can tune as
 * real placement / activation data lands; they are NOT sourced from
 * outcome data — see TODO below.
 *
 * Read pattern: client-side conversion fires call `trackConversionWithValue`
 * which pushes a GTM dataLayer event carrying the dollar value alongside
 * the event name. GTM forwards to Google Ads as a conversion with value.
 */

import { trackFunnelEvent } from './events';

// TODO(growth): replace these placeholders with values derived from
// actual member LTV (placement rate × average wage × retention). For
// Day-1 ads launch we use rough estimates so the optimizer has *some*
// signal — better-than-no-value bidding is better than no value at all.
export const CONVERSION_VALUE_USD = {
  apply_signup_completed: 50, // rough LTV proxy for a completed apply signup
  member_login_first_time: 10, // first activation event, lower confidence
  application_added: 25, // member added a job application — mid-funnel signal
} as const;

export type ConversionEventName = keyof typeof CONVERSION_VALUE_USD;

/**
 * Basis of the values above. Flip to `'outcome_derived'` only when the
 * numbers come from placement rate × average wage × retention (WAP-37).
 * The admin growth card reads this to label every row "Estimate" until then.
 */
export const CONVERSION_VALUE_BASIS: 'estimate' | 'outcome_derived' = 'estimate';

export function getConversionValuePayload(eventName: ConversionEventName): {
  conversion_event: ConversionEventName;
  conversion_value_usd: number;
  currency: 'USD';
} {
  return {
    conversion_event: eventName,
    conversion_value_usd: CONVERSION_VALUE_USD[eventName],
    currency: 'USD',
  };
}

/**
 * Push a conversion event to the dataLayer with an attached dollar value.
 * GTM picks this up and forwards to Google Ads "Import conversions with
 * value". Safe to call from the client; SSR-safe no-op via trackFunnelEvent.
 */
export function trackConversionWithValue(
  eventName: ConversionEventName,
  extra?: Record<string, unknown>,
): void {
  trackFunnelEvent('conversion_with_value', eventName, {
    ...getConversionValuePayload(eventName),
    ...extra,
  });
}
