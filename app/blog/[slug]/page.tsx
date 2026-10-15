import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { loadPublicBlogPost, loadRelatedPublicPosts } from '@/lib/blog/publicPosts';
import { PublicBlogPostPage } from '@/components/marketing/PublicBlog';
import { resolveBlogHeroImage } from '@/lib/blog/blogHeroImage';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await loadPublicBlogPost((await params).slug);
  if (!post) notFound();
  const hero = resolveBlogHeroImage(post.coverImage || post.heroImage, post.category, post.slug);
  return buildPageMetadataAsync({ title: post.title, description: post.excerpt || post.title, path: `/blog/${post.slug}`, image: hero.src });
}

export default async function BlogPostPage({ params }: Props) {
  const post = await loadPublicBlogPost((await params).slug);
  if (!post) notFound();
  return <PublicBlogPostPage post={post} related={await loadRelatedPublicPosts(post)} />;
}
