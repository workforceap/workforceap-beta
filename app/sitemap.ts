import type { MetadataRoute } from 'next';
import { LEADERS } from '@/lib/content/leadership';
import { prisma } from '@/lib/db/prisma';
import { shouldSkipOptionalDbQueriesAtBuild } from '@/lib/db/optionalBuildDb';
import { getActiveProgramSlugsForSitemap } from '@/lib/seo/activeProgramSlugs';
import { getSiteUrl } from '@/lib/seo/siteEnvironment';
import { getPublicImpactStats, hasPublicImpactLiveData, EMPTY_PUBLIC_IMPACT_STATS } from '@/lib/marketing/publicImpactStats';
import { getDefaultOrganizationId } from '@/lib/tenant/organization';
import { loadPublicBlogSitemapEntries } from '@/lib/blog/publicPosts';

const SITEMAP_LOCALES: { code: string; prefix: string }[] = [
  { code: 'en', prefix: '' },
  { code: 'es', prefix: '/es' },
  { code: 'fr', prefix: '/fr' },
  { code: 'pt', prefix: '/pt' },
];

type PublicRouteConfig = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
  lastModified?: Date;
};

function buildAlternates(path: string, siteUrl: string) {
  const languages: Record<string, string> = {};
  for (const { code, prefix } of SITEMAP_LOCALES) {
    languages[code] = `${siteUrl}${prefix}${path}`;
  }
  languages['x-default'] = `${siteUrl}${path}`;
  return { languages };
}

// Next.js requires this export to be a literal numeric constant —
// `60 * 60 * 24` parsed at build time triggers "Unsupported node
// type BinaryExpression at revalidate" and fails prod build.
export const revalidate = 86400;

const PUBLIC_ROUTES: PublicRouteConfig[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/apply', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/donate', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/careers', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/employers', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/career-quiz', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/find-your-path', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/leadership', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/partners', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/program-comparison', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/programs', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/salary-guide', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/what-we-do', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/insights/empowering-nonprofits-through-skill', changeFrequency: 'yearly', priority: 0.6 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/mentor', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/mentor/apply', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/accessibility', changeFrequency: 'yearly', priority: 0.5 },
  // /outcomes temporarily hidden (archived marketing page + redirects)
  { path: '/account/privacy', changeFrequency: 'yearly', priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  // Use a deploy/revalidation-scoped timestamp for routes that do not have a
  // content-backed update time. Per-request timestamps force unnecessary
  // re-crawls and make Search Console think every page changed on every hit.
  const fallbackModified = new Date();

  const mainPages: MetadataRoute.Sitemap = PUBLIC_ROUTES.map(({ path, changeFrequency, priority, lastModified }) => ({
    url: `${siteUrl}${path}`,
    lastModified: lastModified ?? fallbackModified,
    changeFrequency,
    priority,
    alternates: buildAlternates(path, siteUrl),
  }));

  const activePrograms = await getActiveProgramSlugsForSitemap();
  const programPages: MetadataRoute.Sitemap = activePrograms.map(({ slug, lastModified }) => ({
    url: `${siteUrl}/programs/${slug}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
    alternates: buildAlternates(`/programs/${slug}`, siteUrl),
  }));

  let blogPages: MetadataRoute.Sitemap = [];
  if (!shouldSkipOptionalDbQueriesAtBuild()) {
    try {
      const blogPosts = await loadPublicBlogSitemapEntries();
      blogPages = blogPosts.map((post) => ({
        url: `${siteUrl}/blog/${post.slug}`,
        lastModified: post.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
        alternates: buildAlternates(`/blog/${post.slug}`, siteUrl),
      }));
    } catch {
      // DB unavailable at build/runtime.
    }
  }

  const leadershipPages: MetadataRoute.Sitemap = LEADERS.map((leader) => ({
    url: `${siteUrl}/leadership/${leader.slug}`,
    lastModified: fallbackModified,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
    alternates: buildAlternates(`/leadership/${leader.slug}`, siteUrl),
  }));

  let impactPages: MetadataRoute.Sitemap = [];
  if (!shouldSkipOptionalDbQueriesAtBuild()) {
    try {
      const orgId = await getDefaultOrganizationId();
      const impactStats = await getPublicImpactStats(orgId);
      if (hasPublicImpactLiveData(impactStats)) {
        impactPages = [{
          url: `${siteUrl}/impact`,
          lastModified: fallbackModified,
          changeFrequency: 'monthly' as const,
          priority: 0.8,
          alternates: buildAlternates('/impact', siteUrl),
        }];
      }
    } catch {
      // Impact data unavailable — omit from sitemap.
    }
  }

  return [...mainPages, ...programPages, ...leadershipPages, ...blogPages, ...impactPages];
}
