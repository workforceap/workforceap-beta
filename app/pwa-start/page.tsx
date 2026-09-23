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

  if (counselor) redirect('/counselor');
  if (admin) redirect('/admin');
  if (employer) redirect('/employer');
  if (partnerRow) redirect('/partner');
  redirect('/dashboard');
}
