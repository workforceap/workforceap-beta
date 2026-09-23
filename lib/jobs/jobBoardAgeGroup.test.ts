import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveJobBoardAgeGroup, stricterAgeGroup, isAgeGroup } from './jobBoardAgeGroup';

// WAP-260: a minor must never land on the adult job board.
const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
};

test('a failed profile read fails closed to the youth board', () => {
  assert.equal(resolveJobBoardAgeGroup('failed'), 'youth14to17');
});

test('no date of birth but marked a minor gets the youth board', () => {
  assert.equal(resolveJobBoardAgeGroup({ dob: null, isMinor: true }), 'youth14to17');
});

test('a date of birth decides the board', () => {
  assert.equal(resolveJobBoardAgeGroup({ dob: yearsAgo(30), isMinor: false }), 'adult18plus');
  assert.equal(resolveJobBoardAgeGroup({ dob: yearsAgo(16), isMinor: false }), 'youth14to17');
  assert.equal(resolveJobBoardAgeGroup({ dob: yearsAgo(12), isMinor: true }), 'under14');
});

test('no profile row, or no date of birth and not a minor, keeps the public adult board', () => {
  assert.equal(resolveJobBoardAgeGroup(null), 'adult18plus');
  assert.equal(resolveJobBoardAgeGroup({ dob: null, isMinor: false }), 'adult18plus');
  assert.equal(resolveJobBoardAgeGroup({ dob: null, isMinor: null }), 'adult18plus');
});

test('a requested age group can tighten the board but never loosen it', () => {
  assert.equal(stricterAgeGroup('youth14to17', 'adult18plus'), 'youth14to17');
  assert.equal(stricterAgeGroup('under14', 'adult18plus'), 'under14');
  assert.equal(stricterAgeGroup('adult18plus', 'youth14to17'), 'youth14to17');
  assert.equal(stricterAgeGroup('adult18plus', null), 'adult18plus');
});

test('isAgeGroup accepts only the three board names', () => {
  assert.ok(isAgeGroup('youth14to17'));
  assert.ok(!isAgeGroup('adult'));
  assert.ok(!isAgeGroup(null));
});
