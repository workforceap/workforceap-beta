import { describe, expect, it } from 'vitest';
import nextConfig from '@/next.config';

describe('Admin Game Lab framing', () => {
  it('allows only the game index document to embed on the same origin', async () => {
    const rules = (await nextConfig.headers?.())!;
    const globalRule = rules.find((rule) => rule.source === '/(.*)')!;
    const header = (rule: typeof globalRule, key: string) => rule.headers.find((entry) => entry.key === key)?.value;
    const globalCsp = header(globalRule, 'Content-Security-Policy')!;
    expect(header(globalRule, 'X-Frame-Options')).toBe('DENY');
    expect(globalCsp).toContain("frame-ancestors 'none'");

    const labRules = rules.filter((rule) => rule.source.includes('game-lab'));
    expect(labRules.map((rule) => rule.source)).toEqual(['/api/admin/game-lab/:game/index.html']);
    const [rule] = labRules;
    expect(rules.indexOf(rule)).toBeGreaterThan(rules.indexOf(globalRule));
    expect(header(rule, 'X-Frame-Options')).toBe('SAMEORIGIN');
    expect(header(rule, 'Content-Security-Policy')!.replace("frame-ancestors 'self'", "frame-ancestors 'none'")).toBe(globalCsp);
    // The page that hosts the iframe keeps the global deny.
    expect(rules.filter((r) => r.source === '/admin/game-lab')).toHaveLength(0);
    // Bundling of these files is proven against Next's matcher in tests/next-tracing-includes.test.ts.
    expect(nextConfig.outputFileTracingIncludes?.['/api/admin/game-lab/*/*']).toContain('./assets/game-lab/**/*');
  });
});
