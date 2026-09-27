import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: {
    id: 'member-1',
    organizationId: 'org-1',
    deletedAt: null as Date | null,
    billingDeletionPendingAt: null as Date | null,
    billingDeletionOperationId: null as string | null,
    billingDeletionCompletedAt: null as Date | null,
  },
}));

vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: () => true }));
vi.mock('@/lib/tenant/scopeProxy', () => ({ makeScopedProxy: (_org: unknown, tx: unknown) => tx }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: <T>(fn: () => T) => fn() }));
vi.mock('@/lib/db/prisma', () => {
  const matches = (where: Record<string, unknown>) => Object.entries(where).every(([key, expected]) =>
    (h.user as Record<string, unknown>)[key] === expected);
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    $queryRaw: vi.fn(async () => []),
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

import { beginBillingDeletion } from '@/lib/billing/erasureGuard';
import {
  beginMemberUpload,
  MemberUploadCleanupError,
  MemberUploadLifecycleError,
  MemberUploadPersistenceOutcomeError,
  MemberUploadStorageOutcomeError,
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
});

describe('durable member upload claim', () => {
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
    expect(h.user.billingDeletionOperationId).toBeTruthy();
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });

    finishUpload();
    await expect(run).rejects.toBeInstanceOf(MemberUploadCleanupError);
    expect(removeObjects).toHaveBeenCalledTimes(3);
    expect(removeObjects).toHaveBeenCalledWith(['profile-photos/member-1/new.webp']);
    expect(h.user.billingDeletionOperationId).toBeTruthy();
    expect(await beginBillingDeletion(h.user.id)).toEqual({ ok: false, reason: 'in_progress' });
  });

  it('keeps a crash-held claim and refuses a different token release', async () => {
    const token = await beginMemberUpload(h.user.id);
    await expect(releaseMemberUpload(h.user.id, '00000000-0000-4000-8000-000000000000'))
      .rejects.toThrow('could not be released');
    expect(h.user.billingDeletionOperationId).toBe(token);
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
    expect(h.user.billingDeletionOperationId).toBeTruthy();
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
    expect(h.user.billingDeletionOperationId).toBeTruthy();
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
    expect(h.user.billingDeletionOperationId).toBeTruthy();
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
    expect(h.user.billingDeletionOperationId).toBeNull();
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
