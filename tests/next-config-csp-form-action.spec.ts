// @vitest-environment node
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

/**
 * Audit 2026-09-20 (WAP-36 CSP surface): a form post to the page's own
 * origin was refused locally when NEXT_PUBLIC_SITE_URL differed from the
 * browser origin. `form-action 'self'` covers the serving origin whatever
 * the configured site URL is; the existing allow-list stays.
 */
describe('Content-Security-Policy form-action', () => {
  it("allows 'self' and keeps the existing allow-list", async () => {
    const headers = (await nextConfig.headers?.()) as HeaderRule[];
    const rule = headers.find((entry) => entry.source === '/(.*)');
    const csp = rule?.headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
    const formAction = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('form-action'));
    expect(formAction).toBeDefined();
    const sources = formAction!.split(/\s+/).slice(1);
    expect(sources).toContain("'self'");
    expect(sources).toContain('https://formspree.io');
  });
});
