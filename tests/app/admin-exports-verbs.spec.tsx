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
import { ReportingExportsSection } from '@/app/admin/reporting/sections/ExportsSection';

/**
 * `?ui=legacy` renders the export workspace on /admin/exports itself; the kit
 * card grid is the Exports tab of the reporting hub (admin audit 2026-09-19,
 * §6.1), so the grid assertions render that moved section.
 */
async function renderPage(ui?: string): Promise<Document> {
  const html = renderToStaticMarkup(
    ui
      ? await AdminExportsPage({ searchParams: Promise.resolve({ ui }) })
      : await ReportingExportsSection(),
  );
  const doc = document.implementation.createHTMLDocument('exports');
  doc.body.innerHTML = html;
  return doc;
}

describe('/admin/exports forwards to the reporting hub', () => {
  it('redirects the default view to the Exports tab and keeps ?ui=legacy on the route', async () => {
    await expect(AdminExportsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/admin/reporting?tab=exports');
    const doc = await renderPage('legacy');
    expect(doc.querySelector('[data-export-form]')).not.toBeNull();
  });
});

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

describe('reporting hub Exports tab (kit grid) — verb follows the row type', () => {
  it('says Open for in-portal pages and Download for file endpoints, with matching icons', async () => {
    const doc = await renderPage();
    const tiles = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a.wa-kit-card'));
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    const kinds = new Set<string>();
    for (const tile of tiles) {
      const href = tile.getAttribute('href') ?? '';
      const action = tile.lastElementChild as HTMLElement;
      const verb = action.textContent?.trim() ?? '';
      const icon = action.querySelector('svg')?.getAttribute('class') ?? '';
      const kind = tile.dataset.exportAction ?? '';
      kinds.add(kind);
      if (href.includes('ui=legacy')) {
        expect(kind, href).toBe('open');
        expect(verb, href).toBe('Open');
        expect(tile.hasAttribute('download'), href).toBe(false);
        expect(icon, href).toMatch(/lucide-arrow-right/);
      } else {
        expect(kind, href).toBe('download');
        expect(verb, href).toMatch(/^Download\b/);
        expect(tile.hasAttribute('download'), href).toBe(true);
        expect(icon, href).toMatch(/lucide-download/);
        expect(tile.getAttribute('target')).toBeNull();
      }
    }
    expect([...kinds].sort()).toEqual(['download', 'open']);
    expect(doc.querySelector('.material-symbols-outlined')).toBeNull();
  });

  it('reuses the translated funder-summary download label on the funder CSV tile', async () => {
    const doc = await renderPage();
    const funder = doc.querySelector<HTMLAnchorElement>('a.wa-kit-card[href="/api/admin/funder-program-summary"]');
    expect(funder).not.toBeNull();
    expect(funder?.lastElementChild?.textContent?.trim()).toBe(en.admin.exportFunderCsvDownload);
  });

  it('is the only list of the outcomes snapshot files', async () => {
    const doc = await renderPage();
    const hrefs = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a.wa-kit-card')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining([
      '/api/admin/outcomes/snapshot?period=all-time&format=csv',
      '/api/admin/outcomes/snapshot?period=all-time&format=pdf',
    ]));
  });
});
