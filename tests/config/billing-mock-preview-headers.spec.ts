import { describe, expect, it } from 'vitest';
import nextConfig from '@/next.config';

describe('Admin mock PDF framing', () => {
  it('allows only the two synthetic PDF endpoints to embed on the same origin', async () => {
    const rules = (await nextConfig.headers?.())!;
    const globalRule = rules.find((rule) => rule.source === '/(.*)')!;
    const header = (rule: typeof globalRule, key: string) => rule.headers.find((entry) => entry.key === key)?.value;
    const globalCsp = header(globalRule, 'Content-Security-Policy')!;
    expect(header(globalRule, 'X-Frame-Options')).toBe('DENY');
    expect(globalCsp).toContain("frame-ancestors 'none'");
    const mockRules = rules.filter((rule) => rule.source.startsWith('/api/admin/billing/preview/'));
    expect(mockRules.map((rule) => rule.source)).toEqual(['/api/admin/billing/preview/j5', '/api/admin/billing/preview/j6']);
    for (const rule of mockRules) {
      expect(rules.indexOf(rule)).toBeGreaterThan(rules.indexOf(globalRule));
      expect(header(rule, 'X-Frame-Options')).toBe('SAMEORIGIN');
      expect(header(rule, 'Content-Security-Policy')!.replace("frame-ancestors 'self'", "frame-ancestors 'none'")).toBe(globalCsp);
    }
    expect(rules.filter((rule) => rule.source === '/admin/billing/preview')).toHaveLength(0);
    expect(nextConfig.outputFileTracingIncludes?.['/api/admin/billing/preview/*']).toContain('./public/images/wap_logo.png');
  });
});
