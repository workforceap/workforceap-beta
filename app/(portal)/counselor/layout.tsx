import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { getPortalSwitcherRoles } from '@/lib/auth/portalRoleSwitcher';
import { deniedPortalHomeHref } from '@/lib/auth/portalGuards';
import { prisma } from '@/lib/db/prisma';
import CounselorPortalShell from '@/components/portal/CounselorPortalShell';
import { counselorAffiliationDisplay } from '@/lib/counselor/counselorLabels';
import { buildPageMetadataAsync } from '@/app/seo';
import { getTranslations } from 'next-intl/server';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getTourOffer } from '@/lib/tours/getTourOffer';
import { getHomeTourForRole } from '@/lib/tours/registry';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('counselor');
  const base = await buildPageMetadataAsync({
    title: t('counselorPortal'),
    description: t('supportYourMembers'),
    path: '/counselor',
  });
  /** PWA install from counselor pages captures this manifest so start_url opens the counselor portal (not `/dashboard`). */
  return { ...base, manifest: '/manifest-counselor.json' };
}

export default async function CounselorLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor');
  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());

  const [allowedCounselor, allowedAdmin, superAdmin] = await Promise.all([
    isCounselor(user.id),
    isAdmin(user.id),
    isSuperAdmin(user.id),
  ]);
  if (!allowedCounselor && !allowedAdmin) redirect(await deniedPortalHomeHref(user.id, 'counselor'));
  const counselorTour = getHomeTourForRole('counselor');
  const [portalRoles, tour] = await Promise.all([
    getPortalSwitcherRoles(user.id, {
      superAdmin,
      hasCounselor: allowedCounselor,
      hasAdmin: allowedAdmin,
    }),
    // Guided tour gate (flag `guided_tours_v2` + this user's tour state). Never throws.
    counselorTour ? getTourOffer(user.id, counselorTour.key) : Promise.resolve(null),
  ]);

  let subtitle = 'Counselor';
  let affiliationLoadFailed = false;
  try {
    const counselor = await prisma.counselor.findFirst({
      where: { userId: user.id, active: true },
      include: { partner: { select: { name: true } } },
    });
    subtitle = counselor
      ? counselorAffiliationDisplay(counselor.affiliation, counselor.partner?.name)
      : allowedAdmin
        ? 'Super admin preview'
        : 'Counselor';
  } catch (e) {
    affiliationLoadFailed = true;
    console.error('[counselor/layout] affiliation query failed', e);
  }

  return (
    <CounselorPortalShell
      subtitle={subtitle}
      superAdmin={superAdmin}
      portalRoles={portalRoles}
      readOnlyAudit={readOnlyAudit}
      tour={tour}
    >
      {affiliationLoadFailed ? <span hidden data-portal-error-state="counselor-affiliation-load" /> : null}
      {children}
    </CounselorPortalShell>
  );
}
