import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PartnerImpactHeader from '@/components/partner/PartnerImpactHeader';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const PAGE_HEADER_ROUTES = [
  'app/(portal)/partner/attention/page.tsx',
  'app/(portal)/partner/referred-members/page.tsx',
  'app/(portal)/partner/messages/page.tsx',
  'app/(portal)/partner/resources/page.tsx',
  'app/(portal)/partner/settings/page.tsx',
] as const;

describe('partner portal PageHeader / KitEmptyState contract', () => {
  it.each(PAGE_HEADER_ROUTES)('%s mounts one shared PageHeader (jobs pattern)', (rel) => {
    const source = read(rel);
    expect(source.match(/<PageHeader[\s>]/g)?.length ?? 0).toBe(1);
    expect(source).toContain('PortalPageFrame');
    // Page chrome must not use SectionHeader as the route h1 substitute.
    expect(source).not.toMatch(/<SectionHeader[\s\n]/);
  });

  it('milestones keeps one Impact h1 and a named view section', () => {
    const html = renderToStaticMarkup(createElement(PartnerImpactHeader, {
      activeView: 'milestones', title: 'Milestones',
      copy: { title: 'Impact', description: 'Referral progress', navLabel: 'Impact views', views: { outcomes: 'Outcomes', milestones: 'Milestones', exports: 'Exports' } },
    }));
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe('Impact');
    expect(document.querySelector('h2')?.textContent).toBe('Milestones');
    expect(document.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Milestones');
  });

  it('referred-members keeps PageHeader outside mobile/desktop body splits', () => {
    const source = read('app/(portal)/partner/referred-members/page.tsx');
    const headerIdx = source.indexOf('<PageHeader');
    const mobileIdx = source.indexOf('wa-block md:wa-hidden');
    const desktopIdx = source.indexOf('wa-hidden md:wa-block');
    expect(headerIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeLessThan(mobileIdx);
    expect(headerIdx).toBeLessThan(desktopIdx);
  });

  it('messages empty branch uses KitEmptyState', () => {
    const source = read('app/(portal)/partner/messages/page.tsx');
    expect(source).toContain('KitEmptyState');
    expect(source).toContain('noMessagesYetTitle');
  });

  it('outcomes keeps one Impact h1 and a named view section', () => {
    const html = renderToStaticMarkup(createElement(PartnerImpactHeader, {
      activeView: 'outcomes', title: 'Outcomes',
      copy: { title: 'Impact', description: 'Referral progress', navLabel: 'Impact views', views: { outcomes: 'Outcomes', milestones: 'Milestones', exports: 'Exports' } },
    }));
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe('Impact');
    expect(document.querySelector('h2')?.textContent).toBe('Outcomes');
    expect(document.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Outcomes');
  });
});
