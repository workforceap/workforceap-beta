// @vitest-environment node
/**
 * Two-stage J5/J6 release gates (#2699 / #2713): every gate defaults off,
 * env flags must be the exact string `true`, J5 send does not require a
 * designated signer, and J6 send / every sign does. A closed gate must throw
 * before any claim, archive write or provider call.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import { ApiError } from '@/lib/billing/twoStage/api/http';
import {
  allGates,
  envGates,
  FINANCE_ARCHIVE_UNCHECKED_MESSAGE,
  GATE_MESSAGES,
  requireMigrationApplied,
  requireSendGates,
  requireSignGates,
  SIGNED_RENDERER_AVAILABLE,
} from '@/lib/billing/twoStage/api/gates';

const SIGNER = 'a0000000-0000-4000-8000-000000000001';
const OPEN_ENV = {
  BILLING_TWO_STAGE_MIGRATION_APPLIED: 'true',
  BILLING_EXECUTIVE_SIGNER_USER_ID: SIGNER,
  BILLING_TWO_STAGE_EMAIL_ENABLED: 'true',
};

function closedCode(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return (error as ApiError).body.code;
  }
  throw new Error('expected a closed gate to throw');
}

describe('two-stage env gates default off and only the string true opens them', () => {
  it('keeps migration, signing and email closed until each flag is exactly true', () => {
    const closed = envGates({});
    expect(closed.migration).toEqual({ enabled: false, code: 'MIGRATION_NOT_APPLIED', message: GATE_MESSAGES.MIGRATION_NOT_APPLIED });
    expect(closed.signing).toEqual({ enabled: false, code: 'SIGNER_NOT_CONFIGURED', message: GATE_MESSAGES.SIGNER_NOT_CONFIGURED });
    expect(closed.realEmail).toEqual({ enabled: false, code: 'EMAIL_NOT_ENABLED', message: GATE_MESSAGES.EMAIL_NOT_ENABLED });
    expect(closed.signedRenderer.enabled).toBe(SIGNED_RENDERER_AVAILABLE);
    expect(closed.providerOrg.enabled).toBe(true);

    for (const value of ['TRUE', '1', 'yes', 'on']) {
      const almost = envGates({
        BILLING_TWO_STAGE_MIGRATION_APPLIED: value,
        BILLING_TWO_STAGE_EMAIL_ENABLED: value,
        BILLING_EXECUTIVE_SIGNER_USER_ID: 'not-a-uuid',
        BILLING_PACKET_PROVIDER_ORG_ID: 'not-a-uuid',
      });
      expect(almost.migration.enabled, value).toBe(false);
      expect(almost.realEmail.enabled, value).toBe(false);
      expect(almost.signing.enabled, value).toBe(false);
      expect(almost.providerOrg).toEqual({
        enabled: false,
        code: 'PROVIDER_ORG_MISCONFIGURED',
        message: GATE_MESSAGES.PROVIDER_ORG_MISCONFIGURED,
      });
    }

    const open = envGates({ ...OPEN_ENV, BILLING_TWO_STAGE_MIGRATION_APPLIED: ' true ' });
    expect(open.migration.enabled).toBe(true);
    expect(open.signing.enabled).toBe(true);
    expect(open.realEmail.enabled).toBe(true);
  });

  it('reports an unchecked finance archive as unknown, not as ready', () => {
    expect(allGates({ financeArchiveReady: null, designatedSigner: false }, {}).financeArchive).toEqual({
      enabled: null,
      code: null,
      message: FINANCE_ARCHIVE_UNCHECKED_MESSAGE,
    });
    expect(allGates({ financeArchiveReady: false, designatedSigner: true }, OPEN_ENV).financeArchive).toEqual({
      enabled: false,
      code: 'FINANCE_ARCHIVE_UNAVAILABLE',
      message: GATE_MESSAGES.FINANCE_ARCHIVE_UNAVAILABLE,
    });
    expect(allGates({ financeArchiveReady: true, designatedSigner: true }, OPEN_ENV).receiptSignaturePrincipal.enabled).toBe(true);
  });
});

describe('sign and send gates keep the hard holds in contract order', () => {
  it('refuses every sign until the env signer, renderer and designated principal are all set', () => {
    expect(closedCode(() => requireSignGates('j5', true, {}))).toBe('SIGNER_NOT_CONFIGURED');
    expect(closedCode(() => requireSignGates('j6', false, { BILLING_EXECUTIVE_SIGNER_USER_ID: SIGNER }))).toBe(
      'SIGNER_PRINCIPAL_UNSET',
    );
    expect(() => requireSignGates('j5', true, { BILLING_EXECUTIVE_SIGNER_USER_ID: SIGNER })).not.toThrow();
    expect(() => requireSignGates('j6', true, { BILLING_EXECUTIVE_SIGNER_USER_ID: SIGNER })).not.toThrow();
  });

  it('lets J5 send once email is enabled, but still holds J6 send without a designated signer', () => {
    expect(closedCode(() => requireSendGates('j5', false, {}))).toBe('EMAIL_NOT_ENABLED');
    expect(() => requireSendGates('j5', false, { BILLING_TWO_STAGE_EMAIL_ENABLED: 'true' })).not.toThrow();
    expect(closedCode(() => requireSendGates('j6', false, { BILLING_TWO_STAGE_EMAIL_ENABLED: 'true' }))).toBe(
      'SIGNER_PRINCIPAL_UNSET',
    );
    expect(() => requireSendGates('j6', true, { BILLING_TWO_STAGE_EMAIL_ENABLED: 'true' })).not.toThrow();
  });

  it('refuses work before the migration flag', () => {
    expect(closedCode(() => requireMigrationApplied({}))).toBe('MIGRATION_NOT_APPLIED');
    expect(() => requireMigrationApplied({ BILLING_TWO_STAGE_MIGRATION_APPLIED: 'true' })).not.toThrow();
  });
});
