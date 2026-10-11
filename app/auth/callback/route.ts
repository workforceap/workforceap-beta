import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseCookieOptions } from '@/lib/supabaseCookieOptions';
import { prisma } from '@/lib/db/prisma';
import { normalizePostLoginRedirect, resolveRoleAwarePostLoginRedirect } from '@/lib/auth/postLoginRedirect';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { emitEmailVerifiedFromCallback } from '@/lib/events/emailVerified';
import { trackEvent } from '@/lib/events/track';
import { logger } from '@/lib/observability/logger';
import { withDbRetry } from '@/lib/db/withDbRetry';

// Handles Supabase email confirmation and OAuth redirects.
// Supabase sends ?code=xxx (PKCE); we exchange it for a session then redirect.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const safeNext = normalizePostLoginRedirect(searchParams.get('next'), '/dashboard');

  if (code) {
    const cookieStore = await cookies();
    const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSupabaseEnv();
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookieOptions: getSupabaseCookieOptions(),
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, (options ?? {}) as Record<string, unknown>);
            });
          },
        },
      }
    );

    let exchangeFailed = true;
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      exchangeFailed = Boolean(error);
    } catch (err) {
      logger.warn('auth/callback: confirmation exchange failed', { err });
    }
    if (!exchangeFailed) {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      // Resilient + non-fatal: a transient pooler blip here must not 500 the
      // email-verification landing. On persistent failure we fall back to a
      // null role (→ default /dashboard redirect) rather than erroring.
      const profile = userId
        ? await withDbRetry(() =>
            prisma.profile.findUnique({
              where: { userId },
              select: { role: true },
            }),
          ).catch((err) => {
            logger.warn('auth/callback: profile lookup failed; using default redirect', {
              userId,
              err,
            });
            return null;
          })
        : null;
      const destination = resolveRoleAwarePostLoginRedirect(safeNext, profile?.role);

      if (userId) {
        void emitEmailVerifiedFromCallback(userId, userData.user?.email ?? null);
        trackEvent({
          userId,
          eventName: 'member_logged_in',
          metadata: { destination },
          sourcePage: '/auth/callback',
        }).catch(() => {});

      await prisma.$transaction((tx) =>
        tx.user.update({
          where: { id: userId },
          data: { lastLoginAt: new Date() },
        }),
      ).catch((err) => {
        logger.warn('Failed to update lastLoginAt', { userId, err });
      });
      }

      try {
        const redirectUrl = new URL(destination, origin);
        if (redirectUrl.pathname === '/dashboard') redirectUrl.searchParams.set('verified', '1');
        return NextResponse.redirect(redirectUrl);
      } catch {
        return NextResponse.redirect(`${origin}/dashboard?verified=1`);
      }
    }
  }

  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', 'confirmation_failed');
  loginUrl.searchParams.set('redirectTo', safeNext);
  return NextResponse.redirect(loginUrl);
}
