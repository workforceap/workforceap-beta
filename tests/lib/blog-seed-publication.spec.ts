// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ upsert: vi.fn(async (_args: unknown) => ({})) }));
vi.mock('@prisma/client', () => ({ PrismaClient: class { blogPost = h; } }));
import { seedBlogPosts } from '@/prisma/seed-blog';
import { getPublishedPosts } from '../../marketing/src/data/blog';
import { WITHHELD_BLOG_SLUGS } from '@/shared/blogPublication';

describe('known unverified seeded blog outcomes', () => {
  it('cannot be published by static snapshot consumers or by a fresh seed', async () => {
    await seedBlogPosts();
    for (const slug of WITHHELD_BLOG_SLUGS) {
      expect(getPublishedPosts().some((post) => post.slug === slug)).toBe(false);
      const write = h.upsert.mock.calls.map(([args]) => args as { where: { slug: string }; create: { published: boolean } }).find((args) => args.where.slug === slug);
      expect(write?.create.published).toBe(false);
    }
  });
});
