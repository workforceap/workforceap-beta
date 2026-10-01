import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { partnerReferralInviteHtml } from './partner-referral-invite';
import messages from '../messages/en.json';
import { brandedEmailLayout } from '../lib/email/template';

describe('partnerReferralInviteHtml', () => {
  it('includes inviter and partner names', () => {
    const html = partnerReferralInviteHtml({
      inviterName: 'Jordan Lee',
      partnerName: 'Austin Workforce Council',
    });

    assert.ok(html.includes('Jordan Lee'));
    assert.ok(html.includes('Austin Workforce Council'));
  });

  it('includes the full WorkforceAP mission statement above the apply button', () => {
    const html = partnerReferralInviteHtml({
      inviterName: 'Jordan Lee',
      partnerName: 'Austin Workforce Council',
      personalMessage: 'See you there.',
    });
    const statement = messages.mission.statement;
    assert.ok(statement.startsWith('Workforce Advancement Project (WorkforceAP) is a 501(c)(3) nonprofit'));
    // escapeHtml leaves the statement's characters (parentheses, résumé, em dash) as they are.
    assert.ok(html.includes(statement), 'mission statement present verbatim');
    assert.ok(html.includes('Our mission'));
    // The layout draws the Apply button after the body, so the mission sits
    // after the personal note and before the closing line that points to it.
    assert.ok(html.indexOf('See you there.') < html.indexOf(statement));
    assert.ok(html.indexOf(statement) < html.indexOf('Click the button below'));

    // Sent layout (lib/email.ts sendPartnerReferralInviteEmail): body, then the Apply button.
    const sent = brandedEmailLayout({
      title: 'Jordan Lee invited you to connect with WorkforceAP',
      bodyHtml: html,
      ctaText: 'Start Application',
      ctaUrl: 'https://www.workforceap.org/apply?ref=austin-council',
    });
    assert.ok(sent.indexOf(statement) > -1);
    assert.ok(sent.indexOf(statement) < sent.indexOf('apply?ref=austin-council'));
  });

  it('includes the personal note when provided', () => {
    const html = partnerReferralInviteHtml({
      inviterName: 'Jordan Lee',
      partnerName: 'Austin Workforce Council',
      personalMessage: 'We think this training path could fit your goals.',
    });

    assert.ok(html.includes('Personal note'));
    assert.ok(html.includes('fit your goals'));
  });

  it('escapes unsafe HTML in user-provided fields', () => {
    const html = partnerReferralInviteHtml({
      inviterName: '<b>Jordan</b>',
      partnerName: 'Austin <script>alert(1)</script>',
      personalMessage: '<img src=x onerror=alert(1)>',
    });

    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;b&gt;Jordan&lt;/b&gt;'));
  });
});
