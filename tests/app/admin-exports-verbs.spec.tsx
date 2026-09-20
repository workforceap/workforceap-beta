import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

/**
 * Admin audit §6.6: /admin/exports uses one verb per row type — "Download"
 * for file rows (with a real `download` link), "Open" only for in-portal
 * pages — and one icon treatment (a neutral kit chip with a lucide glyph on
 * kit tokens). No Material Symbols glyph, no hex, no legacy palette in any
 * rendered style attribute, on either the kit grid or the `?ui=legacy` view.
 */

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'admin-1' })) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(async () => ({ ok: true, organizationId: 'org-a' })),
  withAdminPageScope: vi.fn(async (_scope: unknown, fn: (db: unknown) => unknown) =>
    fn({ user: { findMany: async () => [] } }),
  ),
  inheritUserOrg: vi.fn(),
  inheritMemberOrg: vi.fn(),
  inheritLeaderOrg: vi.fn(),
  inheritInvitedByOrg: vi.fn(),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => {
    const value = (en.admin as unknown as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : key;
  },
}));
vi.mock('@/app/admin/exports/AdminExportForm', () => ({ default: () => <form data-export-form /> }));
vi.mock('@/components/admin/EligibilityDatasheetPanel', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@astryxdesign/core/Token', () => ({
  Token: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock('@astryxdesign/core/EmptyState', () => ({ EmptyState: () => null }));

import AdminExportsPage from '@/app/admin/exports/page';

async function renderPage(ui?: string): Promise<Document> {
  const html = renderToStaticMarkup(await AdminExportsPage({ searchParams: Promise.resolve(ui ? { ui } : {}) }));
  const doc = document.implementation.createHTMLDocument('exports');
  doc.body.innerHTML = html;
  return doc;
}

function assertKitTokensOnly(doc: Document) {
  expect(doc.querySelector('.material-symbols-outlined')).toBeNull();
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[style]'))) {
    const style = el.getAttribute('style') ?? '';
    const where = `<${el.tagName.toLowerCase()} class="${el.className}">`;
    expect(style, where).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(style, where).not.toMatch(/rgba?\(/);
    expect(style, where).not.toMatch(/--color-|--surface-container|--outline-variant/);
  }
}

describe('/admin/exports?ui=legacy — one verb, one icon treatment', () => {
  it('every file row says Download and is a real download link', async () => {
    const doc = await renderPage('legacy');
    const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('[data-export-action="download"]'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/api/admin/funder-program-summary',
      '/api/admin/programs/export-twc',
    ]);
    for (const link of links) {
      expect(link.hasAttribute('download')).toBe(true);
      expect(link.textContent?.trim()).toMatch(/^Download /);
      expect(link.querySelector('svg')?.getAttribute('class')).toMatch(/lucide/);
    }
    expect(links[0].textContent?.trim()).toBe(en.admin.exportFunderCsvDownload);

    // No competing verb on the legacy view: nothing says "Open …" or "Export …".
    const actionable = Array.from(doc.querySelectorAll('a, button')).map((el) => el.textContent?.trim() ?? '');
    expect(actionable.filter((text) => /^(Open|Export)\b/.test(text))).toEqual([]);
  });

  it('every section icon is the same neutral kit chip with a lucide glyph', async () => {
    const doc = await renderPage('legacy');
    const sections = Array.from(doc.querySelectorAll<HTMLElement>('[data-export-section]'));
    expect(sections.map((s) => s.dataset.exportSection)).toEqual([
      'member-training-report',
      'funder-program-summary',
      'program-catalog',
    ]);
    const chips = Array.from(doc.querySelectorAll<HTMLElement>('.wa-kit-tone-icon'));
    // Three section headers + the three explainer tiles.
    expect(chips).toHaveLength(6);
    const classNames = new Set(chips.map((chip) => chip.className));
    expect(classNames.size).toBe(1);
    for (const chip of chips) {
      expect(chip.getAttribute('style')).toBeNull();
      expect(chip.querySelector('svg')?.getAttribute('class')).toMatch(/lucide/);
    }
    for (const section of sections) expect(section.classList.contains('wa-kit-card')).toBe(true);
    assertKitTokensOnly(doc);
  });
});

describe('/admin/exports kit grid — verb follows the row type', () => {
  it('says Open for in-portal pages and Download for file endpoints', async () => {
    const doc = await renderPage();
    const tiles = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a.wa-kit-card'));
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    for (const tile of tiles) {
      const href = tile.getAttribute('href') ?? '';
      const verb = tile.lastElementChild?.textContent?.trim();
      expect(verb, href).toBe(href.includes('ui=legacy') ? 'Open' : 'Download');
    }
    expect(doc.querySelector('.material-symbols-outlined')).toBeNull();
  });
});
