// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildProductionRobots, buildStagingRobots } from '@/lib/seo/robotsPolicy';

describe('robots indexing policy', () => {
  it('lets crawlers read the price-list page noindex,nofollow meta in production', () => {
    const { rules } = buildProductionRobots();
    const productionRules = Array.isArray(rules) ? rules : [rules];

    expect(productionRules).toHaveLength(1);
    expect(productionRules[0].userAgent).toBe('*');
    expect(productionRules[0].allow).toContain('/');
    expect(productionRules[0].disallow).not.toContain('/programs/price-list');
  });

  it('continues to disallow all crawlers in staging', () => {
    expect(buildStagingRobots()).toEqual({
      rules: { userAgent: '*', disallow: '/' },
    });
  });
});
