/**
 * Resolve a secondary read within `ms` or reject with a timeout error so the
 * page can fail soft (empty result + notice). The underlying query is not
 * cancelled — Prisma has no cancellation — but the page stops waiting for it.
 */
export class SoftTimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms}ms`);
    this.name = 'SoftTimeoutError';
  }
}

export function withSoftTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SoftTimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}
