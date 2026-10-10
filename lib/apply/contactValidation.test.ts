import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUsPhoneInput, usPhoneIssue, emailIssue } from './contactValidation';

test('formats as the user types and stops at 10 digits', () => {
  assert.equal(formatUsPhoneInput('512'), '512');
  assert.equal(formatUsPhoneInput('5125550'), '(512) 555-0');
  assert.equal(formatUsPhoneInput('(512) 555-0100'), '(512) 555-0100');
  assert.equal(formatUsPhoneInput('51255501009999'), '(512) 555-0100');
});

test('a leading US country code 1 is dropped, not counted as an area-code digit', () => {
  assert.equal(formatUsPhoneInput('1 512 555 0100'), '(512) 555-0100');
  assert.equal(formatUsPhoneInput('+15125550100'), '(512) 555-0100');
  assert.equal(usPhoneIssue('+1 (512) 555-0100'), null);
});

test('phone requires exactly 10 digits and a real US area code / exchange', () => {
  assert.equal(usPhoneIssue(''), 'required');
  assert.equal(usPhoneIssue('512555010'), 'digits');
  assert.equal(usPhoneIssue('(512) 555-0100'), null);
  assert.equal(usPhoneIssue('512-555-01001'), 'digits');
  // NANP: area code and exchange cannot start with 0 or 1.
  assert.equal(usPhoneIssue('(012) 555-0100'), 'invalid');
  assert.equal(usPhoneIssue('(512) 155-0100'), 'invalid');
  // Obvious junk.
  assert.equal(usPhoneIssue('(555) 555-5555'), 'invalid');
  assert.equal(usPhoneIssue('(999) 999-9999'), 'invalid');
});

test('email must have a local part, @, a dotted domain and a 2+ letter TLD', () => {
  assert.equal(emailIssue(''), 'required');
  assert.equal(emailIssue('mike'), 'invalid');
  assert.equal(emailIssue('mike@'), 'invalid');
  assert.equal(emailIssue('mike@gmail'), 'invalid');
  assert.equal(emailIssue('mike@gmail.c'), 'invalid');
  assert.equal(emailIssue('mike@@gmail.com'), 'invalid');
  assert.equal(emailIssue('mike @gmail.com'), 'invalid');
  assert.equal(emailIssue('mike@gmail..com'), 'invalid');
  assert.equal(emailIssue('mike@gmail.com'), null);
  assert.equal(emailIssue('  Mike.Brown+wap@WorkforceAP.org  '), null);
});

test('common domain typos are flagged so applicants fix them', () => {
  for (const typo of ['mike@gmial.com', 'mike@gmail.con', 'mike@gmai.com', 'mike@yahooo.com', 'mike@hotmial.com', 'mike@gmail.co', 'mike@outlok.com', 'mike@icloud.co']) {
    assert.equal(emailIssue(typo), 'typo', typo);
  }
  assert.equal(emailIssue('mike@company.co'), null);
});
