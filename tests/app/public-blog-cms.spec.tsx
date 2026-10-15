import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>, locale: 'en',
  findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => {
  const db = { blogPost: h };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'synthetic-staff' }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async () => true }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: async () => {} }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {} }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: async (input: unknown) => input }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => h.locale }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));

import BlogPage from '@/app/blog/page';
import BlogPostPage, { generateMetadata } from '@/app/blog/[slug]/page';
import { POST } from '@/app/api/admin/blog/route';
import { PATCH } from '@/app/api/admin/blog/[id]/route';
import { loadPublicBlogListing, loadPublicBlogSitemapEntries } from '@/lib/blog/publicPosts';
import { WITHHELD_BLOG_SLUGS } from '@/shared/blogPublication';

const date = new Date('2026-10-15T12:00:00Z');
function post(id: string, fields: Record<string, unknown> = {}) {
  return { id, slug: id, title: `Article ${id}`, excerpt: `Excerpt ${id}`, content: '**Approved resource**', authorName: 'WorkforceAP Team', published: true, publishedAt: date, updatedAt: date, category: 'Career Tips', coverImage: null, heroImage: null, ...fields };
}
function doc(tree: React.ReactNode) { const result = document.implementation.createHTMLDocument(); result.body.innerHTML = renderToStaticMarkup(tree); return result; }
const request = (method: string, body: unknown) => new NextRequest('https://example.test/api/admin/blog', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks(); h.locale = 'en';
  h.rows = [post('approved'), post('private-draft', { published: false, category: 'Private' }), post('seed-story', { slug: WITHHELD_BLOG_SLUGS[0], category: 'Success Stories' })];
  h.count.mockImplementation(async ({ where }) => h.rows.filter((row) => matchesWhere(row, where)).length);
  h.findMany.mockImplementation(async ({ where, skip = 0, take }) => h.rows.filter((row) => matchesWhere(row, where)).slice(skip, skip + take));
  h.findFirst.mockImplementation(async ({ where }) => h.rows.find((row) => matchesWhere(row, where)) ?? null);
  h.findUnique.mockImplementation(async ({ where }) => h.rows.find((row) => matchesWhere(row, where)) ?? null);
  h.groupBy.mockImplementation(async ({ where }) => [...new Set(h.rows.filter((row) => matchesWhere(row, where)).map((row) => row.category))].map((category) => ({ category })));
  h.create.mockImplementation(async ({ data }) => { const row = post('created', data); h.rows.push(row); return row; });
  h.update.mockImplementation(async ({ where, data }) => { const row = h.rows.find((candidate) => matchesWhere(candidate, where)); Object.assign(row!, data); return row; });
});

describe('CMS-backed public blog', () => {
  it('publishes a saved CMS post immediately, then reflects edits and unpublishing in the actual public pages', async () => {
    const created = await POST(request('POST', { slug: 'new-resource', title: 'New CMS resource', content: '**New resource body**', published: true }));
    expect(created.status).toBe(200);
    const listing = doc(await BlogPage({ searchParams: Promise.resolve({}) }));
    expect(listing.body.textContent).toContain('New CMS resource');
    expect(listing.body.textContent).not.toContain('Article private-draft');
    expect(listing.querySelector('a[href="/en/blog/new-resource"]')).not.toBeNull();
    const detail = doc(await BlogPostPage({ params: Promise.resolve({ slug: 'new-resource' }) }));
    expect(detail.querySelector('.prose strong')?.textContent).toBe('New resource body');
    await PATCH(request('PATCH', { title: 'Updated CMS title' }), params('created'));
    expect(doc(await BlogPostPage({ params: Promise.resolve({ slug: 'new-resource' }) })).querySelector('h1')?.textContent).toBe('Updated CMS title');
    await PATCH(request('PATCH', { published: false }), params('created'));
    expect(doc(await BlogPage({ searchParams: Promise.resolve({}) })).body.textContent).not.toContain('Updated CMS title');
    await expect(BlogPostPage({ params: Promise.resolve({ slug: 'new-resource' }) })).rejects.toThrow('NOT_FOUND');
  });

  it('withholds known unverified seeded outcomes from cards, counts, related links, details, metadata and sitemap even if the saved flag is published', async () => {
    const listing = await loadPublicBlogListing();
    expect(listing.publishedCount).toBe(1);
    expect(listing.categories).toEqual(['Career Tips']);
    expect(listing.posts.map((row) => row.slug)).toEqual(['approved']);
    const detail = doc(await BlogPostPage({ params: Promise.resolve({ slug: 'approved' }) }));
    expect(detail.querySelector(`a[href*="${WITHHELD_BLOG_SLUGS[0]}"]`)).toBeNull();
    await expect(BlogPostPage({ params: Promise.resolve({ slug: WITHHELD_BLOG_SLUGS[0] }) })).rejects.toThrow('NOT_FOUND');
    await expect(generateMetadata({ params: Promise.resolve({ slug: WITHHELD_BLOG_SLUGS[0] }) })).rejects.toThrow('NOT_FOUND');
    expect((await loadPublicBlogSitemapEntries()).map((row) => row.slug)).toEqual(['approved']);
  });

  it('filters the full published population by category before pagination and clamps invalid pages', async () => {
    h.rows.push(...Array.from({ length: 26 }, (_, index) => post(`new-${index}`, { category: 'Program Spotlight' })));
    const result = await loadPublicBlogListing({ category: 'Program Spotlight', page: '2' });
    expect(result).toMatchObject({ publishedCount: 27, filteredCount: 26, page: 2, totalPages: 2 });
    expect(result.posts.map((row) => row.slug)).toEqual(['new-24', 'new-25']);
    expect((await loadPublicBlogListing({ page: 'NaN' })).page).toBe(1);
  });

  it('preserves localized links and sanitizes authored Markdown without interpreting raw HTML or script URLs', async () => {
    h.locale = 'es';
    h.rows[0].content = '# Authored section\n\n**Safe content**\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))';
    const page = doc(await BlogPostPage({ params: Promise.resolve({ slug: 'approved' }) }));
    expect(page.querySelector('.prose strong')?.textContent).toBe('Safe content');
    expect(page.querySelector('script')).toBeNull();
    expect(page.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(page.querySelector('a[href="/es/blog"]')).not.toBeNull();
    expect(page.querySelectorAll('h1')).toHaveLength(1);
    expect(page.querySelector('.prose h2')?.textContent).toBe('Authored section');
  });

  it('does not resurrect static seed articles when the CMS is unavailable', async () => {
    h.count.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(loadPublicBlogListing()).rejects.toThrow('database unavailable');
  });
});
