// @vitest-environment node
/**
 * J5/J6 draft review and save share parseDraftPatch + validateFields.
 * A loose body parser would persist another stage's finance contacts; a
 * missed duplicate-email or board-invoice check would freeze a document that
 * cannot be sent.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(), isSuperAdmin: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/billing/packetAccess', () => ({ resolveAssignedCounselorContact: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
  getSubjectOrganizationId: vi.fn(),
}));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: vi.fn() }));

import { ApiError } from '@/lib/billing/twoStage/api/http';
import { parseDraftPatch, validateFields } from '@/lib/billing/twoStage/api/draft';
import type { CaseSnapshot } from '@/lib/billing/twoStage/api/caseData';
import type { ContactSource, DraftField } from '@/lib/billing/twoStage/dto';

type Sourced = { value: string | null; source: ContactSource };

function field(value: string | null, source: ContactSource = 'draft'): Sourced {
  return { value, source };
}

function values(overrides: Partial<Record<DraftField, Sourced>> = {}): Record<DraftField, Sourced> {
  return {
    boardName: field('Gulf Coast Workforce Board'),
    'student.name': field('Ada Student'),
    'student.email': field('student@example.test'),
    'counselor.name': field('Casey Counselor'),
    'counselor.email': field('counselor@example.test'),
    'counselor.phone': field('713-555-0100'),
    'finance.name': field(null, 'none'),
    'finance.email': field(null, 'none'),
    boardInvoiceArtifactId: field(null, 'none'),
    ...overrides,
  };
}

function expectValidationFailed(body: unknown) {
  try {
    parseDraftPatch('j5', body);
    throw new Error('expected parseDraftPatch to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(422);
    expect((error as ApiError).body.code).toBe('VALIDATION_FAILED');
  }
}

describe('parseDraftPatch', () => {
  it.each([null, undefined, [], 'board', 1])('rejects a non-object body (%j)', (body) => {
    expectValidationFailed(body);
  });

  it('keeps typed J5 contacts and ignores J6-only finance / invoice keys', () => {
    const patch = parseDraftPatch('j5', {
      boardName: 'Gulf Coast',
      student: { name: 'Ada', email: 'ada@example.test' },
      counselor: { name: 'Casey', email: 'casey@example.test', phone: '713-555-0100' },
      finance: { name: 'Finance', email: 'finance@example.test' },
      boardInvoiceArtifactId: 'inv-1',
      expectedVersionHash: 'a'.repeat(64),
    });
    expect(patch.boardName).toBe('Gulf Coast');
    expect(patch.student).toEqual({ name: 'Ada', email: 'ada@example.test' });
    expect(patch.counselor).toEqual({ name: 'Casey', email: 'casey@example.test', phone: '713-555-0100' });
    expect(patch.finance).toBeUndefined();
    expect(patch.boardInvoiceArtifactId).toBeUndefined();
    expect(patch.expectedVersionHash).toBe('a'.repeat(64));
  });

  it('accepts J6 finance and a cleared board invoice; coerces non-strings to empty', () => {
    const patch = parseDraftPatch('j6', {
      boardName: 12,
      student: { name: 1, email: true },
      finance: { name: 'Pat Finance', email: 'finance@example.test' },
      boardInvoiceArtifactId: null,
      expectedVersionHash: null,
    });
    expect(patch.boardName).toBe('');
    expect(patch.student).toEqual({ name: undefined, email: undefined });
    expect(patch.finance).toEqual({ name: 'Pat Finance', email: 'finance@example.test' });
    expect(patch.boardInvoiceArtifactId).toBeNull();
    expect(patch.expectedVersionHash).toBeNull();
  });

  it('ignores array stand-ins for nested contact objects', () => {
    const patch = parseDraftPatch('j6', {
      student: ['Ada'],
      counselor: ['Casey'],
      finance: ['Pat'],
    });
    expect(patch.student).toBeUndefined();
    expect(patch.counselor).toBeUndefined();
    expect(patch.finance).toBeUndefined();
  });
});

describe('validateFields', () => {
  const artifacts = (...rows: Array<{ id: string; kind: string }>): Pick<CaseSnapshot, 'artifacts'> =>
    ({ artifacts: rows } as Pick<CaseSnapshot, 'artifacts'>);
  const emptySnapshot = artifacts();

  it('accepts a complete J5 and does not require finance fields', () => {
    expect(validateFields('j5', values(), emptySnapshot)).toEqual({});
  });

  it('requires every J5 editor field, including whitespace-only values', () => {
    const errors = validateFields(
      'j5',
      values({
        boardName: field('   '),
        'counselor.phone': field(null, 'none'),
      }),
      emptySnapshot,
    );
    expect(errors.boardName?.code).toBe('FIELD_REQUIRED');
    expect(errors['counselor.phone']?.code).toBe('FIELD_REQUIRED');
    expect(errors['student.email']).toBeUndefined();
  });

  it('rejects an implausible or duplicate email and requires distinct J6 finance', () => {
    const invalid = validateFields('j5', values({ 'student.email': field('not-an-email') }), emptySnapshot);
    expect(invalid['student.email']?.code).toBe('EMAIL_INVALID');

    const duplicate = validateFields(
      'j5',
      values({ 'counselor.email': field('Student@example.test') }),
      emptySnapshot,
    );
    expect(duplicate['counselor.email']?.code).toBe('EMAIL_DUPLICATE');

    const j6MissingFinance = validateFields('j6', values(), emptySnapshot);
    expect(j6MissingFinance['finance.name']?.code).toBe('FIELD_REQUIRED');
    expect(j6MissingFinance['finance.email']?.code).toBe('FIELD_REQUIRED');
  });

  it('accepts a board invoice only when it is an uploaded invoice of this case', () => {
    const snapshot = artifacts(
      { id: 'inv-1', kind: 'board_invoice' },
      { id: 'vouch-1', kind: 'board_signed_voucher' },
    );
    const completeJ6 = values({
      'finance.name': field('Pat Finance'),
      'finance.email': field('finance@example.test'),
      boardInvoiceArtifactId: field('inv-1'),
    });
    expect(validateFields('j6', completeJ6, snapshot)).toEqual({});

    const wrongKind = validateFields('j6', { ...completeJ6, boardInvoiceArtifactId: field('vouch-1') }, snapshot);
    expect(wrongKind.boardInvoiceArtifactId?.code).toBe('BOARD_INVOICE_INVALID');

    const unknown = validateFields('j6', { ...completeJ6, boardInvoiceArtifactId: field('inv-missing') }, emptySnapshot);
    expect(unknown.boardInvoiceArtifactId?.code).toBe('BOARD_INVOICE_INVALID');
  });

  it('flags characters the one-page PDF cannot print', () => {
    const errors = validateFields('j5', values({ 'student.name': field('Ada\u0007Student') }), emptySnapshot);
    expect(errors['student.name']?.code).toBe('TEXT_NOT_PRINTABLE');
  });
});
