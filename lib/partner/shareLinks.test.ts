import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaidUtmSource } from '@/lib/apply/paidApplyUtm';
import {
  buildPartnerShareLinks,
  countSignupsByShareChannel,
  PARTNER_SHARE_CHANNELS,
  partnerApplyButtonHtml,
  partnerLandingPath,
} from './shareLinks';

const BASE = 'https://training.example.invalid';

test('landing and apply links carry the partner ref (code first, slug fallback)', () => {
  const links = buildPartnerShareLinks({ referralCode: 'Acme-Code', slug: 'acme', name: 'Acme' }, BASE);
  assert.equal(links.ref, 'acme-code');
  assert.equal(links.landingUrl, `${BASE}/join/acme-code`);
  assert.equal(links.applyUrl, `${BASE}/apply?ref=acme-code`);
  const fallback = buildPartnerShareLinks({ referralCode: ' ', slug: 'acme-slug', name: 'Acme' }, BASE);
  assert.equal(fallback.landingUrl, `${BASE}/join/acme-slug`);
  assert.equal(partnerLandingPath('a b'), '/join/a%20b');
});

test('each channel link appends utm_source / utm_medium / utm_campaign to the landing page', () => {
  const links = buildPartnerShareLinks({ referralCode: 'acme', slug: 'acme', name: 'Acme' }, BASE);
  assert.deepEqual(links.channels.map((c) => c.id), ['website', 'youtube', 'facebook', 'email']);
  for (const channel of links.channels) {
    const url = new URL(channel.url);
    assert.equal(url.pathname, '/join/acme');
    assert.equal(url.searchParams.get('utm_source'), channel.source);
    assert.equal(url.searchParams.get('utm_medium'), channel.medium);
    assert.equal(url.searchParams.get('utm_campaign'), 'partner_referral');
  }
  // A paid source would switch /apply to the paid-ads variant.
  for (const channel of PARTNER_SHARE_CHANNELS) assert.equal(isPaidUtmSource(channel.source), false);
});

test('the Apply button snippet is a plain inline-styled link with the ref and website UTM', () => {
  const links = buildPartnerShareLinks({ referralCode: 'acme', slug: 'acme', name: 'Acme "Center" <b>' }, BASE);
  const html = links.applyButtonHtml;
  assert.match(html, /^<a href="[^"]+" target="_blank" rel="noopener" title="[^"]+" style="[^"]+">Apply to WorkforceAP<\/a>$/);
  assert.ok(html.includes(`href="${BASE}/apply?ref=acme&amp;utm_source=website&amp;utm_medium=referral&amp;utm_campaign=partner_referral"`));
  assert.doesNotMatch(html, /<script|<iframe|javascript:|<b>/i);
  assert.ok(html.includes('Acme &quot;Center&quot; &lt;b&gt;'));
  assert.doesNotMatch(partnerApplyButtonHtml({ href: 'https://x.test/"><script>', partnerName: 'P' }), /<script>/);
});

test('channel counts read utm_source only and bucket everything else as other', () => {
  assert.deepEqual(
    countSignupsByShareChannel([
      { utm_source: 'facebook', email: 'ignored' },
      { utm_source: 'Facebook' },
      { utm_source: 'youtube' },
      { utm_source: 'google_ads' },
      {},
      null,
      'nope',
    ]),
    { website: 0, youtube: 1, facebook: 2, email: 0, other: 4 },
  );
});
