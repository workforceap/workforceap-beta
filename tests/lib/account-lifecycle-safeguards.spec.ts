import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { EnrollmentAgreementError } from '@/lib/enrollmentAgreements/errors';
import {
  assertAgreementAccountRestoreOwned,
  assertNoAgreementOperationForAccountChange,
  releaseAgreementAccountRestore,
} from '@/lib/gdpr/accountLifecycle';

/**
 * #2727 account restore/erase must skip before the additive migration and
 * fail closed once only one safeguard table exists, transactions are
 * flattened, or a document fence is held. HTTP suites cover the restore
 * route; these pins are the shared helper itself.
 */

type SchemaRow = { submissions: boolean; locks: boolean; isolation: string };
type LifecycleClient = Parameters<typeof assertNoAgreementOperationForAccountChange>[1];
type RestoreClient = Parameters<typeof releaseAgreementAccountRestore>[3];

function client(options: {
  schema?: SchemaRow | SchemaRow[] | null;
  member?: Array<{ id: string }>;
  lock?: { present: boolean } | Array<{ present: boolean }> | null;
  execute?: number;
}): LifecycleClient & RestoreClient & { $queryRaw: ReturnType<typeof vi.fn>; $executeRaw: ReturnType<typeof vi.fn> } {
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('to_regclass')) {
      if (options.schema == null) return [];
      return Array.isArray(options.schema) ? options.schema : [options.schema];
    }
    if (sql.includes('FOR UPDATE')) return options.member ?? [];
    if (sql.includes('enrollment_agreement_operation_locks')) {
      if (options.lock == null) return [];
      return Array.isArray(options.lock) ? options.lock : [options.lock];
    }
    throw new Error(`unexpected lifecycle SQL: ${sql}`);
  });
  const $executeRaw = vi.fn(async () => options.execute ?? 0);
  return { $queryRaw, $executeRaw } as LifecycleClient & RestoreClient & {
    $queryRaw: typeof $queryRaw;
    $executeRaw: typeof $executeRaw;
  };
}

const READY: SchemaRow = { submissions: true, locks: true, isolation: 'read committed' };
const MEMBER = 'member-1';
const ORG = 'org-1';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('PRISMA_FLATTEN_TX', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assertNoAgreementOperationForAccountChange', () => {
  it('is a no-op before either safeguard table exists', async () => {
    const db = client({ schema: { submissions: false, locks: false, isolation: 'read committed' } });
    await expect(assertNoAgreementOperationForAccountChange(MEMBER, db, ORG)).resolves.toBeUndefined();
    expect(db.$queryRaw).toHaveBeenCalledOnce();
  });

  it.each([
    ['only submissions', { submissions: true, locks: false, isolation: 'read committed' }],
    ['only locks', { submissions: false, locks: true, isolation: 'read committed' }],
    ['repeatable read isolation', { ...READY, isolation: 'repeatable read' }],
  ] as const)('fails closed when safeguards are incomplete: %s', async (_label, schema) => {
    const db = client({ schema });
    await expect(assertNoAgreementOperationForAccountChange(MEMBER, db)).rejects.toMatchObject({
      status: 503,
      code: 'ACCOUNT_LIFECYCLE_UNAVAILABLE',
    });
  });

  it('fails closed when Prisma transactions are flattened', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const db = client({ schema: READY });
    await expect(assertNoAgreementOperationForAccountChange(MEMBER, db)).rejects.toMatchObject({
      status: 503,
      code: 'ACCOUNT_LIFECYCLE_UNAVAILABLE',
    });
  });

  it('rejects an ambiguous schema probe instead of skipping the fence', async () => {
    const db = client({ schema: null });
    await expect(assertNoAgreementOperationForAccountChange(MEMBER, db)).rejects.toBeInstanceOf(EnrollmentAgreementError);
    await expect(assertNoAgreementOperationForAccountChange(MEMBER, db)).rejects.toMatchObject({ status: 503 });
  });

  it('allows an account change when both tables exist and no fence is held', async () => {
    const db = client({ schema: READY, lock: { present: false } });
    await expect(assertNoAgreementOperationForAccountChange(MEMBER, db)).resolves.toBeUndefined();
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('refuses a change while a document or erase fence is held', async () => {
    const db = client({ schema: READY, lock: { present: true } });
    await expect(assertNoAgreementOperationForAccountChange(MEMBER, db)).rejects.toMatchObject({
      status: 409,
      code: 'ACCOUNT_DOCUMENT_OPERATION_PENDING',
    });
  });

  it('refuses when the org-scoped user lock does not see the member', async () => {
    const db = client({ schema: READY, member: [], lock: { present: false } });
    await expect(assertNoAgreementOperationForAccountChange(MEMBER, db, ORG)).rejects.toMatchObject({
      status: 409,
      code: 'ACCOUNT_CHANGED',
    });
    expect(db.$queryRaw.mock.calls.some(([sql]) => sql.join('?').includes('FOR UPDATE'))).toBe(true);
  });

  it('rejects an ambiguous lock-presence row', async () => {
    const db = client({ schema: READY, lock: null });
    await expect(assertNoAgreementOperationForAccountChange(MEMBER, db)).rejects.toMatchObject({
      status: 503,
      code: 'ACCOUNT_LIFECYCLE_UNAVAILABLE',
    });
  });
});

describe('agreement restore fence ownership', () => {
  it('does not treat a missing migration as successful restore ownership', async () => {
    const db = client({ schema: { submissions: false, locks: false, isolation: 'read committed' } });
    await expect(assertAgreementAccountRestoreOwned(MEMBER, ORG, 'token', db)).rejects.toMatchObject({
      status: 503,
      code: 'ACCOUNT_LIFECYCLE_UNAVAILABLE',
    });
  });

  it('requires the exact restore token after the user lock', async () => {
    const db = client({ schema: READY, member: [{ id: MEMBER }], lock: { present: false } });
    await expect(assertAgreementAccountRestoreOwned(MEMBER, ORG, 'token', db)).rejects.toMatchObject({
      status: 409,
      code: 'ACCOUNT_RESTORE_RECONCILIATION_REQUIRED',
    });
  });

  it('confirms ownership only for the matching restore token', async () => {
    const db = client({ schema: READY, member: [{ id: MEMBER }], lock: { present: true } });
    await expect(assertAgreementAccountRestoreOwned(MEMBER, ORG, 'token', db)).resolves.toBeUndefined();
  });

  it('refuses to release a restore fence unless exactly one matching row is deleted', async () => {
    const missed = client({ execute: 0 });
    await expect(releaseAgreementAccountRestore(MEMBER, ORG, 'token', missed)).rejects.toMatchObject({
      status: 503,
      code: 'ACCOUNT_RESTORE_RECONCILIATION_REQUIRED',
    });
    const released = client({ execute: 1 });
    await expect(releaseAgreementAccountRestore(MEMBER, ORG, 'token', released)).resolves.toBeUndefined();
  });
});
