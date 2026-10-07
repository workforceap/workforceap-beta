// @vitest-environment node
/**
 * Two-stage routes classify PostgreSQL / Prisma refusals before they become
 * a generic 500. A missed 23514 shape turns a clean billing-rule 409 into an
 * unexpected error; a P2002 mistaken for a rule refusal retries or maps the
 * wrong code on signature upload and draft-number races.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(), isSuperAdmin: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
  getSubjectOrganizationId: vi.fn(),
}));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: vi.fn() }));

import { ApiError } from '@/lib/billing/twoStage/api/http';
import {
  isArchivableKind,
  archiveErrorCode,
} from '@/lib/billing/twoStage/api/archive';
import {
  isBillingRuleRefusal,
  isUniqueViolation,
  parseStage,
} from '@/lib/billing/twoStage/api/access';

describe('parseStage', () => {
  it('accepts only the two billing stages', () => {
    expect(parseStage('j5')).toBe('j5');
    expect(parseStage('j6')).toBe('j6');
  });

  it.each([undefined, '', 'j7', 'J5', 'j5 ', 'preview'])('rejects %j', (raw) => {
    try {
      parseStage(raw);
      throw new Error('expected parseStage to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(404);
      expect((error as ApiError).body.code).toBe('NOT_FOUND');
    }
  });
});

describe('isBillingRuleRefusal', () => {
  it('recognizes every Prisma / PostgreSQL shape for SQLSTATE 23514', () => {
    expect(isBillingRuleRefusal({ code: '23514' })).toBe(true);
    expect(isBillingRuleRefusal({ meta: { code: '23514' } })).toBe(true);
    expect(isBillingRuleRefusal({ code: 'P2010', meta: { code: '23514' }, message: 'Raw query failed' })).toBe(true);
    expect(isBillingRuleRefusal(new Error('SQLSTATE 23514 check constraint'))).toBe(true);
  });

  it('does not treat unique violations, other SQLSTATEs, or non-errors as rule refusals', () => {
    expect(isBillingRuleRefusal({ code: 'P2002' })).toBe(false);
    expect(isBillingRuleRefusal({ code: '23505' })).toBe(false);
    expect(isBillingRuleRefusal({ message: 'x23514x' })).toBe(false);
    expect(isBillingRuleRefusal(null)).toBe(false);
    expect(isBillingRuleRefusal('23514')).toBe(false);
    expect(isBillingRuleRefusal({ message: 'The billing records refused this change.' })).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('matches only Prisma P2002', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: '23514' })).toBe(false);
    expect(isUniqueViolation({ meta: { code: 'P2002' } })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(new Error('Unique constraint failed'))).toBe(false);
  });
});

describe('finance archive kind and error mapping', () => {
  it('archives only the five PDF kinds; receipt-signature stays closed', () => {
    expect(isArchivableKind('j5_signed_pdf')).toBe(true);
    expect(isArchivableKind('j6_signed_pdf')).toBe(true);
    expect(isArchivableKind('board_signed_voucher')).toBe(true);
    expect(isArchivableKind('board_invoice')).toBe(true);
    expect(isArchivableKind('external_j5_copy')).toBe(true);
    expect(isArchivableKind('voucher_receipt_signature')).toBe(false);
    expect(isArchivableKind('j5')).toBe(false);
  });

  it('maps FinanceArchiveError only when name and code are both present', () => {
    expect(archiveErrorCode({ name: 'FinanceArchiveError', code: 'INTEGRITY_MISMATCH' })).toBe('INTEGRITY_MISMATCH');
    expect(archiveErrorCode({ name: 'FinanceArchiveError', code: 'STORAGE_UNAVAILABLE' })).toBe('STORAGE_UNAVAILABLE');
    expect(archiveErrorCode({ name: 'Error', code: 'INTEGRITY_MISMATCH' })).toBeNull();
    expect(archiveErrorCode({ name: 'FinanceArchiveError', code: 502 })).toBeNull();
    expect(archiveErrorCode(null)).toBeNull();
    expect(archiveErrorCode(new Error('storage down'))).toBeNull();
  });
});
