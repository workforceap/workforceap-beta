import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import BillingMockPreview from '@/components/billing/BillingMockPreview';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'J5 / J6 mock preview',
    description: 'Review synthetic, unsigned J5 and J6 sample documents without creating a billing case.',
    path: '/admin/billing/preview',
  });
}

export default async function AdminBillingPreviewPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/billing/preview');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  return (
    <PortalPageFrame
      title="J5 / J6 mock preview"
      subtitle="See the documents and the two-stage workflow before working with a real student."
      action={<KitLinkButton href="/admin/students" label="Back to Students" className="wa-page-action" />}
    >
      <BillingMockPreview />
    </PortalPageFrame>
  );
}
