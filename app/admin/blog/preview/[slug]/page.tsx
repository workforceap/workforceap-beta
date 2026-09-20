import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db/prisma';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PageHero from '@/components/PageHero';
import { resolveBlogHeroImage } from '@/lib/blog/blogHeroImage';
type Props = { params: Promise<{ slug: string }> };

export default async function AdminBlogPreviewPage({ params }: Props) {
  const { slug } = await params;
  const post = await prisma.blogPost.findUnique({
    where: { slug },
  });
  if (!post) notFound();

  const related = post.published
    ? await prisma.blogPost.findMany({
        where: {
          published: true,
          id: { not: post.id },
          category: post.category ?? undefined,
        },
        take: 3,
        orderBy: { publishedAt: 'desc' },
        select: { slug: true, title: true },
      })
    : [];

  return (
    <div className="inner-page">
      {!post.published && (
        <div
          style={{
            background: 'var(--wa-gold-soft)',
            color: 'var(--wa-gold-dark)',
            padding: '0.5rem 1rem',
            textAlign: 'center',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          Draft preview — not visible to the public
        </div>
      )}
      <PageHero
        title={post.title}
        subtitle={[
          post.category,
          post.authorName,
          post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('en-US') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <article className="blog-post-article">
        {post.coverImage ? (
          <div
            style={{
              marginBottom: '2rem',
              borderRadius: '8px',
              overflow: 'hidden',
              aspectRatio: '16/9',
            }}
          >
            <Image
              src={resolveBlogHeroImage(post.coverImage, post.category, post.slug).src}
              alt=""
              width={680}
              height={383}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ) : (
          <div
            style={{
              marginBottom: '2rem',
              borderRadius: '8px',
              overflow: 'hidden',
              aspectRatio: '16/9',
              // Light logo artwork needs a dark brand fill in both themes (was a
              // hardcoded slate slab that ignored light mode — WAP-137).
              background: 'linear-gradient(135deg, var(--wa-hero-crimson), var(--wa-hero-crimson-dark))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
            }}
          >
            <Image
              src="/images/wap_logo.png"
              alt=""
              width={272}
              height={153}
              style={{ width: '40%', height: 'auto', opacity: 0.9, objectFit: 'contain' }}
            />
          </div>
        )}
        <div className="blog-post-prose markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
        </div>
        <div
          style={{
            marginTop: '3rem',
            paddingTop: '2rem',
            borderTop: '1px solid var(--outline-variant)',
          }}
        >
          <Link
            href={`/admin/blog/${post.id}/edit`}
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              background: 'var(--surface-container)',
              color: 'var(--color-on-surface)',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
              marginRight: '0.75rem',
            }}
          >
            ← Back to Edit
          </Link>
          {post.published && (
            <Link
              href={`/blog/${post.slug}`}
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                background: 'var(--color-accent)',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              View live
            </Link>
          )}
        </div>
        {related.length > 0 && (
          <aside
            style={{
              marginTop: '3rem',
              paddingTop: '2rem',
              borderTop: '1px solid var(--outline-variant)',
            }}
          >
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
              Related Posts
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {related.map((r) => (
                <li key={r.slug} style={{ marginBottom: '0.5rem' }}>
                  <Link
                    href={`/blog/${r.slug}`}
                    style={{ color: 'var(--color-accent)', textDecoration: 'none' }}
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </article>
    </div>
  );
}
