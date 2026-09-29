import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partnerDisclosureAcknowledgement } from './partnerReferralDisclosureCore';
import { PARTNER_DISCLOSURE_VERSION } from '@/lib/partner/dataAccess';

test('records the disclosure as shown with the server-resolved partner id and tier', () => {
  assert.deepEqual(
    partnerDisclosureAcknowledgement({
      attributedPartnerId: 'partner-1',
      attributedPartnerType: 'referral',
      attributedRef: 'acme',
      shownRef: 'ACME',
    }),
    {
      partner_disclosure_shown: true,
      partner_disclosure_partner_id: 'partner-1',
      partner_disclosure_tier: 'restricted',
      partner_disclosure_version: PARTNER_DISCLOSURE_VERSION,
    },
  );
});

test('a disclosure for a different ref (or none) is recorded as not shown', () => {
  for (const shownRef of ['other-partner', null, undefined, '']) {
    const ack = partnerDisclosureAcknowledgement({
      attributedPartnerId: 'partner-1',
      attributedPartnerType: 'community',
      attributedRef: 'acme',
      shownRef,
    });
    assert.equal((ack as { partner_disclosure_shown: boolean }).partner_disclosure_shown, false, String(shownRef));
    assert.equal((ack as { partner_disclosure_tier: string }).partner_disclosure_tier, 'full');
  }
});

test('organic signups record nothing, even if the client claims a disclosure', () => {
  assert.deepEqual(
    partnerDisclosureAcknowledgement({ attributedPartnerId: null, attributedPartnerType: null, attributedRef: null, shownRef: 'acme' }),
    {},
  );
});
