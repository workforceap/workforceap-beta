/**
 * Run `fn` over `items` with bounded concurrency: items are processed in
 * sequential chunks of `chunkSize`, and the items inside one chunk run in
 * parallel. Unlike a bare `Promise.all(items.map(fn))` this never has more than
 * `chunkSize` calls in flight (DB pool / provider rate limits), and unlike a
 * plain `for ... await` loop it does not serialise independent work.
 *
 * Every call in a chunk is allowed to settle before the next chunk starts. If
 * any call rejects, the first rejection is re-thrown after its chunk has fully
 * settled (so no work is left dangling in the background).
 */
export async function forEachInChunks<T>(
  items: readonly T[],
  chunkSize: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const size = Math.max(1, Math.floor(chunkSize));
  for (let start = 0; start < items.length; start += size) {
    const chunk = items.slice(start, start + size);
    const settled = await Promise.allSettled(chunk.map((item, offset) => fn(item, start + offset)));
    const failure = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (failure) throw failure.reason;
  }
}

/** Like `forEachInChunks` but returns results in input order. */
export async function mapInChunks<T, R>(
  items: readonly T[],
  chunkSize: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  await forEachInChunks(items, chunkSize, async (item, index) => {
    out[index] = await fn(item, index);
  });
  return out;
}
