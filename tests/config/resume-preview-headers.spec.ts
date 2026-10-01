import { describe, expect, it } from 'vitest';

import nextConfig from '@/next.config';

describe('member PDF preview frame policy', () => {
  it('allows only the exact preview route to be framed by this site', async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toBeDefined();

    const globalRule = rules!.find((rule) => rule.source === '/(.*)');
    const previewRule = rules!.find((rule) => rule.source === '/api/member/resume/preview');
    expect(globalRule).toBeDefined();
    expect(previewRule).toBeDefined();
    expect(rules!.indexOf(previewRule!)).toBeGreaterThan(rules!.indexOf(globalRule!));

    const header = (rule: NonNullable<typeof globalRule>, key: string) =>
      rule!.headers.find((entry) => entry.key.toLowerCase() === key.toLowerCase())?.value;
    const globalCsp = header(globalRule!, 'Content-Security-Policy');
    const previewCsp = header(previewRule!, 'Content-Security-Policy');

    expect(header(globalRule!, 'X-Frame-Options')).toBe('DENY');
    expect(globalCsp).toContain("frame-ancestors 'none'");
    expect(header(previewRule!, 'X-Frame-Options')).toBe('SAMEORIGIN');
    expect(previewCsp).toContain("frame-ancestors 'self'");
    expect(previewCsp!.replace("frame-ancestors 'self'", "frame-ancestors 'none'")).toBe(globalCsp);
    expect(previewRule!.headers.map((entry) => entry.key).sort()).toEqual([
      'Content-Security-Policy',
      'X-Frame-Options',
    ]);

    // The exception must not cover sibling member APIs or portal HTML.
    expect(previewRule!.source).not.toBe('/api/member/resume');
    expect(previewRule!.source).not.toBe('/dashboard/resume');
    expect(rules!.filter((rule) => rule.source === '/api/member/resume/plain-text')).toHaveLength(0);
  });
});
