/**
 * WS5 email payload coverage — confirmation + admin alert templates.
 *
 * WAP-170: every eligibility email carries the quick-fit flag and an answer
 * count, and never an answer. These cases pin both halves.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applicationConfirmationHtml } from './application-confirmation';
import { newApplicationAlertHtml } from './new-application-alert';
import { eligibilityScreeningSummaryHtml } from './eligibility-screening-summary';
import { eligibilityScreeningConfirmationHtml } from './eligibility-screening-confirmation';
import { eligibilityScreeningAdminAlertHtml } from './eligibility-screening-admin-alert';

const SAMPLE = {
  q1: 'yes',
  q2: 'yes',
  q3: 'no',
  qualifies: true,
  yesCount: 2,
  receivingUnemployment: 'yes',
  exhaustedUnemployment: 'no',
  layoffCompany: 'Acme Logistics',
  snapWic: 'yes',
  publicAssistancePrograms: ['snap', 'wic'],
  publicAssistanceHelpRequested: 'yes',
  hearAbout: 'Partner or community ambassador',
  hearAboutOther: null,
  partnerAmbassadorReferral: 'Ambassador Jane / code-abc',
};

/** Every answer value and label that must never appear in an email body. */
const ANSWER_MARKERS = [
  'Acme Logistics',
  'Ambassador Jane',
  'Partner or community ambassador',
  'Receiving unemployment',
  'Exhausted unemployment',
  'SNAP/WIC',
  'Benefit programs',
  'Wants help applying',
  'Heard about us',
  'Layoff / last employer',
  'Work authorization',
  'Household income',
  'Unemployed / underemployed',
];

function assertNoAnswers(html: string) {
  for (const marker of ANSWER_MARKERS) {
    assert.ok(!html.includes(marker), `email body must not contain "${marker}"`);
  }
}

describe('eligibilityScreeningSummaryHtml', () => {
  it('reports the quick-fit flag and the answer count only', () => {
    const html = eligibilityScreeningSummaryHtml(SAMPLE);
    assert.match(html, /Eligibility screening received/);
    assert.match(html, /Quick eligibility fit:<\/strong> yes \(2\/3\)/);
    // q1, q2, q3, receivingUnemployment, exhaustedUnemployment, layoffCompany,
    // snapWic, publicAssistancePrograms, publicAssistanceHelpRequested,
    // hearAbout, partnerAmbassadorReferral = 11
    assert.match(html, /Answers saved:<\/strong> 11/);
    assertNoAnswers(html);
  });

  it('returns empty string when no fields present', () => {
    assert.equal(eligibilityScreeningSummaryHtml({}), '');
    assert.equal(eligibilityScreeningSummaryHtml(null), '');
  });

  it('never renders free-text answers, so hostile input cannot reach the body', () => {
    const html = eligibilityScreeningSummaryHtml({
      layoffCompany: '<script>alert(1)</script>',
      partnerAmbassadorReferral: '<img src=x onerror=alert(1)>',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('alert(1)'));
    assert.match(html, /Answers saved:<\/strong> 2/);
  });
});

describe('applicationConfirmationHtml WS5 eligibility payload', () => {
  it('acknowledges the screening with counts, not answers', () => {
    const html = applicationConfirmationHtml({ firstName: 'Alex', eligibility: SAMPLE });
    assert.match(html, /Eligibility screening received/);
    assert.match(html, /Answers saved:<\/strong> 11/);
    assertNoAnswers(html);
    assert.match(html, /Thank you for becoming a member of Workforce Advancement Project!/);
    assert.match(html, /1(?:&ndash;|–|-)\s*2 business days/);
    assert.ok(!html.includes('3 to 5 business days'));
  });

  it('omits eligibility block when fields absent', () => {
    const html = applicationConfirmationHtml({ firstName: 'Alex' });
    assert.ok(!html.includes('Eligibility screening received'));
    assert.ok(!html.includes('Answers saved'));
  });
});

describe('newApplicationAlertHtml WS5 eligibility payload', () => {
  it('gives Mike/admin the quick-fit flag and count, not the answers', () => {
    const html = newApplicationAlertHtml({
      applicantName: 'Alex Rivera',
      applicantEmail: 'alex@example.com',
      programInterest: 'IT Support',
      applicationId: 'app-1',
      eligibility: SAMPLE,
    });
    assert.match(html, /Quick eligibility fit:<\/strong> yes \(2\/3\)/);
    assert.match(html, /Answers saved:<\/strong> 11/);
    assertNoAnswers(html);
  });
});

describe('eligibilityScreeningConfirmationHtml', () => {
  it('confirms how many answers were saved and points to the portal, without a copy', () => {
    const html = eligibilityScreeningConfirmationHtml({
      firstName: 'Sam',
      eligibility: SAMPLE,
    });
    assert.match(html, /Hi Sam,/);
    assert.match(html, /We saved 11 answers\./);
    assert.match(html, /does not repeat them/);
    assert.match(html, /member portal/);
    assert.ok(!html.includes('Here is a copy of what you submitted'));
    assertNoAnswers(html);
  });

  it('uses the singular for one answer', () => {
    const html = eligibilityScreeningConfirmationHtml({ firstName: 'Sam', eligibility: { q1: 'yes' } });
    assert.match(html, /We saved 1 answer\./);
  });
});

describe('eligibilityScreeningAdminAlertHtml', () => {
  it('labels dashboard vs token source and links to the admin review page', () => {
    const dash = eligibilityScreeningAdminAlertHtml({
      memberName: 'Sam',
      memberEmail: 'sam@example.com',
      memberId: 'u1',
      source: 'dashboard',
      eligibility: SAMPLE,
    });
    assert.match(dash, /member portal/);
    assert.match(dash, /href="https:\/\/www\.workforceap\.org\/admin\/members\/u1"/);
    assert.match(dash, /Review the answers on the member/);
    assert.match(dash, /Answers saved:<\/strong> 11/);
    assertNoAnswers(dash);

    const tok = eligibilityScreeningAdminAlertHtml({
      memberName: 'Sam',
      memberEmail: 'sam@example.com',
      source: 'token',
      eligibility: SAMPLE,
    });
    assert.match(tok, /tokenized questionnaire/);
    assertNoAnswers(tok);
  });

  it('points a no-account lead at its purgeable store record instead of embedding answers', () => {
    const lead = eligibilityScreeningAdminAlertHtml({
      memberName: 'Lead Person',
      memberEmail: 'lead@example.com',
      memberId: null,
      source: 'token',
      eligibility: SAMPLE,
      leadRecordId: 'lead-<1>',
    });
    assert.match(lead, /no member account yet/);
    assert.match(lead, /record lead-&lt;1&gt;/);
    assert.match(lead, /for \d+ days/);
    assert.ok(!lead.includes('/admin/members/'));
    assertNoAnswers(lead);
  });
});
