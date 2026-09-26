import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { sanitizeRedirectPath } from '@/lib/auth/safeRedirectPath';
import { getRequestLocale } from '@/lib/i18n/server';
import { withLocalePrefix } from '@/lib/i18n/config';
import SignupForm from './SignupForm';
import UtmCapture from '@/components/marketing/UtmCapture';
import PartnerRefCapture from '@/components/marketing/PartnerRefCapture';
import { Suspense } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const base = await buildPageMetadataAsync({
    title: 'Member signup',
    description: 'Create your WorkforceAP member account to apply for programs and track your progress.',
    path: '/signup',
  });
  return { ...base, robots: { index: false, follow: false } };
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const [sp, locale] = await Promise.all([searchParams, getRequestLocale()]);
  const rawRedirect = typeof sp?.redirectTo === 'string' ? sp.redirectTo : undefined;
  const normalizedRedirect = sanitizeRedirectPath(rawRedirect, withLocalePrefix('/dashboard', locale));

  if (rawRedirect && rawRedirect !== normalizedRedirect) {
    redirect(`${withLocalePrefix('/signup', locale)}?redirectTo=${encodeURIComponent(normalizedRedirect)}`);
  }

  return (
    <>
      <Suspense fallback={null}>
        {/* `?ref=` may arrive straight on /signup (partner link, QR, email)
            without a prior /apply visit; SignupForm reads what this persists
            and posts it as `referralRef`. */}
        <PartnerRefCapture />
        <UtmCapture />
      </Suspense>
      <SignupForm initialRedirectTo={normalizedRedirect} />
    </>
  );
}
