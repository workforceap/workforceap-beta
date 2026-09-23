import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HELP_REQUEST_FAILURE,
  HELP_REQUEST_TEAM_EMAIL,
  feedbackReadersSentence,
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

test('sent notice follows what the route reports, reusing the page name only when both agree', () => {
  const dana = { kind: 'counselor', name: 'Dana Reyes' } as const;
  assert.equal(helpRequestSentNotice('counselor', dana), 'Request sent. We emailed Dana Reyes.');
  assert.equal(helpRequestSentNotice('counselor', { kind: 'counselor', name: null }), 'Request sent. We emailed your counselor.');
  // The assignment changed after the page rendered: the route's answer wins.
  assert.equal(helpRequestSentNotice('team', dana), 'Request sent. We emailed the WorkforceAP team.');
  assert.equal(helpRequestSentNotice('counselor', { kind: 'team' }), 'Request sent. We emailed your counselor.');
  // An older deploy that does not send `sentTo`: no name is guessed.
  assert.equal(helpRequestSentNotice(null, dana), 'Request sent.');
});

test('feedback readers match the recipient state', () => {
  assert.equal(feedbackReadersSentence({ kind: 'counselor', name: 'Dana Reyes' }), 'WorkforceAP staff and your counselor can read what you send.');
  assert.equal(feedbackReadersSentence({ kind: 'team' }), 'WorkforceAP staff can read what you send.');
  assert.equal(feedbackReadersSentence(null), 'WorkforceAP staff, and your counselor if you have one, can read what you send.');
});

test('no help or feedback sentence promises a reply time', () => {
  const sentences = [
    helpRequestDescription({ kind: 'counselor', name: 'Dana Reyes' }),
    helpRequestDescription({ kind: 'team' }),
    helpRequestDescription(null),
    helpRequestSentNotice('counselor', null),
    helpRequestSentNotice('team', null),
    feedbackReadersSentence(null),
    ...Object.values(HELP_REQUEST_FAILURE),
  ];
  for (const sentence of sentences) assert.doesNotMatch(sentence, TIME_PROMISE, sentence);
});
