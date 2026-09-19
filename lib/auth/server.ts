import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { getSupabaseCookieOptions, SESSION_ONLY_COOKIE } from '@/lib/supabaseCookieOptions';
import { readAuthWithRetry, reportAuthReadFailure } from './authRead';
import { hasSupabaseAuthCookies, isSupabaseAuthTokenCookieName, isSupabasePkceCookieName } from '@/lib/auth/supabaseAuthCookie';
import { runWithGucContext, buildGucContext, ANONYMOUS_GUC_CONTEXT } from '@/lib/db/gucContext';
import type { GucContext } from '@/lib/db/gucContext';
import { getProfileRole } from './roles';
import { prisma } from '@/lib/db/prisma';
import { withDbRetry } from '@/lib/db/withDbRetry';

export function hasSupabaseServerEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

/** A surviving Auth session must not revive an application soft-delete. */
async function isApplicationAccountAvailable(userId: string): Promise<boolean> {
  // A newly confirmed Auth identity may not have its application row yet.
  // Only a recorded deletion denies it; a failed lookup must not grant access.
  const context = buildGucContext({ userId, orgId: null });
  const account = await runWithGucContext(context, () =>
    withDbRetry(() => prisma.$transaction((tx) =>
      tx.user.findUnique({ where: { id: userId }, select: { deletedAt: true } }),
    )),
  );
  return !account?.deletedAt;
}

/**
 * Creates a Supabase client for Server Components, Server Actions, and Route Handlers.
 * Uses cookies for session management. Requires middleware for session refresh.
 */
export async function createSupabaseServerClient(options: { preservePkce?: boolean } = {}) {
  const preservePkce = options.preservePkce === true;
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabaseServerEnv() || !url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
  }

  // Preserve "session only" preference across server-side token refreshes
  const sessionOnly = cookieStore.get(SESSION_ONLY_COOKIE)?.value === '1';

  return createServerClient(
    url,
    anonKey,
    {
      cookieOptions: getSupabaseCookieOptions(sessionOnly),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // auth-js removes PKCE as part of _removeSession; auth reads must
              // leave a separate in-progress sign-in flow intact.
              if (preservePkce && isSupabasePkceCookieName(name)) return;
              if (sessionOnly) {
                // Strip maxAge/expires to keep the session ephemeral
                const { maxAge: _1, expires: _2, ...rest } = (options ?? {}) as Record<string, unknown>;
                const opts = rest as { path?: string; secure?: boolean; sameSite?: 'lax' | 'strict' | 'none'; httpOnly?: boolean } | undefined;
                cookieStore.set(name, value, opts ?? {});
              } else {
                const opts = options as { path?: string; maxAge?: number; secure?: boolean; sameSite?: 'lax' | 'strict' | 'none'; httpOnly?: boolean } | undefined;
                cookieStore.set(name, value, opts ?? {});
              }
            });
          } catch (err) {
            console.error('Supabase setAll cookies error:', err);
          }
        },
      },
    }
  );
}

async function handleServerAuthFailure(error: unknown, context: string): Promise<void> {
  if (reportAuthReadFailure(error, context) !== 'stale_session') return;
  // Server Components may have a read-only cookie store; middleware performs
  // the authoritative browser clear. Route handlers/actions can clear here too.
  try {
    const cookieStore = await cookies();
    for (const { name } of cookieStore.getAll()) {
      if (isSupabaseAuthTokenCookieName(name)) {
        cookieStore.set(name, '', { ...getSupabaseCookieOptions(), maxAge: 0 });
      }
    }
  } catch { /* Cookie mutation is unavailable in a Server Component. */ }
}

/**
 * Gets the current session from the server. Returns null if not authenticated
 * or if the request has no Supabase session cookie (no GoTrue client).
 */
export async function getSession() {
  if (!hasSupabaseServerEnv()) return null;
  try {
    const cookieStore = await cookies();
    if (!hasSupabaseAuthCookies(cookieStore)) return null;
    const supabase = await createSupabaseServerClient({ preservePkce: true });
    const {
      data: { session },
      error,
    } = await readAuthWithRetry(() => supabase.auth.getSession());
    if (error) {
      await handleServerAuthFailure(error, 'auth:getSession');
      return null;
    }
    if (session?.user && !(await isApplicationAccountAvailable(session.user.id))) return null;
    return session;
  } catch (err) {
    unstable_rethrow(err);
    await handleServerAuthFailure(err, 'auth:getSession');
    return null;
  }
}

/**
 * Gets the current user from the server. Returns null if not authenticated
 * or if the request has no Supabase session cookie (no GoTrue client).
 * Prefer getSession() when you need the full session; use this for user-only checks.
 * Request-level memoization avoids duplicate Supabase round-trips when layout + page both call getUser().
 * Root layout must not call this as an anonymous fallback — see `resolveLayoutUserId`.
 */
export const getUser = cache(async function getUser() {
  if (!hasSupabaseServerEnv()) return null;
  try {
    const cookieStore = await cookies();
    if (!hasSupabaseAuthCookies(cookieStore)) return null;
    const supabase = await createSupabaseServerClient({ preservePkce: true });
    const {
      data: { user },
      error,
    } = await readAuthWithRetry(() => supabase.auth.getUser());
    if (error) {
      await handleServerAuthFailure(error, 'auth:getUser');
      return null;
    }
    if (user && !(await isApplicationAccountAvailable(user.id))) return null;
    return user;
  } catch (err) {
    unstable_rethrow(err);
    await handleServerAuthFailure(err, 'auth:getUser');
    return null;
  }
});

/**
 * Resolve the GUC context for the current request.
 *
 * - Authenticated: reads the Supabase user, resolves the profile role from
 *   the database, and builds a GucContext with `userId` + `role`.
 * - Unauthenticated: returns `ANONYMOUS_GUC_CONTEXT`.
 *
 * Uses React `cache()` so multiple calls in the same request share one DB
 * round-trip for the profile role.
 */
export const resolveAuthGucContext = cache(async function resolveAuthGucContext(): Promise<GucContext> {
  const user = await getUser();
  if (!user) return ANONYMOUS_GUC_CONTEXT;
  // Bootstrap lookups run inside a partial GUC context carrying the verified
  // userId so the `users_select_own` RLS policy (`id = get_current_user_id()`)
  // permits the self-read once FORCE ROW LEVEL SECURITY is enabled. Without
  // it the lookup would be denied and `.catch(() => null)` would silently
  // degrade back to orgId null, defeating the fix (same seam as the root
  // layout, fixed in #1615).
  const bootstrapCtx = buildGucContext({ userId: user.id, orgId: null });
  const [profileRole, userRow] = await runWithGucContext(bootstrapCtx, () =>
    Promise.all([
      withDbRetry(() => getProfileRole(user.id)).catch((err) => {
        console.error('[auth:guc] profileRole bootstrap lookup failed; degrading to member', err);
        return 'member';
      }),
      // Resolve the user's organization so the GUC carries `app.current_org_id`.
      // Previously orgId was hardcoded to null, which makes every RLS policy
      // that calls `can_access_org_row(check_org_id)` evaluate with NULL —
      // every admin RLS path silently fails once FORCE ROW LEVEL SECURITY
      // is enabled (AUDIT §C-T6). Today it's masked because Prisma uses the
      // service-role connection that bypasses RLS; this lookup makes the
      // GUC ready for the forced-RLS flip.
      //
      // Must run inside an explicit $transaction: since #1631 the Prisma
      // middleware fail-closes (throws) on queries that run with an active
      // GUC context outside a $transaction, because session-level GUCs are
      // not visible to policies on pooled connections. Wrapped in withDbRetry
      // so a transient pooler blip on this read degrades gracefully via retry
      // rather than dropping straight to orgId null (2026-06-30 incident).
      withDbRetry(() =>
        prisma
          .$transaction((tx) =>
            tx.user.findUnique({ where: { id: user.id }, select: { organizationId: true } }),
          ),
      )
        .catch((err) => {
          console.error('[auth:guc] organizationId bootstrap lookup failed; GUC degrades to orgId null', err);
          return null;
        }),
    ]),
  );
  return buildGucContext({
    userId: user.id,
    orgId: userRow?.organizationId ?? null,
    profileRole,
  });
});

/**
 * Run `fn` with the GUC context derived from the current authenticated user.
 *
 * Use this in API routes, server actions, or server components where you
 * want every Prisma query inside `fn` to carry the correct RLS credentials.
 *
 * Example (API route):
 *   export const GET = withAuthGuc(async () => {
 *     const data = await prisma.member.findMany();
 *     return Response.json(data);
 *   });
 */
export function withAuthGuc<T>(fn: () => Promise<T>): Promise<T> {
  return resolveAuthGucContext().then((ctx) => runWithGucContext(ctx, fn));
}
