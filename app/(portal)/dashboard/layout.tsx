import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/server';
import { getProfileRole, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withDbRetry } from '@/lib/db/withDbRetry';
import MemberWorkspaceShell from '@/components/portal/MemberWorkspaceShell';
import { buildMemberShellIdentity } from '@/lib/member/memberIdentity';
import { getMemberProfilePhotoSignedUrlForPath } from '@/lib/portal/memberProfilePhotoUrl';
import { getPortalSwitcherRoles } from '@/lib/auth/portalRoleSwitcher';
import { getTranslations } from 'next-intl/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

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
  let memberLayoutLoadFailed = false;

  const [profileRole, superAdmin] = await Promise.all([
    withDbRetry(() => getProfileRole(user.id)).catch((err) => {
      memberLayoutLoadFailed = true;
      console.error('[dashboard:layout] profileRole lookup failed; degrading to member', err);
      return 'member';
    }),
    withDbRetry(() => isSuperAdmin(user.id)).catch((err) => {
      memberLayoutLoadFailed = true;
      console.error('[dashboard:layout] isSuperAdmin lookup failed; treating as not super admin', err);
      return false;
    }),
  ]);
  if (profileRole === 'admin' && !superAdmin) {
    redirect('/admin');
  }

  const portalRolesPromise = getPortalSwitcherRoles(user.id, { superAdmin });

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

  const portalRoles = await portalRolesPromise;

  return (
    <MemberWorkspaceShell
      identity={identity}
      hasResume={hasResume}
      superAdmin={superAdmin}
      portalRoles={portalRoles}
      readOnlyAudit={readOnlyAudit}
    >
      {memberLayoutLoadFailed ? <span hidden data-portal-error-state="member-layout-load" /> : null}
      {children}
    </MemberWorkspaceShell>
  );
}
