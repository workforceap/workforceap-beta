// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  EMAIL_TEMPLATE_TEST_MAX_INPUT_BYTES,
  EMAIL_TEMPLATE_TEST_RETRY_WINDOW_MS,
  emailTemplateTestAttemptAge,
  emailTemplateTestStorageKey,
  readEmailTemplateTestAttempt,
} from '@/lib/admin/emailTemplateTestAttempt';

const NOW = Date.parse('2026-10-11T08:00:00Z');
const ATTEMPT_UUID = '00000000-0000-4000-8000-000000000001';

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    actorId: 'actor-a',
    templateId: 'template-a',
    attemptId: `${NOW}-${ATTEMPT_UUID}`,
    templateUpdatedAt: '2026-10-10T00:00:00.000Z',
    to: 'synthetic-admin@workforceap.org',
    variables: { firstName: 'Synthetic' },
    ...overrides,
  };
}

describe('readEmailTemplateTestAttempt', () => {
  it('returns a copied snapshot for a well-formed logical send', () => {
    const row = attempt();
    const parsed = readEmailTemplateTestAttempt(row);
    expect(parsed).toEqual(row);
    parsed!.variables.firstName = 'Mutated';
    expect(row.variables.firstName).toBe('Synthetic');
    expect(parsed).not.toHaveProperty('html');
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['array', []],
    ['string', 'not-an-object'],
  ])('rejects %s input before any send can reuse it', (_label, value) => {
    expect(readEmailTemplateTestAttempt(value)).toBeNull();
  });

  it.each([
    ['CRLF recipient', { to: 'ok@workforceap.org\r\nBcc: other@example.test' }],
    ['null-byte recipient', { to: 'ok@workforceap.org\0bcc@example.test' }],
    ['blank recipient', { to: '   ' }],
    ['oversized recipient', { to: `${'a'.repeat(321)}@x.com` }],
    ['path-like actor', { actorId: '../actor-a' }],
    ['email actor', { actorId: 'admin@workforceap.org' }],
    ['non-uuid attempt', { attemptId: 'not-an-attempt' }],
    ['12-digit attempt time', { attemptId: `179170560000-${ATTEMPT_UUID}` }],
    ['non-v4 attempt uuid', { attemptId: `${NOW}-00000000-0000-1000-8000-000000000001` }],
    ['unparseable revision', { templateUpdatedAt: 'yesterday' }],
    ['oversized revision', { templateUpdatedAt: `2026-10-10T00:00:00.000Z${'x'.repeat(17)}` }],
    ['array variables', { variables: ['firstName'] }],
    ['non-string variable', { variables: { firstName: 1 } }],
    ['long variable key', { variables: { ['k'.repeat(101)]: 'Synthetic' } }],
  ])('rejects %s', (_label, overrides) => {
    expect(readEmailTemplateTestAttempt(attempt(overrides))).toBeNull();
  });

  it('rejects more than 100 template variables', () => {
    const variables = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, 'v']));
    expect(readEmailTemplateTestAttempt(attempt({ variables }))).toBeNull();
  });

  it('rejects a payload over the retained-input byte cap', () => {
    const variables = { firstName: 'x'.repeat(EMAIL_TEMPLATE_TEST_MAX_INPUT_BYTES) };
    expect(readEmailTemplateTestAttempt(attempt({ variables }))).toBeNull();
  });

  it('does not keep unexpected fields from a restored browser snapshot', () => {
    const parsed = readEmailTemplateTestAttempt(attempt({ html: '<script>alert(1)</script>', subject: 'Injected' }));
    expect(parsed).toEqual(attempt());
  });
});

describe('emailTemplateTestAttemptAge', () => {
  const frozen = readEmailTemplateTestAttempt(attempt())!;

  it('treats a 60s-fast client clock as still valid and the next millisecond as future', () => {
    expect(emailTemplateTestAttemptAge(
      readEmailTemplateTestAttempt(attempt({ attemptId: `${NOW + 60_000}-${ATTEMPT_UUID}` }))!,
      NOW,
    )).toBe('valid');
    expect(emailTemplateTestAttemptAge(
      readEmailTemplateTestAttempt(attempt({ attemptId: `${NOW + 60_001}-${ATTEMPT_UUID}` }))!,
      NOW,
    )).toBe('future');
  });

  it('expires at the 23h bound instead of staying retryable', () => {
    expect(emailTemplateTestAttemptAge(frozen, NOW + EMAIL_TEMPLATE_TEST_RETRY_WINDOW_MS - 1)).toBe('valid');
    expect(emailTemplateTestAttemptAge(frozen, NOW + EMAIL_TEMPLATE_TEST_RETRY_WINDOW_MS)).toBe('expired');
  });
});

describe('emailTemplateTestStorageKey', () => {
  it('namespaces retained operations to the authenticated actor', () => {
    expect(emailTemplateTestStorageKey('actor-a')).toBe('wap:admin-email-template-tests:actor-a');
    expect(emailTemplateTestStorageKey('actor-b')).not.toBe(emailTemplateTestStorageKey('actor-a'));
  });
});
