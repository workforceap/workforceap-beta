/**
 * True only inside the guarded `npm run preview:local` environment
 * (scripts/local-preview.mjs sets LOCAL_PREVIEW=1 and the local-only guard
 * refuses any non-loopback backend). Never true on Vercel.
 *
 * The root layout uses it to skip third-party analytics, tag manager and
 * error-reporting scripts, so local verification makes zero external requests.
 * It never grants access or changes data behavior.
 */
export function isGuardedLocalPreview(env: Record<string, string | undefined> = process.env): boolean {
  if (env.LOCAL_PREVIEW !== '1') return false;
  if (env.VERCEL || env.VERCEL_ENV) return false;
  return true;
}
