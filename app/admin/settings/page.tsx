import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { resolveSupabasePublicAssetUrl } from '@/lib/storage/publicAssetUrl';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import PageHeader from '@/components/portal/PageHeader';
import AdminOrgSettingsForm from '@/components/admin/AdminOrgSettingsForm';
import OrgWideChangeNotice from '@/components/admin/OrgWideChangeNotice';
import { DesignSurface } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin – Settings',
  description: 'Organization settings',
  path: '/admin/settings',
});
}

export default async function AdminSettingsPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/settings');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const organizationId = await getActorOrganizationId(user.id);
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, overviewVideoUrl: true, logo: true, primaryColor: true },
  });

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageHeader title="Organization settings" subtitle="Platform-wide options for the default tenant." />
      {scope.superAdmin ? null : <OrgWideChangeNotice surface="settings" />}
      <AdminOrgSettingsForm
        defaultName={org?.name ?? 'WorkforceAP'}
        defaultOverviewVideoUrl={org?.overviewVideoUrl ?? ''}
        defaultLogoUrl={resolveSupabasePublicAssetUrl('organization-branding', org?.logo) ?? ''}
        defaultPrimaryColor={org?.primaryColor ?? ''}
      />
    </DesignSurface>
  );
}
