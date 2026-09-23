import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/server';
import { getCounselorForUser, isAdmin, isEmployer } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

export const metadata: Metadata = {
  title: 'Workforce Advancement Project',
  robots: { index: false, follow: false },
};

/**
 * PWA `start_url` target: sends signed-in users to the right portal so the generic
 * web app manifest (`/manifest.json`) is safe for counselors/staff despite a single manifest link tag.
 *
 * Admin wins over counselor, the same precedence sign-in uses
 * (lib/auth/postLoginRedirect.ts), so an admin who also holds a counselor
 * row opens the app on the admin Today, not the counselor caseload (WAP-190).
 * Employer and partner order is unchanged.
 */
export default async function PwaStartPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/pwa-start');

  const [counselor, admin, employer, partnerRow] = await Promise.all([
    getCounselorForUser(user.id),
    isAdmin(user.id),
    isEmployer(user.id),
    prisma.partnerUser.findUnique({ where: { userId: user.id }, select: { userId: true } }),
  ]);

  if (admin) redirect('/admin');
  if (counselor) redirect('/counselor');
  if (employer) redirect('/employer');
  if (partnerRow) redirect('/partner');
  redirect('/dashboard');
}
