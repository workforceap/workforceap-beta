import type { KitEmptyKind } from '@/components/portal/kit/KitEmptyState';
import type { KitTone } from '@/components/portal/kit/tokens';

/**
 * Kinds, tones and routes for the partner empty states (plan Part B step 9).
 * Words live in messages/*.json under `empty.partner.<group>.*`; this module
 * only pins which situation each state is and where its actions go, so the
 * overview, the referred-members list, the attention queue, the milestones
 * views and the spec share one table.
 *
 * Every partner page runs behind `getPartnerForUser` (lib/auth/roles.ts), which
 * returns null for an inactive partner, so a rendered list belongs to an active
 * partner: an empty referral list means nobody applied through this partner's
 * link or invite yet, never "not approved".
 *
 *  - `referrals`               no `partner_referrals` row for this partner (tenant-scoped, members only)
 *  - `referralsFiltered`       referrals exist, none match the search / stage / chip
 *  - `payouts`                 no `partner_payout_sent` event for this partner
 *  - `pendingReviewsClear`     no self-reported placement in the last 90 days is waiting for review
 *  - `attentionClear`          the needs-attention API returned zero rows for every tier
 *  - `attentionFiltered`       zero rows for the selected tier only
 *  - `attentionUnavailable`    the needs-attention API failed
 *  - `milestones`              /api/partner/milestones returned zero rows
 *  - `milestonesPendingClear`  milestones exist but none is a certification or placement
 *  - `milestonesUnavailable`   /api/partner/milestones failed
 */
export const PARTNER_EMPTY = {
  referrals: { kind: 'first', group: 'referrals', primaryHref: '/partner/guide', secondaryHref: '/partner/referred-members' },
  referralsFiltered: { kind: 'filtered', group: 'referralsFiltered' },
  payouts: { kind: 'first', group: 'payouts', primaryHref: '/partner/referred-members' },
  pendingReviewsClear: { kind: 'clear', group: 'pendingReviewsClear', primaryHref: '/partner/referred-members' },
  attentionClear: { kind: 'clear', group: 'attentionClear', primaryHref: '/partner/referred-members' },
  attentionFiltered: { kind: 'filtered', group: 'attentionFiltered' },
  attentionUnavailable: { kind: 'unavailable', tone: 'danger', group: 'attentionUnavailable' },
  milestones: { kind: 'first', group: 'milestones', primaryHref: '/partner/referred-members' },
  milestonesPendingClear: { kind: 'clear', group: 'milestonesPendingClear', noAction: true },
  milestonesUnavailable: { kind: 'unavailable', tone: 'danger', group: 'milestonesUnavailable' },
} as const satisfies Record<string, { kind: KitEmptyKind; tone?: KitTone; group: string; primaryHref?: string; secondaryHref?: string; noAction?: true }>;

export type PartnerEmptyVariant = keyof typeof PARTNER_EMPTY;

/** Variants whose primary action is a callback the parent owns (clear a filter, retry a fetch). */
export type PartnerEmptyCallbackVariant = Extract<
  PartnerEmptyVariant,
  'referralsFiltered' | 'attentionFiltered' | 'attentionUnavailable' | 'milestonesUnavailable'
>;

/** Which attention-queue state zero rows put the partner in, given the tier chip. */
export function partnerAttentionEmptyVariant(tier: string): Extract<PartnerEmptyVariant, 'attentionClear' | 'attentionFiltered'> {
  return tier === 'all' ? 'attentionClear' : 'attentionFiltered';
}

/** Which referred-members state zero visible rows put the list in. */
export function partnerReferralsEmptyVariant(counts: { total: number; visible: number }): Extract<PartnerEmptyVariant, 'referrals' | 'referralsFiltered'> | null {
  if (counts.total === 0) return 'referrals';
  if (counts.visible === 0) return 'referralsFiltered';
  return null;
}
