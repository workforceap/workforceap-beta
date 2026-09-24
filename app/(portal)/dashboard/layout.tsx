import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/server';
import { getProfileRole, getUserRoles, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withDbRetry } from '@/lib/db/withDbRetry';
import MemberWorkspaceShell from '@/components/portal/MemberWorkspaceShell';
import { buildMemberShellIdentity } from '@/lib/member/memberIdentity';
import { getMemberProfilePhotoSignedUrlForPath } from '@/lib/portal/memberProfilePhotoUrl';
import { getPortalSwitcherRoles } from '@/lib/auth/portalRoleSwitcher';
import { getTranslations } from 'next-intl/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getTourOffer } from '@/lib/tours/getTourOffer';
import { getHomeTourForRole } from '@/lib/tours/registry';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return { title: t('memberDashboard') };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const [profileRole, superAdmin] = await Promise.all([
    withDbRetry(() => getProfileRole(user.id)),
    withDbRetry(() => isSuperAdmin(user.id)),
  ]);

  // Resolve portal access before reading member profile, resume, tour, or photo data.
  // A profile role can fall back to "member" for legacy users, but an employer or
  // other non-member portal association must not gain the member dashboard from it.
  const [portalRoles, userRoleNames] = await Promise.all([
    getPortalSwitcherRoles(user.id, { superAdmin }),
    withDbRetry(() => getUserRoles(user.id)),
  ]);
  const memberInSwitcher = portalRoles.some(({ role }) => role === 'member');
  const memberAccess = superAdmin ||
    (memberInSwitcher && (profileRole === 'member' || userRoleNames.includes('member')));
  if (!memberAccess) {
    const adminHome = profileRole === 'admin'
      ? portalRoles.find(({ role }) => role === 'admin')?.homeHref
      : undefined;
    redirect(adminHome ?? portalRoles.find(({ role }) => role !== 'member')?.homeHref ?? '/');
  }

  let memberLayoutLoadFailed = false;
  // Guided tour gate (flag `guided_tours_v2` + this user's tour state). Never throws.
  const memberTour = getHomeTourForRole('member');
  const tourPromise = memberTour ? getTourOffer(user.id, memberTour.key) : Promise.resolve(null);

  let dbUser: {
    deletedAt: Date | null;
    fullName: string | null;
    email: string | null;
    profile: {
      resumeOriginalPath: string | null;
      resumeEnhancedPath: string | null;
      profilePhotoPath: string | null;
    } | null;
  } | null = null;
  try {
    dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        deletedAt: true,
        fullName: true,
        email: true,
        profile: {
          select: {
            resumeOriginalPath: true,
            resumeEnhancedPath: true,
            profilePhotoPath: true,
          },
        },
      },
    });
  } catch (e) {
    memberLayoutLoadFailed = true;
    console.error('[dashboard layout] profile/resume query failed', e);
    /* Assume resume on file so we do not flash a misleading upload banner when DB is flaky */
    dbUser = { deletedAt: null, fullName: null, email: null, profile: null };
  }

  if (dbUser?.deletedAt) {
    redirect('/login?deleted=1');
  }

  const hasResume = !!(
    dbUser?.profile?.resumeOriginalPath || dbUser?.profile?.resumeEnhancedPath
  );

  // Shell identity (WAP-101): the saved name/email plus the member's own
  // profile photo when one is on file. Signing the photo URL is a storage
  // call, so it is skipped for the read-only audit and degrades to initials.
  const avatarUrl = readOnlyAudit
    ? null
    : await getMemberProfilePhotoSignedUrlForPath(dbUser?.profile?.profilePhotoPath);
  const identity = buildMemberShellIdentity({
    fullName: dbUser?.fullName,
    email: dbUser?.email ?? user.email,
    avatarUrl,
  });

  const tour = await tourPromise;

  return (
    <MemberWorkspaceShell
      identity={identity}
      hasResume={hasResume}
      superAdmin={superAdmin}
      portalRoles={portalRoles}
      readOnlyAudit={readOnlyAudit}
      tour={tour}
    >
      {memberLayoutLoadFailed ? <span hidden data-portal-error-state="member-layout-load" /> : null}
      {children}
    </MemberWorkspaceShell>
  );
}
