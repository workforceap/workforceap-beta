/**
 * Ops welcome letter — distinctive phrases from the uploaded
 * "Welcome Letter-To everyone who applies and gets a membership".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applicationAcceptedHtml } from './application-accepted';
import { applicationConfirmationHtml } from './application-confirmation';
import {
  MEMBER_WELCOME_LETTER_TITLE,
  memberWelcomeLetterHtml,
} from './member-welcome-letter';

const LETTER_PHRASES = [
  'Welcome to Workforce Advancement Project — Your Next Steps',
  'Thank you for becoming a member of Workforce Advancement Project!',
  'Our Two-Platform Process',
  'You have successfully registered for our complimentary member platform.',
  'Registration as a Workforce Advancement Project member does not automatically enroll you',
  'approximately 160 hours of training',
  'Training Funding Opportunities',
  'Workforce Innovation and Opportunity Act (WIOA)',
  'Email your current résumé to',
  'Book a Career Consultation',
  'Michael A. Brown, PMP, ChE',
  'Empowering People. Advancing Futures.',
  '(512) 825-2896',
];

function assertLetterPhrases(html: string) {
  for (const phrase of LETTER_PHRASES) {
    assert.ok(html.includes(phrase), `should include letter phrase: ${phrase}`);
  }
  assert.ok(
    html.includes('https://calendar.app.google/1cq9rmTXgJkGTx83A'),
    'should include the letter booking URL',
  );
  assert.ok(
    html.includes(
      'https://www.careeronestop.org/localhelp/americanjobcenters/find-american-job-centers.aspx',
    ),
    'should include the CareerOneStop American Job Center URL',
  );
}

describe('memberWelcomeLetterHtml', () => {
  it('uses the uploaded letter title and distinctive sections', () => {
    const html = memberWelcomeLetterHtml();
    assert.equal(MEMBER_WELCOME_LETTER_TITLE, LETTER_PHRASES[0]);
    assertLetterPhrases(html);
  });
});

describe('applicationConfirmationHtml welcome letter', () => {
  it('folds the uploaded letter into the applicant-facing confirmation', () => {
    const html = applicationConfirmationHtml({
      firstName: 'Alex',
      applicationId: 'app-welcome-1',
    });
    assert.ok(html.includes('Hi Alex'));
    assertLetterPhrases(html);
    assert.match(html, /application id is <strong>app-welcome-1<\/strong>/);
    assert.doesNotMatch(html, /1(?:&ndash;|–|-)\s*2 business days/);
    assert.match(html, /A counselor reviews every application/);
  });
});

describe('applicationAcceptedHtml welcome letter', () => {
  it('uses the uploaded letter as the accepted-membership body', () => {
    const html = applicationAcceptedHtml({ firstName: 'Sam' });
    assert.ok(html.includes('Hi Sam'));
    assertLetterPhrases(html);
  });
});
