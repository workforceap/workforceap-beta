import assert from 'node:assert/strict';
import test from 'node:test';

import { assessmentConfirmMessage } from './assessmentConfirmMessage';

test('high scores stay quiet and name the older points score as the basis, without a second percentage', () => {
  assert.equal(
    assessmentConfirmMessage(82),
    'Ready for training. Your counselor will follow up. This readiness uses the older weighted points score, not the WAPAT total above.',
  );
  assert.doesNotMatch(assessmentConfirmMessage(100), /You're ready to start training/);
  assert.doesNotMatch(assessmentConfirmMessage(82), /\d+%/);
});

test('mid and low scores skip Great job / Thanks for completing; thresholds 75/50 unchanged', () => {
  assert.match(assessmentConfirmMessage(75), /Ready for training/);
  assert.match(assessmentConfirmMessage(74), /foundational resources/);
  assert.match(assessmentConfirmMessage(50), /foundational resources/);
  assert.match(assessmentConfirmMessage(49), /counselor will follow up from your answers/);
  assert.doesNotMatch(assessmentConfirmMessage(50), /Great job!/);
});

test('69% legacy points is below the 75 readiness line and the copy never presents it as the WAPAT total', () => {
  const msg = assessmentConfirmMessage(69);
  assert.match(msg, /foundational resources/);
  assert.doesNotMatch(msg, /74\.3/);
  // The WAPAT total is the only headline number. This line must not repeat a
  // second percentage; counselors still see the points score in staff views.
  assert.doesNotMatch(msg, /\d+%/);
  assert.match(msg, /readiness uses the older weighted points score, not the WAPAT total above/);
});
