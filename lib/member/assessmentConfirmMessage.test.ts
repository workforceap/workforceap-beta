import assert from 'node:assert/strict';
import test from 'node:test';

import { assessmentConfirmMessage } from './assessmentConfirmMessage';

test('high scores stay quiet and name the legacy points score as the basis', () => {
  assert.equal(
    assessmentConfirmMessage(82),
    'Based on your points score of 82% (legacy, weighted; not the WAPAT total): ready for training. Your counselor will follow up.',
  );
  assert.doesNotMatch(assessmentConfirmMessage(100), /You're ready to start training/);
});

test('mid and low scores skip Great job / Thanks for completing; thresholds 75/50 unchanged', () => {
  assert.match(assessmentConfirmMessage(75), /ready for training/);
  assert.match(assessmentConfirmMessage(74), /foundational resources/);
  assert.match(assessmentConfirmMessage(50), /foundational resources/);
  assert.match(assessmentConfirmMessage(49), /counselor will follow up from your answers/);
  assert.doesNotMatch(assessmentConfirmMessage(50), /Great job!/);
});

test('69% legacy points is below the 75 readiness line and the copy never presents it as the WAPAT total', () => {
  const msg = assessmentConfirmMessage(69);
  assert.match(msg, /points score of 69% \(legacy, weighted; not the WAPAT total\)/);
  assert.match(msg, /foundational resources/);
  assert.doesNotMatch(msg, /74\.3/);
});
