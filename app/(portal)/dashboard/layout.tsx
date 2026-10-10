import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  isAllowedWhilePreassessmentRequired,
  preassessmentGateFor,
  type PreassessmentGate,
} from '@/lib/member/preassessmentGate';
import PreassessmentLoginPrompt from '@/components/portal/PreassessmentLoginPrompt';
import { getUser } from '@/lib/auth/server';
import { getMemberDashboardAccess } from '@/lib/auth/memberDashboardAccess';
import { prisma } from '@/lib/db/prisma';
import MemberWorkspaceShell from '@/components/portal/MemberWorkspaceShell';
import { buildMemberShellIdentity } from '@/lib/member/memberIdentity';
import { getMemberProfilePhotoSignedUrlForPath } from '@/lib/portal/memberProfilePhotoUrl';
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

  const access = await getMemberDashboardAccess(user.id);
  if (access.redirectTo) redirect(access.redirectTo);
  const { portalRoles, superAdmin } = access;
  let memberLayoutLoadFailed = false;
  // Guided tour gate (flag `guided_tours_v2` + this user's tour state). Never throws.
  const memberTour = getHomeTourForRole('member');
  const tourPromise = memberTour ? getTourOffer(user.id, memberTour.key) : Promise.resolve(null);

  let dbUser: {
    deletedAt: Date | null;
    assessmentCompleted?: boolean;
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
        assessmentCompleted: true,
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

  // Ops (10/8/26): prompt for the WIOA preassessment on logins 1-5, require it
  // from login 6. Super admins previewing the member portal are never gated,
  // and any lookup failure leaves the member ungated (fail open).
  const currentPath = (await headers()).get('x-pathname') ?? '/dashboard';
  let preassessmentGate: PreassessmentGate = 'none';
  let loginCount = 0;
  if (!superAdmin && !readOnlyAudit && !memberLayoutLoadFailed && dbUser) {
    try {
      // Own MemberEvent rows only (userId = the signed-in member).
      loginCount = await prisma.memberEvent.count({ where: { userId: user.id, eventName: 'member_logged_in' } });
      preassessmentGate = preassessmentGateFor({
        assessmentCompleted: Boolean(dbUser.assessmentCompleted),
        loginCount,
        isStaffOrNonMember: false,
      });
    } catch {
      preassessmentGate = 'none';
    }
  }
  if (preassessmentGate === 'require' && !isAllowedWhilePreassessmentRequired(currentPath)) {
    redirect('/dashboard/assessment?required=1');
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
      {preassessmentGate === 'prompt' && !isAllowedWhilePreassessmentRequired(currentPath) ? (
        <PreassessmentLoginPrompt loginCount={loginCount} />
      ) : null}
      {children}
    </MemberWorkspaceShell>
  );
}
