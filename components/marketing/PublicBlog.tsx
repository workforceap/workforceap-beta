/* eslint-disable @next/next/no-img-element -- Preserve the existing public article image layout. */
import type { CSSProperties } from 'react';
import { GraduationCap, HelpCircle, Mail, Newspaper, Star } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LocalizedLink from '@/components/LocalizedLink';
import { resolveBlogHeroImage } from '@/lib/blog/blogHeroImage';
import { formatPublishedDate } from '@/lib/blog/formatPublishedDate';
import { heroPhotoSequenceForKey } from '@/lib/marketing/heroPhotos';
import { WORKFORCEAP_PROGRAM_CATALOG_SIZE } from '@/lib/content/programs';
import type { PublicBlogListing, PublicBlogPost as Post } from '@/lib/blog/publicPosts';

function heroStyle(key: string): CSSProperties {
  const photos = heroPhotoSequenceForKey(key, 3);
  return {
    '--wap-hero-photo-url': `url('${photos[0]}')`,
    '--wap-hero-photo-url-3': `url('${photos[2]}')`,
  } as CSSProperties;
}

function Aura() {
  return <><div className="aura aura--1" aria-hidden="true" /><div className="aura aura--2" aria-hidden="true" /><div className="aura aura--3" aria-hidden="true" /><div className="grain" aria-hidden="true" /></>;
}

function ClosingCallToAction({ article = false }: { article?: boolean }) {
  return (
    <section className="close">
      <div className="close__media" aria-hidden="true" /><div className="close__veil" aria-hidden="true" />
      <div className="close__inner wrap">
        <h2>Ready to take the next step?</h2>
        <p>WorkforceAP offers no-cost career training paths for <LocalizedLink href="/apply" className="cta-link">qualifying members</LocalizedLink> — with guided tools, advisor support, and employer-aligned credentials.</p>
        <div className="acts acts--center">
          <LocalizedLink className="bbtn bbtn--gold" href="/find-your-path">Find Your Path</LocalizedLink>
          <LocalizedLink className="bbtn bbtn--outline" href={article ? '/blog' : '/programs'}>{article ? 'More Articles' : 'Explore Programs'}</LocalizedLink>
          {!article && <LocalizedLink className="bbtn bbtn--outline" href="/apply">Apply Now</LocalizedLink>}
        </div>
      </div>
    </section>
  );
}

function listingHref(category: string | null, page = 1) {
  const query = new URLSearchParams();
  if (category) query.set('category', category);
  if (page > 1) query.set('page', String(page));
  return `/blog${query.size ? `?${query}` : ''}`;
}

export function PublicBlogListingPage({ data }: { data: PublicBlogListing }) {
  const hasPosts = data.publishedCount > 0;
  return (
    <div className="public-blog blogmix" style={heroStyle('/blog')}>
      <section className="stage">
        <Aura />
        <div className="wrap stage-grid">
          <div className="lede">
            <span className="pill"><span className="pill__star"><Star size={12} aria-hidden="true" /></span>Career Resources · WorkforceAP</span>
            <h1>Career <span className="shimmer">Resources</span></h1>
            <p className="sub">Career tips, program spotlights, and workforce insights — plus programs, FAQ, and application help when you&apos;re ready.</p>
          </div>
          <div className="hcard">
            <div className="hcard-row"><span className="hcard-ic" aria-hidden="true"><Newspaper size={28} /></span><span className="dot-live">Latest articles</span></div>
            <div className="hcard-big">{data.publishedCount} articles published</div>
            <p className="hcard-p">Read the latest, then browse programs or start your application.</p>
            <div className="hcard-chips"><span>Career tips</span><span>Program spotlights</span><span>Workforce insights</span></div>
          </div>
        </div>
      </section>
      <section className="blk blk--cream">
        <div className="wrap" style={{ maxWidth: 1100 }}>
          <div className="blog-quick">
            <LocalizedLink className="qcard" href="/programs"><span className="ic ic--c" aria-hidden="true"><GraduationCap /></span><span className="qtext"><span className="qt">{hasPosts ? 'Explore Programs' : 'Start with Programs'}</span><span className="qs">{WORKFORCEAP_PROGRAM_CATALOG_SIZE} career training options</span></span><span className="qarr" aria-hidden="true">→</span></LocalizedLink>
            <LocalizedLink className="qcard" href="/faq"><span className="ic ic--g" aria-hidden="true"><HelpCircle /></span><span className="qtext"><span className="qt">{hasPosts ? 'Read FAQ' : 'Get Answers Fast'}</span><span className="qs">Common questions answered</span></span><span className="qarr" aria-hidden="true">→</span></LocalizedLink>
          </div>
          {data.categories.length > 0 && (
            <nav className="cats" aria-label="Filter posts by category">
              {[null, ...data.categories].map((category) => (
                <LocalizedLink key={category ?? 'all'} className={`cat-chip${category === data.category ? ' is-active' : ''}`} href={listingHref(category)} aria-current={category === data.category ? 'page' : undefined}>{category ?? 'All'}</LocalizedLink>
              ))}
            </nav>
          )}
          <div className="post-grid">
            {data.posts.map((post) => {
              const hero = resolveBlogHeroImage(post.coverImage || post.heroImage, post.category, post.slug);
              return (
                <article className="post-card" key={post.id}>
                  <LocalizedLink className="post-link" href={`/blog/${post.slug}`}>
                    <div className="post-cover"><img src={hero.src} alt={hero.alt} width={1600} height={900} loading="lazy" />{post.category && <span className="post-cat">{post.category}</span>}</div>
                    <h2 className="post-title">{post.title}</h2><p className="post-excerpt">{post.excerpt}</p>
                    <div className="post-meta">{post.authorName}{post.publishedAt ? ` · ${formatPublishedDate(post.publishedAt)}` : ''}</div>
                    <span className="post-cta" aria-hidden="true">Read more: {post.title} →</span>
                  </LocalizedLink>
                </article>
              );
            })}
          </div>
          {data.posts.length === 0 && <p>{data.category ? 'No articles in this category yet.' : 'New career resources are coming. Explore programs or read the FAQ while you wait.'}</p>}
          {data.totalPages > 1 && <nav className="blog-pagination" aria-label="Article pages">
            {data.page > 1 && <LocalizedLink href={listingHref(data.category, data.page - 1)}>← Previous</LocalizedLink>}
            <span>Page {data.page} of {data.totalPages}</span>
            {data.page < data.totalPages && <LocalizedLink href={listingHref(data.category, data.page + 1)}>Next →</LocalizedLink>}
          </nav>}
          <div className="updates-card"><span className="updates-ic" aria-hidden="true"><Mail size={28} /></span><h2>Want updates?</h2><p>Ask to be notified about new articles and program news — our team reads every request and replies by email.</p><LocalizedLink className="btn btn--primary" href="/contact">Contact us for updates</LocalizedLink></div>
        </div>
      </section>
      <ClosingCallToAction />
    </div>
  );
}

export function PublicBlogPostPage({ post, related }: { post: Post; related: Array<{ slug: string; title: string }> }) {
  const hero = resolveBlogHeroImage(post.coverImage || post.heroImage, post.category, post.slug);
  const subtitle = [post.authorName, post.publishedAt ? formatPublishedDate(post.publishedAt) : null].filter(Boolean).join(' · ');
  return (
    <div className="public-blog blogpost" style={heroStyle(`/blog/${post.slug}`)}>
      <section className="stage"><Aura /><div className="wrap stage-inner"><LocalizedLink className="backlink" href="/blog"><span aria-hidden="true">←</span> Back to Blog</LocalizedLink>{post.category && <span className="pill"><span className="pill__star" aria-hidden="true"><Star size={12} /></span>{post.category}</span>}<h1>{post.title}</h1><p className="meta">{subtitle}</p></div></section>
      <section className="blk blk--cream"><div className="wrap layout">
        <article className="article"><div className="cover"><img src={hero.src} alt={hero.alt} width={800} height={450} /></div>
          <div className="prose"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h1: ({ children }) => <h2>{children}</h2> }}>{post.content}</ReactMarkdown></div>
          <section className="cta-card"><h2>Ready to take the next step?</h2><p>WorkforceAP offers no-cost career training paths for <LocalizedLink href="/apply" className="cta-link">qualifying members</LocalizedLink> — with guided tools, advisor support, and employer-aligned credentials.</p><div className="cta-acts"><LocalizedLink className="btn btn--primary" href="/find-your-path">Find Your Path</LocalizedLink><LocalizedLink className="btn btn--ghost" href="/apply">Apply Now</LocalizedLink></div></section>
        </article>
        {related.length > 0 && <aside className="related"><h2>Related Posts</h2><ul>{related.map((row) => <li key={row.slug}><LocalizedLink href={`/blog/${row.slug}`}>{row.title}</LocalizedLink></li>)}</ul></aside>}
      </div></section>
      <ClosingCallToAction article />
    </div>
  );
}
