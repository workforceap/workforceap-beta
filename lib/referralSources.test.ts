import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES,
  ADMIN_REFERRAL_SOURCE_OPTIONS,
  CENTRAL_TEXAS_REFERRAL_SOURCES,
  PARTNER_REFERRAL_SOURCES,
  REGIONAL_BOARD_NAME_ALIASES,
  normalizedReferralSourceKey,
  uniqueReferralSourceOptions,
} from './referralSources';

// WAP-54: the two Capital Area boards keep one selectable row each; the
// board / county names ops asked for are aliases, not new organisations.

const CAPITAL_AREA = 'Workforce Solutions Capital Area';
const RURAL_CAPITAL_AREA = 'Workforce Solutions Rural Capital Area';

test('PurposeWorks stays first and the two regional boards follow in the requested block', () => {
  assert.equal(PARTNER_REFERRAL_SOURCES[0], 'PurposeWorks / Job Seekers Network');
  assert.equal(CENTRAL_TEXAS_REFERRAL_SOURCES[0], 'PurposeWorks / Job Seekers Network');
  assert.equal(ADMIN_REFERRAL_SOURCE_OPTIONS[0], 'PurposeWorks / Job Seekers Network');
  const capital = PARTNER_REFERRAL_SOURCES.indexOf(CAPITAL_AREA);
  const rural = PARTNER_REFERRAL_SOURCES.indexOf(RURAL_CAPITAL_AREA);
  assert.ok(capital > 0 && capital < 4, `Capital Area board sits in the priority block (index ${capital})`);
  assert.equal(rural, capital + 1);
});

test('requested board names normalise onto the canonical Workforce Solutions rows', () => {
  const capitalKey = normalizedReferralSourceKey(CAPITAL_AREA);
  const ruralKey = normalizedReferralSourceKey(RURAL_CAPITAL_AREA);
  for (const alias of [
    'Capital Area Workforce Development Board',
    'Capital Area Workforce Development Board, Inc.',
    '  capital area   workforce development board ',
    'Travis County Workforce Development Board',
    'WFS Capital Area',
  ]) {
    assert.equal(normalizedReferralSourceKey(alias), capitalKey, alias);
  }
  for (const alias of [
    'Rural Capital Area Workforce Development Board',
    'Rural Capital Area Workforce Development Board, Inc.',
    'WFS Rural Capital Area',
  ]) {
    assert.equal(normalizedReferralSourceKey(alias), ruralKey, alias);
  }
  // The two boards must never collapse into each other.
  assert.notEqual(capitalKey, ruralKey);
  // Unrelated Workforce Solutions boards keep their own identity.
  assert.notEqual(normalizedReferralSourceKey('Workforce Solutions Central Texas'), capitalKey);
  assert.notEqual(normalizedReferralSourceKey('Workforce Solutions (Other)'), capitalKey);
});

test('no menu grows a duplicate row for a board alias', () => {
  for (const menu of [CENTRAL_TEXAS_REFERRAL_SOURCES, ADMIN_REFERRAL_SOURCE_OPTIONS]) {
    const keys = menu.map(normalizedReferralSourceKey);
    assert.equal(new Set(keys).size, keys.length, 'menu rows are unique after normalisation');
    for (const alias of REGIONAL_BOARD_NAME_ALIASES) {
      assert.ok(!(menu as readonly string[]).includes(alias), `${alias} is not its own row`);
    }
    assert.ok((menu as readonly string[]).includes(CAPITAL_AREA));
    assert.ok((menu as readonly string[]).includes(RURAL_CAPITAL_AREA));
  }
});

test('stored and imported board names remain accepted values for persistence', () => {
  // The admin create-member route accepts exactly this list, so historical
  // rows and stale clients that send the board names keep saving.
  for (const alias of REGIONAL_BOARD_NAME_ALIASES) {
    assert.ok((ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES as readonly string[]).includes(alias), alias);
  }
  assert.ok((ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES as readonly string[]).includes(CAPITAL_AREA));
  assert.ok((ADMIN_REFERRAL_SOURCE_ACCEPTED_VALUES as readonly string[]).includes(RURAL_CAPITAL_AREA));
});

test('the public referral-sources export collapses a partner row named after a board onto the canonical row', () => {
  // Mirrors app/api/referral-sources: active partner names first, then the
  // static list, de-duplicated by normalised label. A partner record named
  // with the board's formal name must not produce a second attribution row.
  const menu = uniqueReferralSourceOptions([
    'Capital Area Workforce Development Board',
    'Rural Capital Area Workforce Development Board, Inc.',
    ...CENTRAL_TEXAS_REFERRAL_SOURCES,
  ]);
  const capitalRows = menu.filter((row) => normalizedReferralSourceKey(row) === normalizedReferralSourceKey(CAPITAL_AREA));
  const ruralRows = menu.filter((row) => normalizedReferralSourceKey(row) === normalizedReferralSourceKey(RURAL_CAPITAL_AREA));
  assert.deepEqual(capitalRows, ['Capital Area Workforce Development Board']);
  assert.deepEqual(ruralRows, ['Rural Capital Area Workforce Development Board, Inc.']);
  assert.equal(menu.length, CENTRAL_TEXAS_REFERRAL_SOURCES.length);
  // Fallback stays non-empty and PurposeWorks stays first in the static list.
  assert.ok(CENTRAL_TEXAS_REFERRAL_SOURCES.length > 0);
  assert.equal(CENTRAL_TEXAS_REFERRAL_SOURCES[0], 'PurposeWorks / Job Seekers Network');
});
