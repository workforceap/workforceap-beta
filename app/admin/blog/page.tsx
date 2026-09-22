import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { ADMIN_SSR_LIST_CAP } from '@/lib/db/queryCaps';

import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { buildPageMetadataAsync } from '@/app/seo';
import { captureApiError } from '@/lib/observability/captureApiError';
import BlogPostActions from '@/components/admin/BlogPostActions';
import PageHeader from '@/components/portal/PageHeader';
import { DesignSurface } from '@/components/portal/kit';
import {
  BlogKit,
  type BlogRow,
  type BlogDisplayStatus,
} from '@/components/portal/kit/pages/admin-subviews/BlogKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Admin – Blog Posts',
  description: 'Manage blog content.',
  path: '/admin/blog',
});
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  published: { bg: 'rgba(74,155,79,0.12)', color: 'var(--wa-success-dark)' },
  scheduled: { bg: 'rgba(37,99,235,0.1)', color: '#2563eb' },
  draft: { bg: 'var(--surface-container-high)', color: 'var(--color-on-surface-variant)' },
};

/** Cap the lean kit table so first paint stays cheap. */
const BOARD_LIMIT = 50;

/** "Jun 10" — short month + day, matching the mockup. */
function formatUpdated(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/blog');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { ui } = await searchParams;

  if (ui !== 'legacy') {
    return renderKit();
  }

  return renderLegacy();
}

/** Design-kit default: dense roster of marketing & resource posts → <BlogKit/>. */
async function renderKit() {
  let rows: BlogRow[] = [];

  try {
    const posts = await prisma.blogPost.findMany({
      take: BOARD_LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        authorName: true,
        category: true,
        published: true,
        scheduledAt: true,
        updatedAt: true,
      },
    });

    rows = posts.map((post): BlogRow => {
      const status: BlogDisplayStatus = post.published
        ? 'Published'
        : post.scheduledAt
        ? 'Scheduled'
        : 'Draft';
      return {
        id: post.id,
        title: post.title,
        author: post.authorName,
        category: post.category?.trim() || '—',
        status,
        updated: formatUpdated(post.updatedAt),
      };
    });
  } catch (error) {
    // Core query failed — fall back to the proven legacy view rather than
    // rendering a fabricated/empty kit.
    captureApiError(error, { route: 'admin/blog', extra: { view: 'kit' } });
    redirect('/admin/blog?ui=legacy');
  }

  return (
    <DesignSurface surface="dense">
      <BlogKit posts={rows} />
    </DesignSurface>
  );
}

/** Legacy blog manager (preserved behind ?ui=legacy). */
async function renderLegacy() {
  const posts = await prisma.blogPost.findMany({
    take: ADMIN_SSR_LIST_CAP,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      published: true,
      publishedAt: true,
      scheduledAt: true,
      updatedAt: true,
    },
  });

  return (
    <div>
      <PageHeader
        title="Blog Posts"
        subtitle={
          posts.length >= ADMIN_SSR_LIST_CAP
            ? `Showing first ${posts.length} posts`
            : `${posts.length} post${posts.length !== 1 ? 's' : ''}`
        }
        action={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/admin/blog/ai" className="btn btn-outline btn-sm">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              AI Assistant
            </Link>
            <Link href="/admin/blog/new" className="btn btn-primary btn-sm">
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
              New Post
            </Link>
          </div>
        }
      />

      {posts.length === 0 ? (
        <div className="admin-empty-state">
          <h3>No blog posts yet</h3>
          <p>Create your first post to start publishing content.</p>
          <Link href="/admin/blog/new" className="btn btn-primary">New Post</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {posts.map((post) => {
            const statusKey = post.published ? 'published' : post.scheduledAt ? 'scheduled' : 'draft';
            const statusLabel = post.published ? 'Published' : post.scheduledAt ? 'Scheduled' : 'Draft';
            const sc = STATUS_COLOR[statusKey];
            const updatedLabel = post.updatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const publishLabel = post.publishedAt
              ? post.publishedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : post.scheduledAt
              ? post.scheduledAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : null;

            return (
              <div key={post.id} className="portal-card portal-card--flat" style={{ padding: '1rem 1.125rem', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  {/* Post type icon */}
                  <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.625rem', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', color: 'var(--wa-accent-text)', fontVariationSettings: "'FILL' 1" }}>article</span>
                  </div>

                  {/* Title + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
                      <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.3 }}>
                        {post.title}
                      </p>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: sc.bg, color: sc.color, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                        {statusLabel}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                      {post.category && <span style={{ fontWeight: 600 }}>{post.category}</span>}
                      {post.category && <span>·</span>}
                      {publishLabel && <span>{statusKey === 'scheduled' ? `Scheduled ${publishLabel}` : `Published ${publishLabel}`}</span>}
                      <span>Updated {updatedLabel}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <Link
                      href={`/admin/blog/${post.id}/edit`}
                      className="btn btn-outline btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>edit</span>
                      Edit
                    </Link>
                    <Link
                      href={`/admin/blog/preview/${post.slug}`}
                      className="btn btn-outline btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>visibility</span>
                      Preview
                    </Link>
                    <BlogPostActions id={post.id} slug={post.slug} published={post.published} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
