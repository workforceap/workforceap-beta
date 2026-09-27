import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';

const h = vi.hoisted(() => ({
  user: {
    id: 'member-1',
    organizationId: 'org-1',
    email: 'member@example.test',
    deletedAt: null as Date | null,
    billingDeletionPendingAt: null as Date | null,
    billingDeletionOperationId: null as string | null,
    billingDeletionCompletedAt: null as Date | null,
  },
  claims: [] as Array<{ id: string; memberId: string; kind: string; providerIdempotencyKey?: string; status: string; reason: string | null }>,
}));

vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: () => true }));
vi.mock('@/lib/tenant/scopeProxy', () => ({ makeScopedProxy: (_org: unknown, tx: unknown) => tx }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: <T>(fn: () => T) => fn() }));
vi.mock('@/lib/db/prisma', () => {
  const matches = (where: Record<string, unknown>) => Object.entries(where).every(([key, expected]) =>
    (h.user as Record<string, unknown>)[key] === expected);
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => String(parts[0]).includes('member_external_effect_claims')
      ? h.claims.map(({ id }) => ({ id })).slice(0, 1) : []),
    memberExternalEffectClaim: {
      create: vi.fn(async ({ data }: { data: { id: string; memberId: string; kind: string; providerIdempotencyKey?: string } }) => {
        h.claims.push({ ...data, status: 'in_flight', reason: null });
        return data;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        h.claims.find((claim) => Object.entries(where).every(([key, value]) => (claim as unknown as Record<string, unknown>)[key] === value)) ?? null),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const index = h.claims.findIndex((claim) => Object.entries(where).every(([key, value]) => (claim as unknown as Record<string, unknown>)[key] === value));
        if (index < 0) return { count: 0 };
        h.claims.splice(index, 1);
        return { count: 1 };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const claim = h.claims.find((row) => Object.entries(where).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value));
        if (!claim) return { count: 0 };
        Object.assign(claim, data);
        return { count: 1 };
      }),
    },
    user: {
      findFirst: vi.fn(async (args: { where: Record<string, unknown>; select: Record<string, boolean> }) => {
        if (!matches(args.where)) return null;
        return Object.fromEntries(Object.keys(args.select).map((key) => [key, (h.user as Record<string, unknown>)[key]]));
      }),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matches(args.where)) return { count: 0 };
        Object.assign(h.user, args.data);
        return { count: 1 };
      }),
    },
  };
  return { prisma: { $transaction: (fn: (client: unknown) => Promise<unknown>) => fn(tx) } };
});

import { beginBillingDeletion, beginBillingIdentityEdit, billingLifecyclePending } from '@/lib/billing/erasureGuard';
import {
  beginMemberUpload,
  MemberUploadCleanupError,
  MemberUploadDefiniteStorageError,
  MemberUploadLifecycleError,
  MemberUploadPersistenceOutcomeError,
  MemberUploadStorageOutcomeError,
  isDefiniteStorageRejection,
  releaseMemberUpload,
  withMemberUploadClaim,
} from '@/lib/member/uploadLifecycle';
import { replaceClaimedResumeObjects, ResumeProfileConflictError } from '@/lib/resume/resumeProfileStorage';
import { AtomicResumeObjectSwapError } from '@/lib/resume/atomicResumeObjectSwap';

beforeEach(() => {
  h.user.deletedAt = null;
  h.user.billingDeletionPendingAt = null;
  h.user.billingDeletionOperationId = null;
  h.user.billingDeletionCompletedAt = null;
  h.claims.length = 0;
});

describe('durable member upload claim', () => {
  it('persists an email provider key in the initial claim row before any provider I/O', async () => {
    await expect(beginMemberUpload(h.user.id, 'email')).rejects.toThrow('requires the provider idempotency key');
    expect(h.claims).toHaveLength(0);
    const key = 'email/synthetic-exact-key';
    const token = await beginMemberUpload(h.user.id, 'email', key);
    expect(h.claims).toEqual([expect.objectContaining({
      id: token, memberId: h.user.id, kind: 'email', status: 'in_flight', providerIdempotencyKey: key,
    })]);
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });
    await releaseMemberUpload(h.user.id, token);
  });

  it.each([
    [400, true], [409, true], [408, false], [429, false], [503, false], [undefined, false],
  ])('classifies Storage status %s as definite=%s', (statusCode, definite) => {
    expect(isDefiniteStorageRejection(statusCode === undefined ? { message: 'unknown' } : { statusCode: String(statusCode) }))
      .toBe(definite);
  });

  it('keeps a claim for a returned Storage 503 in the resume wrapper', async () => {
    const removeObjects = vi.fn(async () => ({ error: null }));
    await expect(replaceClaimedResumeObjects({
      userId: h.user.id,
      uploads: [{ field: 'resumeOriginalPath', extension: 'pdf', contentType: 'application/pdf', body: new Uint8Array([1]) }],
      uploadObject: async () => ({ error: { statusCode: '503' } }),
      removeObjects,
      swapProfilePaths: async () => { throw new Error('must not persist'); },
    })).rejects.toBeInstanceOf(AtomicResumeObjectSwapError);
    expect(h.claims[0]?.status).toBe('needs_reconciliation');
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });
  });

  it('releases a claim for a returned Storage 400 in the resume wrapper after cleanup', async () => {
    await expect(replaceClaimedResumeObjects({
      userId: h.user.id,
      uploads: [{ field: 'resumeOriginalPath', extension: 'pdf', contentType: 'application/pdf', body: new Uint8Array([1]) }],
      uploadObject: async () => ({ error: { statusCode: '400' } }),
      removeObjects: async () => ({ error: null }),
      swapProfilePaths: async () => { throw new Error('must not persist'); },
    })).rejects.toBeInstanceOf(AtomicResumeObjectSwapError);
    expect(h.claims).toHaveLength(0);
  });

  it('allows sibling notifications and ordinary active writes while deletion and identity edit wait', async () => {
    const first = await beginMemberUpload(h.user.id, 'notification');
    const second = await beginMemberUpload(h.user.id, 'notification');
    expect(first).not.toBe(second);
    expect(h.claims).toHaveLength(2);
    expect(await prisma.$transaction((tx) => billingLifecyclePending(tx, h.user.id))).toBe(false);
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });
    expect(await beginBillingIdentityEdit(h.user.id, h.user.organizationId, h.user.email))
      .toEqual({ ok: false, reason: 'in_progress' });
    await releaseMemberUpload(h.user.id, first);
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });
    await releaseMemberUpload(h.user.id, second);
    expect((await beginBillingDeletion(h.user.id)).ok).toBe(true);
  });

  it('releases a definite Storage rejection after verified cleanup', async () => {
    const removeObjects = vi.fn(async () => ({ error: null }));
    await expect(withMemberUploadClaim({
      userId: h.user.id,
      removeObjects,
      run: async (_operationId, recordAttempt) => {
        recordAttempt('member-1/resume-original-new.pdf');
        throw new MemberUploadDefiniteStorageError({ statusCode: 400 });
      },
    })).rejects.toBeInstanceOf(MemberUploadDefiniteStorageError);
    expect(removeObjects).toHaveBeenCalledWith(['member-1/resume-original-new.pdf']);
    expect(h.claims).toHaveLength(0);
    expect((await beginBillingDeletion(h.user.id)).ok).toBe(true);
  });

  it('blocks erase through a delayed Storage upload and a failed cleanup', async () => {
    let startUpload!: () => void;
    let finishUpload!: () => void;
    const started = new Promise<void>((resolve) => { startUpload = resolve; });
    const held = new Promise<void>((resolve) => { finishUpload = resolve; });
    const removeObjects = vi.fn(async () => ({ error: { message: 'Storage unavailable' } }));
    const run = withMemberUploadClaim({
      userId: h.user.id,
      removeObjects,
      run: async (_operationId, recordAttempt) => {
        recordAttempt('profile-photos/member-1/new.webp');
        startUpload();
        await held;
        throw new Error('pointer rejected');
      },
    });

    await started;
    expect(h.claims).toHaveLength(1);
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });

    finishUpload();
    await expect(run).rejects.toBeInstanceOf(MemberUploadCleanupError);
    expect(removeObjects).toHaveBeenCalledTimes(3);
    expect(removeObjects).toHaveBeenCalledWith(['profile-photos/member-1/new.webp']);
    expect(h.claims[0]?.status).toBe('needs_reconciliation');
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });
  });

  it('keeps a crash-held claim and refuses a different token release', async () => {
    const token = await beginMemberUpload(h.user.id);
    await expect(releaseMemberUpload(h.user.id, '00000000-0000-4000-8000-000000000000'))
      .rejects.toThrow('could not be released');
    expect(h.claims[0]?.id).toBe(token);
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });

    await releaseMemberUpload(h.user.id, token);
    expect((await beginBillingDeletion(h.user.id)).ok).toBe(true);
  });

  it('holds the claim after an uncertain Storage response even if immediate removal succeeds', async () => {
    const removeObjects = vi.fn(async () => ({ error: null }));
    await expect(withMemberUploadClaim({
      userId: h.user.id,
      removeObjects,
      run: async (_operationId, recordAttempt) => {
        recordAttempt('member-1/resume-original-new.pdf');
        throw new MemberUploadStorageOutcomeError(new Error('timeout'));
      },
    })).rejects.toBeInstanceOf(MemberUploadStorageOutcomeError);

    expect(removeObjects).toHaveBeenCalledWith(['member-1/resume-original-new.pdf']);
    expect(h.claims[0]?.status).toBe('needs_reconciliation');
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });
  });

  it('does not remove an object when the referencing DB commit is unknown', async () => {
    const removeObjects = vi.fn(async () => ({ error: null }));
    await expect(withMemberUploadClaim({
      userId: h.user.id,
      removeObjects,
      run: async (_operationId, recordAttempt) => {
        recordAttempt('member-1/application-1-resume.pdf');
        throw new MemberUploadPersistenceOutcomeError(new Error('ack lost'));
      },
    })).rejects.toBeInstanceOf(MemberUploadPersistenceOutcomeError);

    expect(removeObjects).not.toHaveBeenCalled();
    expect(h.claims[0]?.status).toBe('needs_reconciliation');
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });
  });

  it('retains a staged resume when its pointer transaction outcome is unknown', async () => {
    const removeObjects = vi.fn(async () => ({ error: null }));
    await expect(replaceClaimedResumeObjects({
      userId: h.user.id,
      uploads: [{ field: 'resumeOriginalPath', extension: 'pdf', contentType: 'application/pdf', body: new Uint8Array([1]) }],
      makeVersionId: () => 'new',
      uploadObject: async () => ({ error: null }),
      removeObjects,
      swapProfilePaths: async () => { throw new Error('commit acknowledgment lost'); },
    })).rejects.toBeInstanceOf(MemberUploadPersistenceOutcomeError);

    expect(removeObjects).not.toHaveBeenCalled();
    expect(h.claims[0]?.status).toBe('needs_reconciliation');
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });
  });

  it('removes a staged resume and releases the claim on a known CAS conflict', async () => {
    const removeObjects = vi.fn(async () => ({ error: null }));
    await expect(replaceClaimedResumeObjects({
      userId: h.user.id,
      uploads: [{ field: 'resumeOriginalPath', extension: 'pdf', contentType: 'application/pdf', body: new Uint8Array([1]) }],
      makeVersionId: () => 'new',
      uploadObject: async () => ({ error: null }),
      removeObjects,
      swapProfilePaths: async () => { throw new ResumeProfileConflictError(); },
    })).rejects.toBeInstanceOf(AtomicResumeObjectSwapError);

    expect(removeObjects).toHaveBeenCalledWith(['member-1/resume-original-new.pdf']);
    expect(h.claims).toHaveLength(0);
  });

  it('denies an upload before staging when deletion already owns the barrier', async () => {
    expect((await beginBillingDeletion(h.user.id)).ok).toBe(true);
    const upload = vi.fn(async () => 'unreachable');
    await expect(withMemberUploadClaim({
      userId: h.user.id,
      run: upload,
      removeObjects: async () => ({ error: null }),
    })).rejects.toBeInstanceOf(MemberUploadLifecycleError);
    expect(upload).not.toHaveBeenCalled();
  });
});
