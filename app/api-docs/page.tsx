import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import ApiDocsClient from '@/components/api-docs/ApiDocsClient';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { apiDocsCatalog } from '@/lib/api-docs/catalog';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { ...await buildPageMetadataAsync({
    title: 'API Reference',
    description: 'Interactive documentation for all WorkforceAP API endpoints.',
    path: '/api-docs',
  }), robots: { index: false, follow: false } };
}

export default async function ApiDocsPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/api-docs');
  if (!(await isSuperAdmin(user.id))) notFound();
  return <ApiDocsClient data={apiDocsCatalog} />;
}
