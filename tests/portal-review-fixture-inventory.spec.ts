import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTAL_REVIEW_FIXTURES, PORTAL_REVIEW_WALKS } from '@/lib/dev/portalReviewFixtures';

function pageRoutes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? pageRoutes(file) : entry.name === 'page.tsx'
      ? ['/' + path.relative(process.cwd(), path.dirname(file)).replaceAll('\\', '/').replace(/^app\//, '')]
      : [];
  });
}

describe('portal fixture discoverability', () => {
  it('covers every member/staff fixture source exactly once', () => {
    const sourceRoutes = ['app/dev/member', 'app/dev/staff'].flatMap(pageRoutes).sort();
    const catalogRoutes = PORTAL_REVIEW_FIXTURES.map((item) => item.route).sort();
    expect(catalogRoutes).toEqual(sourceRoutes);
    expect(new Set(catalogRoutes).size).toBe(catalogRoutes.length);
  });

  it('keeps named scenarios within their owning fixture and declares action limits', () => {
    for (const item of PORTAL_REVIEW_FIXTURES) {
      expect(item.canTry.trim().length, item.route).toBeGreaterThan(10);
      expect(item.blocked.trim().length, item.route).toBeGreaterThan(10);
      expect(new Set(item.scenarios.map((scenario) => scenario.href)).size, item.route).toBe(item.scenarios.length);
      for (const scenario of item.scenarios) {
        const url = new URL(scenario.href, 'https://preview.example.test');
        expect(url.origin).toBe('https://preview.example.test');
        expect(url.pathname).toBe(item.route);
        expect(url.search.length).toBeGreaterThan(1);
        expect(scenario.title.length).toBeGreaterThan(0);
      }
    }
    expect(PORTAL_REVIEW_FIXTURES.find((item) => item.route === '/dev/staff/people')?.availability).toBe('local-development');
  });

  it('builds walkthroughs only from cataloged screens and explicit scenarios', () => {
    const destinations = new Set(PORTAL_REVIEW_FIXTURES.flatMap((item) => [item.route, ...item.scenarios.map((scenario) => scenario.href)]));
    for (const walk of PORTAL_REVIEW_WALKS) {
      expect(walk.description.length).toBeGreaterThan(10);
      for (const step of walk.steps) expect(destinations.has(step.href), `${walk.title}: ${step.href}`).toBe(true);
    }
  });
});
