import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDBACK_READERS_SENTENCE,
  HELP_REQUEST_FAILURE,
  HELP_REQUEST_TEAM_EMAIL,
  helpRequestDescription,
  helpRequestSentNotice,
} from './helpContactCopy';

// Any fixed reply-time promise (the repo-wide wait-copy rule): none of this copy may carry one.
const TIME_PROMISE = /\b(within|hours?|business days?|minutes?|today|tomorrow|soon|asap|right away)\b/i;

test('request-help description names the saved counselor, the team inbox, or both when unknown', () => {
  assert.equal(
    helpRequestDescription({ kind: 'counselor', name: 'Dana Reyes' }),
    'Ask your counselor, Dana Reyes, to get in touch with you. We email them your name, email address and program.',
  );
  assert.equal(
    helpRequestDescription({ kind: 'counselor', name: null }),
    'Ask your counselor to get in touch with you. We email them your name, email address and program.',
  );
  const team = helpRequestDescription({ kind: 'team' });
  assert.match(team, /^You do not have a counselor yet, so the request goes to the WorkforceAP team at info@workforceap\.org\./);
  assert.ok(team.includes(HELP_REQUEST_TEAM_EMAIL));
  const unknown = helpRequestDescription(null);
  assert.match(unknown, /your counselor/);
  assert.match(unknown, /If you do not have a counselor yet, the request goes to the WorkforceAP team instead\./);
});

test('sent notice names a counselor only when the route emailed the one the page showed', () => {
  const dana = { kind: 'counselor', name: 'Dana Reyes' } as const;
  assert.equal(helpRequestSentNotice({ to: 'counselor', name: 'Dana Reyes' }, dana), 'Request sent. We emailed Dana Reyes.');
  // Reassigned from Dana to Sam after the page loaded: never "We emailed Dana".
  assert.equal(helpRequestSentNotice({ to: 'counselor', name: 'Sam Ortiz' }, dana), 'Request sent. We emailed your counselor.');
  assert.equal(helpRequestSentNotice({ to: 'counselor', name: null }, dana), 'Request sent. We emailed your counselor.');
  assert.equal(
    helpRequestSentNotice({ to: 'counselor', name: null }, { kind: 'counselor', name: null }),
    'Request sent. We emailed your counselor.',
  );
  // Assigned after the page rendered with no counselor.
  assert.equal(helpRequestSentNotice({ to: 'counselor', name: 'Sam Ortiz' }, { kind: 'team' }), 'Request sent. We emailed your counselor.');
  assert.equal(helpRequestSentNotice({ to: 'counselor', name: 'Sam Ortiz' }, null), 'Request sent. We emailed your counselor.');
  // Unassigned after the page rendered: the route's answer wins.
  assert.equal(helpRequestSentNotice({ to: 'team', name: null }, dana), 'Request sent. We emailed the WorkforceAP team.');
  // A reply without `sentTo`: no recipient is guessed.
  assert.equal(helpRequestSentNotice(null, dana), 'Request sent.');
});

test('feedback readers are staff only: no counselor-facing feedback view exists', () => {
  assert.equal(FEEDBACK_READERS_SENTENCE, 'WorkforceAP staff can read what you send.');
  assert.doesNotMatch(FEEDBACK_READERS_SENTENCE, /counselor/i);
});

test('no help or feedback sentence promises a reply time', () => {
  const sentences = [
    helpRequestDescription({ kind: 'counselor', name: 'Dana Reyes' }),
    helpRequestDescription({ kind: 'team' }),
    helpRequestDescription(null),
    helpRequestSentNotice({ to: 'counselor', name: null }, null),
    helpRequestSentNotice({ to: 'team', name: null }, null),
    FEEDBACK_READERS_SENTENCE,
    ...Object.values(HELP_REQUEST_FAILURE),
  ];
  for (const sentence of sentences) assert.doesNotMatch(sentence, TIME_PROMISE, sentence);
});
