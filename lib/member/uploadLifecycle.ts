import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { lockBillingMemberLifecycle, scopedBillingUser } from '@/lib/billing/erasureGuard';
import { prisma } from '@/lib/db/prisma';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';
import { AtomicResumeObjectSwapError, removeResumeObjectsWithRetry } from '@/lib/resume/atomicResumeObjectSwap';

export class MemberUploadLifecycleError extends Error {
  readonly reason: 'member_inactive' | 'transactions_unavailable';

  constructor(reason: 'member_inactive' | 'transactions_unavailable' = 'member_inactive') {
    super('This account is not accepting another upload right now.');
    this.name = 'MemberUploadLifecycleError';
    this.reason = reason;
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

/** A completed Storage response rejected the write; verified cleanup can release the claim. */
export class MemberUploadDefiniteStorageError extends Error {
  readonly causeValue: unknown;

  constructor(causeValue: unknown) {
    super('Storage rejected the upload.');
    this.name = 'MemberUploadDefiniteStorageError';
    this.causeValue = causeValue;
  }
}

/** Only a permanent HTTP rejection proves the attempted Storage write did not land. */
export function isDefiniteStorageRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: unknown; statusCode?: unknown; originalError?: { status?: unknown; statusCode?: unknown } };
  const raw = value.status ?? value.statusCode ?? value.originalError?.status ?? value.originalError?.statusCode;
  const status = typeof raw === 'number' || (typeof raw === 'string' && /^\d{3}$/.test(raw)) ? Number(raw) : NaN;
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 429;
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
 * Insert an independent durable operation before any external request.
 * Deletion refuses any unresolved row, even after a worker crash. There
 * is deliberately no time-based lease expiry: a slow Storage request may
 * finish after an arbitrary timeout, so age cannot prove it is safe to erase.
 */
export async function beginMemberUpload(userId: string, kind: 'storage' | 'notification' | 'email' = 'storage', providerIdempotencyKey?: string): Promise<string> {
  if (!interactiveTransactionsGuaranteed()) throw new MemberUploadLifecycleError('transactions_unavailable');
  if (kind === 'email' && !providerIdempotencyKey?.trim()) {
    throw new Error('Email external-effect claim requires the provider idempotency key');
  }
  if (kind !== 'email' && providerIdempotencyKey !== undefined) {
    throw new Error('Only email external-effect claims may carry a provider idempotency key');
  }
  const operationId = randomUUID();
  const claimed = await prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, userId);
    const scoped = await scopedBillingUser(tx, userId);
    if (!scoped) return false;
    const active = await scoped.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        billingDeletionPendingAt: null,
        billingDeletionOperationId: null,
      },
      select: { id: true },
    });
    if (!active) return false;
    await tx.memberExternalEffectClaim.create({
      data: { id: operationId, memberId: userId, kind, ...(kind === 'email' ? { providerIdempotencyKey } : {}) },
    });
    return true;
  });
  if (!claimed) throw new MemberUploadLifecycleError();
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
      billingDeletionOperationId: null,
    },
    select: { id: true },
  });
  if (!owned) throw new MemberUploadLifecycleError();
  const claim = await tx.memberExternalEffectClaim.findFirst({
    where: { id: operationId, memberId, kind: 'storage', status: 'in_flight' },
    select: { id: true },
  });
  if (!claim) throw new MemberUploadLifecycleError();
}

/** Release only the token this upload acquired; a crashed worker leaves it held. */
export async function releaseMemberUpload(userId: string, operationId: string): Promise<void> {
  if (!interactiveTransactionsGuaranteed()) throw new Error('Member external-effect release requires an interactive transaction');
  const released = await prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, userId);
    return tx.memberExternalEffectClaim.deleteMany({
      where: { id: operationId, memberId: userId, status: 'in_flight' },
    });
  });
  if (released.count !== 1) throw new Error('Member upload claim could not be released');
}

/** A late worker must never release an effect whose provider outcome is unknown. */
export async function markMemberExternalEffectUncertain(userId: string, operationId: string, reason: string): Promise<void> {
  if (!interactiveTransactionsGuaranteed()) throw new Error('Member external-effect reconciliation requires an interactive transaction');
  const marked = await prisma.$transaction(async (tx) => {
    await lockBillingMemberLifecycle(tx, userId);
    return tx.memberExternalEffectClaim.updateMany({
      where: { id: operationId, memberId: userId, status: 'in_flight' },
      data: { status: 'needs_reconciliation', reason },
    });
  });
  if (marked.count !== 1) throw new Error('Member external-effect reconciliation hold could not be confirmed');
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
    if (error instanceof MemberUploadPersistenceOutcomeError) {
      await markMemberExternalEffectUncertain(options.userId, operationId, 'persistence_outcome_unknown');
      throw error;
    }
    const cleaned = await removeResumeObjectsWithRetry({
      paths: attemptedPaths,
      removeObjects: options.removeObjects,
      onCleanupError: options.onCleanupError,
    });
    if (!cleaned) {
      await markMemberExternalEffectUncertain(options.userId, operationId, 'storage_cleanup_failed');
      throw new MemberUploadCleanupError(error);
    }
    // A timed-out or failed Storage request may finish remotely after its
    // caller sees an error. Even a successful remove at this instant cannot
    // prove that an in-flight upload will not recreate the object later.
    // Keep the token held until an operator confirms that request ended and
    // reconciles this member's Storage prefix.
    const uncertainStorageOutcome = error instanceof MemberUploadStorageOutcomeError
      || (error instanceof AtomicResumeObjectSwapError && error.causeValue instanceof MemberUploadStorageOutcomeError);
    if (uncertainStorageOutcome) await markMemberExternalEffectUncertain(options.userId, operationId, 'storage_outcome_unknown');
    else await releaseMemberUpload(options.userId, operationId);
    throw error;
  }
}

/** Storage swap wraps pointer failures without changing their cause. */
export function isMemberUploadLifecycleError(error: unknown): boolean {
  if (error instanceof MemberUploadLifecycleError) return true;
  return error !== null && typeof error === 'object' && 'causeValue' in error
    && error.causeValue instanceof MemberUploadLifecycleError;
}
