// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPublishedPosts } from '../marketing/src/data/blog';
import { getProgramBySlug } from '../lib/content/programs';
import nextConfig from '../next.config';

type Redirect = { source: string; destination: string; permanent: boolean };

const root = process.cwd();

/** Published Astro blog slugs (dynamic route: marketing/src/pages/blog/[slug].astro). */
const publishedBlogSlugs = new Set(getPublishedPosts().map((post) => post.slug));

function marketingPageExists(urlPath: string): boolean {
  if (urlPath === '/blog' || urlPath === '/blog/') {
    return existsSync(path.join(root, 'marketing/src/pages/blog.astro'))
      || existsSync(path.join(root, 'marketing/src/pages/blog/index.astro'));
  }
  const slug = urlPath.replace(/^\/blog\//, '').replace(/\/$/, '');
  return existsSync(path.join(root, 'marketing/src/pages/blog', `${slug}.astro`))
    || existsSync(path.join(root, 'marketing/src/pages/blog', slug, 'index.astro'))
    || existsSync(path.join(root, 'marketing/dist/blog', slug, 'index.html'))
    || existsSync(path.join(root, 'marketing/dist/blog', `${slug}.html`))
    // Dynamic [slug].astro posts are live when the slug is in the published catalog.
    || (existsSync(path.join(root, 'marketing/src/pages/blog/[slug].astro'))
      && publishedBlogSlugs.has(slug));
}

const LOCALE_PREFIX = /^\/(?::locale(?:\([^)]*\))?|en|es|fr|pt)(?=\/|$)/;

/** Resolve a redirect destination to a shipped Next.js App Router page or Astro marketing page. */
function appRouteExists(urlPath: string): boolean {
  const clean = urlPath.replace(LOCALE_PREFIX, '').replace(/\?.*$/, '').replace(/\/$/, '') || '/';
  if (clean === '/') {
    return existsSync(path.join(root, 'marketing/src/pages/index.astro'))
      || existsSync(path.join(root, 'app/page.tsx'));
  }
  const segments = clean.split('/').filter(Boolean);
  // Program detail pages are one Astro `[slug].astro`; the slug must be a catalog program.
  if (segments.length === 2 && segments[0] === 'programs') {
    return existsSync(path.join(root, 'marketing/src/pages/programs/[slug].astro'))
      && getProgramBySlug(segments[1]) !== undefined;
  }
  // Dynamic destinations (`/dashboard/jobs/:id`) resolve against their static parent.
  const staticSegments = segments.filter((seg) => !seg.startsWith(':'));
  const rel = staticSegments.join('/');
  const appDir = path.join(root, 'app');
  const candidates = [
    path.join(appDir, rel, 'page.tsx'),
    ...['(portal)', '(auth)', '(decision-journey)'].map((group) => path.join(appDir, group, rel, 'page.tsx')),
    path.join(root, 'marketing/src/pages', `${rel}.astro`),
    path.join(root, 'marketing/src/pages', rel, 'index.astro'),
  ];
  if (candidates.some((candidate) => existsSync(candidate))) return true;
  // A dynamic segment directory (`[id]`, `[...slug]`) directly under the static parent.
  if (staticSegments.length !== segments.length) {
    const parents = [appDir, ...['(portal)', '(auth)', '(decision-journey)'].map((g) => path.join(appDir, g))];
    return parents.some((parent) => {
      const dir = path.join(parent, rel);
      if (!existsSync(dir)) return false;
      return readdirSync(dir).some((entry) => /^\[.*\]$/.test(entry) && existsSync(path.join(dir, entry, 'page.tsx')));
    });
  }
  return false;
}

/**
 * Stale routes that shipped in older materials, emails and shared links
 * (WAP-40). Each must keep redirecting, and to a destination that exists.
 */
const STALE_ROUTES: Array<{ source: string; destination: string }> = [
  { source: '/index.html', destination: '/' },
  { source: '/apply.html', destination: '/apply' },
  { source: '/programs.html', destination: '/programs' },
  { source: '/what-we-do.html', destination: '/what-we-do' },
  { source: '/how-it-works.html', destination: '/how-it-works' },
  { source: '/faq.html', destination: '/faq' },
  { source: '/contact.html', destination: '/contact' },
  { source: '/leadership.html', destination: '/leadership' },
  { source: '/salary-guide.html', destination: '/salary-guide' },
  { source: '/program-comparison.html', destination: '/program-comparison' },
  { source: '/services', destination: '/what-we-do' },
  { source: '/fund', destination: '/donate' },
  { source: '/jobs', destination: '/dashboard/jobs' },
  { source: '/jobs/:id', destination: '/dashboard/jobs/:id' },
  { source: '/portal', destination: '/login' },
  { source: '/signin', destination: '/login' },
  { source: '/sign-in', destination: '/login' },
  { source: '/auth/login', destination: '/en/login' },
  { source: '/auth/sign-in', destination: '/login' },
  { source: '/resources', destination: '/dashboard/career-library' },
  { source: '/help', destination: '/dashboard/help' },
  { source: '/account', destination: '/dashboard/account' },
  { source: '/ai-tools', destination: '/dashboard/ai-tools' },
  { source: '/career-brief', destination: '/dashboard/career-brief' },
  { source: '/learning', destination: '/dashboard/learning' },
  { source: '/weekly-recap', destination: '/dashboard/weekly-recap' },
  { source: '/training', destination: '/dashboard/program' },
  { source: '/portal/dashboard', destination: '/dashboard' },
  { source: '/portal/training', destination: '/dashboard/program' },
  { source: '/dashboard/plan', destination: '/dashboard/career-brief' },
  { source: '/dashboard/weekly-focus', destination: '/dashboard/weekly-recap' },
  { source: '/my-group', destination: '/dashboard' },
  { source: '/employer/dashboard', destination: '/employer' },
  { source: '/admin/wioa', destination: '/admin/wioa-screening' },
  { source: '/programs/quiz', destination: '/career-quiz' },
  { source: '/programs/cybersecurity', destination: '/programs/cybersecurity-professional-certificate-google' },
];

describe('stale routes keep redirecting to destinations that exist (WAP-40)', () => {
  it('covers every advertised stale route', async () => {
    const redirects = (await nextConfig.redirects?.()) as Redirect[];
    const bySource = new Map(redirects.map((r) => [r.source, r]));
    for (const stale of STALE_ROUTES) {
      const redirect = bySource.get(stale.source);
      expect(redirect, `${stale.source} must still redirect`).toBeDefined();
      expect(redirect!.destination, stale.source).toBe(stale.destination);
    }
  });

  it('sends every non-blog redirect to a shipped app or marketing route', async () => {
    const redirects = (await nextConfig.redirects?.()) as Redirect[];
    const isBlog = (destination: string) => /^(\/:locale(?:\([^)]*\))?)?\/blog(\/|$)/.test(destination);
    const missing = redirects
      .filter((r) => !isBlog(r.destination))
      .filter((r) => !appRouteExists(r.destination))
      .map((r) => `${r.source} → ${r.destination}`);
    expect(missing).toEqual([]);
  });
});

describe('next.config redirects stay on live destinations', () => {
  it('maps legacy blog and jobs URLs to resolvable targets', async () => {
    const redirects = (await nextConfig.redirects?.()) as Redirect[] | undefined;
    expect(Array.isArray(redirects)).toBe(true);
    const list = redirects ?? [];

    const bySource = new Map(list.map((r) => [r.source, r]));

    expect(bySource.get('/jobs')?.destination).toBe('/dashboard/jobs');
    expect(bySource.get('/blog/our-mission')?.destination).toBe(
      '/blog/michael-brown-workforce-leader-austin',
    );
    expect(bySource.get('/blog/why-we-started-workforceap')?.destination).toBe(
      '/blog/michael-brown-workforce-leader-austin',
    );
    expect(bySource.get('/blog/career-change-guide')?.destination).toBe(
      '/blog/breaking-into-tech-starting-over',
    );
    expect(bySource.get('/blog/it-certifications-guide')?.destination).toBe(
      '/blog/5-certifications-under-6-months',
    );
    expect(bySource.get('/programs/cybersecurity')?.destination).toBe(
      '/programs/cybersecurity-professional-certificate-google',
    );

    for (const redirect of list) {
      if (!redirect.destination.startsWith('/blog')) continue;
      if (redirect.destination.includes(':')) continue;
      expect(
        marketingPageExists(redirect.destination),
        `${redirect.source} → ${redirect.destination} must exist in marketing`,
      ).toBe(true);
    }
  });
});
