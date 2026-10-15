import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import { loadPublicBlogListing } from '@/lib/blog/publicPosts';
import { PublicBlogListingPage } from '@/components/marketing/PublicBlog';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Workforce Development Blog | Career Tips & Training News',
    description: 'Career tips, program spotlights, and workforce insights from Workforce Advancement Project.',
    path: '/blog',
  });
}

export default async function BlogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const data = await loadPublicBlogListing({
    page: typeof query.page === 'string' ? query.page : undefined,
    category: typeof query.category === 'string' ? query.category : undefined,
  });
  return <PublicBlogListingPage data={data} />;
}
