import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { normalizePostLoginRedirect, resolveRoleAwarePostLoginRedirect } from '@/lib/auth/postLoginRedirect';
import { getUser } from '@/lib/auth/server';
import { getProfileRole } from '@/lib/auth/roles';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { getRequestLocale } from '@/lib/i18n/server';
import { withLocalePrefix } from '@/lib/i18n/config';
import LoginForm from './LoginForm';
import UtmCapture from '@/components/marketing/UtmCapture';
import { Suspense } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const base = await buildPageMetadataAsync({
    title: 'Sign In',
    description:
      'Sign in to your WorkforceAP account — member, partner, or employer portal. Same account; choose your destination before you log in.',
    path: '/login',
  });
  return { ...base, robots: { index: false, follow: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; deleted?: string; verified?: string }>;
}) {
  const [user, sp, locale] = await Promise.all([getUser(), searchParams, getRequestLocale()]);
  const rawRedirect = typeof sp?.redirectTo === 'string' ? sp.redirectTo : undefined;
  const normalizedRedirect = normalizePostLoginRedirect(rawRedirect, withLocalePrefix('/dashboard', locale));

  const accountDeleted = sp?.deleted === '1';
  const emailVerified = sp?.verified === '1';

  // Skip the signed-in auto-redirect when arriving from the deleted-account
  // guard: a soft-deleted member can still hold a live session, and
  // redirecting them forward just bounces back here in a loop. Show the
  // notice and let them re-authenticate or contact support instead.
  if (user && !accountDeleted) {
    // Wrapped in withDbRetry so a transient Supabase pooler blip on this read
    // doesn't crash the login page with an unhandled PrismaClientKnownRequestError
    // (2026-06-30 incident; mirrors the organizationId lookup in app/layout.tsx
    // and resolveAuthGucContext() in lib/auth/server.ts). Falls back to the
    // 'member' default used by getProfileRole itself so the redirect still
    // resolves instead of throwing.
    const profileRole = await withDbRetry(() => getProfileRole(user.id)).catch((err) => {
      console.error('[login] getProfileRole lookup failed; defaulting to member role', err);
      return 'member';
    });
    redirect(resolveRoleAwarePostLoginRedirect(normalizedRedirect, profileRole));
  }

  if (rawRedirect && rawRedirect !== normalizedRedirect) {
    redirect(`${withLocalePrefix('/login', locale)}?redirectTo=${encodeURIComponent(normalizedRedirect)}`);
  }

  return (
    <>
      <Suspense fallback={null}>
        <UtmCapture />
      </Suspense>
      <LoginForm
        initialRedirectTo={normalizedRedirect}
        accountDeleted={accountDeleted}
        emailVerified={emailVerified}
        sessionExpired={Boolean(rawRedirect) && !accountDeleted}
      />
    </>
  );
}
