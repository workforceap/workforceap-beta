import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { isBlogPublicationAllowed, publicBlogPublicationWhere } from '@/shared/blogPublication';

const PAGE_SIZE = 24;
const cardSelect = {
  id: true, slug: true, title: true, excerpt: true, category: true,
  authorName: true, coverImage: true, heroImage: true, publishedAt: true, updatedAt: true,
} as const;

export async function loadPublicBlogListing(args: { page?: string; category?: string } = {}) {
  const category = args.category?.trim().slice(0, 200) || null;
  const publication = publicBlogPublicationWhere();
  const where = { ...publication, ...(category ? { category } : {}) };
  return prisma.$transaction(async (db) => {
    const [filteredCount, publishedCount, groups] = await Promise.all([
      db.blogPost.count({ where }),
      db.blogPost.count({ where: publication }),
      db.blogPost.groupBy({ by: ['category'], where: publication, orderBy: { category: 'asc' } }),
    ]);
    const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
    const requestedPage = Number(args.page);
    const page = Number.isSafeInteger(requestedPage) ? Math.min(totalPages, Math.max(1, requestedPage)) : 1;
    const posts = await db.blogPost.findMany({
      where, select: cardSelect, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE,
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    });
    return {
      posts, publishedCount, filteredCount, page, totalPages, category,
      categories: groups.flatMap((row) => row.category ? [row.category] : []),
    };
  });
}

export async function loadPublicBlogPost(slug: string) {
  if (!isBlogPublicationAllowed(slug)) return null;
  return prisma.$transaction((db) => db.blogPost.findFirst({
    where: { AND: [publicBlogPublicationWhere(), { slug }] },
    select: { ...cardSelect, content: true },
  }));
}

export async function loadRelatedPublicPosts(post: { id: string; category: string | null }) {
  return prisma.$transaction((db) => db.blogPost.findMany({
    where: { ...publicBlogPublicationWhere(), id: { not: post.id }, ...(post.category ? { category: post.category } : {}) },
    select: { slug: true, title: true }, take: 3,
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
  }));
}

export async function loadPublicBlogSitemapEntries() {
  return prisma.$transaction((db) => db.blogPost.findMany({
    where: publicBlogPublicationWhere(), select: { slug: true, updatedAt: true },
    take: 1000, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  }));
}

export type PublicBlogListing = Awaited<ReturnType<typeof loadPublicBlogListing>>;
export type PublicBlogPost = NonNullable<Awaited<ReturnType<typeof loadPublicBlogPost>>>;
