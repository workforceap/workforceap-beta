import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { lockBillingMemberLifecycle, scopedBillingUser } from '@/lib/billing/erasureGuard';
import { prisma } from '@/lib/db/prisma';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { AtomicResumeObjectSwapError, removeResumeObjectsWithRetry } from '@/lib/resume/atomicResumeObjectSwap';

export class MemberUploadLifecycleError extends Error {
  constructor() {
    super('This account is not accepting another upload right now.');
    this.name = 'MemberUploadLifecycleError';
  }
}

export class MemberUploadCleanupError extends Error {
  readonly causeValue: unknown;

  constructor(causeValue: unknown) {
    super('The rejected upload could not be removed from Storage; account deletion remains held for reconciliation.');
    this.name = 'MemberUploadCleanupError';
    this.causeValue = causeValue;
  }
}

export class MemberUploadStorageOutcomeError extends Error {
  readonly causeValue: unknown;

  constructor(causeValue: unknown) {
    super('The Storage upload outcome is uncertain; account deletion remains held for reconciliation.');
    this.name = 'MemberUploadStorageOutcomeError';
    this.causeValue = causeValue;
  }
}

/** Do not remove a staged object when its referencing DB commit may have won. */
export class MemberUploadPersistenceOutcomeError extends Error {
  readonly causeValue: unknown;

  constructor(causeValue: unknown) {
    super('The uploaded object may be referenced by a committed record; account deletion remains held for reconciliation.');
    this.name = 'MemberUploadPersistenceOutcomeError';
    this.causeValue = causeValue;
  }
}

/**
 * Claim the existing per-member operation token before any Storage request.
 * Deletion already refuses an owned token, even after a worker crash. There
 * is deliberately no time-based lease expiry: a slow Storage request may
 * finish after an arbitrary timeout, so age cannot prove it is safe to erase.
 */
export async function beginMemberUpload(userId: string): Promise<string> {
  const operationId = randomUUID();
  const claimed = await prisma.$transaction(async (tx) => {
    if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, userId);
    const scoped = await scopedBillingUser(tx, userId);
    if (!scoped) return { count: 0 };
    return scoped.user.updateMany({
      where: {
        id: userId,
        deletedAt: null,
        billingDeletionPendingAt: null,
        billingDeletionOperationId: null,
      },
      data: { billingDeletionOperationId: operationId },
    });
  });
  if (claimed.count !== 1) throw new MemberUploadLifecycleError();
  return operationId;
}

/** The final pointer write must still own its claim under deletion's lock. */
export async function assertMemberUploadWritable(
  tx: Prisma.TransactionClient,
  memberId: string,
  operationId: string,
): Promise<void> {
  if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, memberId);
  const scoped = await scopedBillingUser(tx, memberId);
  if (!scoped) throw new MemberUploadLifecycleError();
  const owned = await scoped.user.findFirst({
    where: {
      id: memberId,
      deletedAt: null,
      billingDeletionPendingAt: null,
      billingDeletionOperationId: operationId,
    },
    select: { id: true },
  });
  if (!owned) throw new MemberUploadLifecycleError();
}

/** Release only the token this upload acquired; a crashed worker leaves it held. */
export async function releaseMemberUpload(userId: string, operationId: string): Promise<void> {
  const released = await prisma.$transaction(async (tx) => {
    if (interactiveTransactionsGuaranteed()) await lockBillingMemberLifecycle(tx, userId);
    const scoped = await scopedBillingUser(tx, userId);
    if (!scoped) return { count: 0 };
    return scoped.user.updateMany({
      where: {
        id: userId,
        deletedAt: null,
        billingDeletionPendingAt: null,
        billingDeletionOperationId: operationId,
      },
      data: { billingDeletionOperationId: null },
    });
  });
  if (released.count !== 1) throw new Error('Member upload claim could not be released');
}

/**
 * A failed Storage request can have an unknown outcome. Record its unique key
 * before starting it, and release the durable claim only after removal of all
 * attempted keys is confirmed. A cleanup failure leaves the claim held so an
 * erase cannot finish after its final Storage scan while an upload is in flight.
 */
export async function withMemberUploadClaim<T>(options: {
  userId: string;
  run(operationId: string, recordAttempt: (path: string) => void): Promise<T>;
  removeObjects(paths: string[]): Promise<{ error: unknown | null }>;
  onCleanupError?: (error: unknown, paths: readonly string[]) => void;
}): Promise<T> {
  const operationId = await beginMemberUpload(options.userId);
  const attemptedPaths: string[] = [];
  let pointerCommitted = false;
  try {
    const result = await options.run(operationId, (path) => attemptedPaths.push(path));
    pointerCommitted = true;
    await releaseMemberUpload(options.userId, operationId);
    return result;
  } catch (error) {
    // The callback returns immediately after its pointer transaction. An
    // uncertain release after that point must not delete a committed object.
    if (pointerCommitted) throw error;
    // A caller may be unable to verify whether its DB commit succeeded. In
    // that case neither removing the object nor releasing the claim is safe.
    if (error instanceof MemberUploadPersistenceOutcomeError) throw error;
    const cleaned = await removeResumeObjectsWithRetry({
      paths: attemptedPaths,
      removeObjects: options.removeObjects,
      onCleanupError: options.onCleanupError,
    });
    if (!cleaned) throw new MemberUploadCleanupError(error);
    // A timed-out or failed Storage request may finish remotely after its
    // caller sees an error. Even a successful remove at this instant cannot
    // prove that an in-flight upload will not recreate the object later.
    // Keep the token held until an operator confirms that request ended and
    // reconciles this member's Storage prefix.
    const uncertainStorageOutcome = error instanceof MemberUploadStorageOutcomeError
      || (error instanceof AtomicResumeObjectSwapError && error.phase === 'upload');
    if (!uncertainStorageOutcome) await releaseMemberUpload(options.userId, operationId);
    throw error;
  }
}

/** Storage swap wraps pointer failures without changing their cause. */
export function isMemberUploadLifecycleError(error: unknown): boolean {
  if (error instanceof MemberUploadLifecycleError) return true;
  return error !== null && typeof error === 'object' && 'causeValue' in error
    && error.causeValue instanceof MemberUploadLifecycleError;
}
