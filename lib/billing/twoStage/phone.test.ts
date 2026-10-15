import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBillingPhone } from './phone';

test('billing phones use the app US format for ten digits and country-code 1', () => {
  for (const phone of ['5125550123', '15125550123', '+1 512 555 0123', '(512)555-0123']) {
    assert.equal(formatBillingPhone(phone), '(512) 555-0123');
  }
});

test('billing phones preserve extensions without turning them into subscriber digits', () => {
  assert.equal(formatBillingPhone('5125550123 ext. 456'), '(512) 555-0123 ext. 456');
  assert.equal(formatBillingPhone('+15125550123x42'), '(512) 555-0123 x42');
  assert.equal(formatBillingPhone('5125550123 #007'), '(512) 555-0123 #007');
});

test('billing phones preserve international dial strings and unfinished input', () => {
  for (const phone of ['+47 1234 5678', '+44 20 7946 0958 ext 3', '0044 20 7946 0958', '51255', '(512) 555-', '+1 512', '+1 512 555 012', '5125550123456', '512+5550123']) {
    assert.equal(formatBillingPhone(phone), phone);
  }
});

test('blank billing phones stay blank instead of becoming a required-field placeholder', () => {
  for (const phone of [null, undefined, '', '  ']) assert.equal(formatBillingPhone(phone), '');
});
