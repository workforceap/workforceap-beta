/**
 * Detect Supabase SSR session cookies without constructing a GoTrue client.
 *
 * `@supabase/ssr` stores the session as `sb-<project-ref>-auth-token` and
 * splits large values into `…-auth-token.0`, `.1`, … . The PKCE verifier
 * (`…-auth-token-code-verifier`) is not a session and must not count.
 *
 * Used by Edge middleware and Node `getUser` / `getSession` so anonymous
 * HTML (no auth cookies) never talks to Supabase Auth.
 */

export type CookieNameValue = { name: string; value?: string };

export type CookieListLike =
  | { getAll(): CookieNameValue[] }
  | Iterable<CookieNameValue>;

/** Supabase SSR access-token cookie (including chunked `.N` suffixes). */
export function isSupabaseAuthTokenCookieName(name: string): boolean {
  return /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(name);
}

/** PKCE belongs to an in-progress sign-in flow, not session validation. */
export function isSupabasePkceCookieName(name: string): boolean {
  return /^sb-[a-z0-9]+-auth-token-code-verifier(?:\.\d+)?$/i.test(name);
}

function listCookies(cookies: CookieListLike): CookieNameValue[] {
  if (typeof (cookies as { getAll?: unknown }).getAll === 'function') {
    return (cookies as { getAll(): CookieNameValue[] }).getAll();
  }
  return Array.from(cookies as Iterable<CookieNameValue>);
}

/** True when the request carries a non-empty Supabase session cookie. */
export function hasSupabaseAuthCookies(cookies: CookieListLike): boolean {
  return listCookies(cookies).some(
    (cookie) => isSupabaseAuthTokenCookieName(cookie.name) && Boolean(cookie.value?.trim()),
  );
}

/**
 * Middleware should construct a GoTrue client only when a path needs a
 * verified user (portal / admin / tenant API) or a session cookie is
 * present (refresh + optional `x-wap-user-id` forward on public HTML).
 */
export function shouldTalkToGoTrue(opts: {
  needsValidatedUser: boolean;
  hasAuthCookie: boolean;
}): boolean {
  return opts.needsValidatedUser || opts.hasAuthCookie;
}
