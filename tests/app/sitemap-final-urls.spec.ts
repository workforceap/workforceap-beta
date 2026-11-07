import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/db/optionalBuildDb', () => ({ shouldSkipOptionalDbQueriesAtBuild: () => true }));
vi.mock('@/lib/seo/activeProgramSlugs', () => ({ getActiveProgramSlugsForSitemap: async () => [] }));
vi.mock('@/lib/seo/siteEnvironment', () => ({ getSiteUrl: () => 'https://www.workforceap.org' }));
vi.mock('@/lib/marketing/publicImpactStats', () => ({
  getPublicImpactStats: async () => ({}),
  hasPublicImpactLiveData: () => false,
  EMPTY_PUBLIC_IMPACT_STATS: {},
}));
vi.mock('@/lib/tenant/organization', () => ({ getDefaultOrganizationId: async () => 'org' }));
vi.mock('@/lib/blog/publicPosts', () => ({ loadPublicBlogSitemapEntries: async () => [] }));

import sitemap from '@/app/sitemap';

describe('sitemap final URLs', () => {
  it('lists the locale-prefixed apply page instead of the redirecting /apply', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://www.workforceap.org/en/apply');
    expect(urls).not.toContain('https://www.workforceap.org/apply');
  });

  it('points every apply alternate at a non-redirecting locale URL', async () => {
    const apply = (await sitemap()).find((entry) => entry.url.endsWith('/en/apply'));
    expect(apply?.alternates?.languages).toEqual({
      en: 'https://www.workforceap.org/en/apply',
      es: 'https://www.workforceap.org/es/apply',
      fr: 'https://www.workforceap.org/fr/apply',
      pt: 'https://www.workforceap.org/pt/apply',
      'x-default': 'https://www.workforceap.org/en/apply',
    });
  });

  it('keeps Astro-served routes at their existing unprefixed URLs', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain('https://www.workforceap.org/faq');
    expect(urls).toContain('https://www.workforceap.org/programs');
  });
});
