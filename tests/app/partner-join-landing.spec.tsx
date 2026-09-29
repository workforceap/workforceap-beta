/**
 * Public partner landing page `/join/<code>`: partner resolved server-side
 * with the signup lookup plus `status = active`; unknown, inactive or pending
 * partners 404; the page names the partner, discloses what it will see, and
 * every Apply CTA carries `?ref=` (existing capture mechanics).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';

const h = vi.hoisted(() => ({
  partnerFindFirst: vi.fn(),
  locale: 'en',
}));

vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'www.workforceap.org' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { partner: { findFirst: h.partnerFindFirst } } }));
vi.mock('@/lib/tenant/resolveProvisionOrg', () => ({ resolveProvisionOrganizationId: async () => 'org-1' }));
vi.mock('@/lib/platform/programCatalog', () => ({
  getActivePrograms: async () => [
    { slug: 'it-support', name: 'IT Support', category: 'IT', duration: '6 months', certifications: ['Google IT Support'], featured: true, displayOrder: 1, static: undefined },
  ],
}));
vi.mock('@/lib/i18n/server', () => ({ getRequestLocale: async () => h.locale }));
vi.mock('@/app/seo', () => ({
  buildPageMetadataAsync: async (input: { title: string; description: string; path: string; robots?: unknown }) => ({
    title: input.title,
    description: input.description,
    openGraph: { title: input.title, description: input.description, url: input.path },
    robots: input.robots,
  }),
}));
vi.mock('@/components/marketing/TrustStrip', () => ({ default: () => null }));
vi.mock('@/components/marketing/UtmCapture', () => ({ default: () => null }));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => {
    const scope = namespace.split('.').reduce<Record<string, unknown>>((node, part) => node[part] as Record<string, unknown>, messages as never);
    const t = (key: string, values?: Record<string, string>) =>
      String(scope[key]).replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? `{${name}}`);
    t.raw = (key: string) => scope[key];
    return t;
  },
}));

import JoinPage, { generateMetadata } from '@/app/join/[code]/page';

const params = (code: string) => ({ params: Promise.resolve({ code }) });

/** The page returns the async landing server component; resolve it for static rendering. */
async function renderJoin(code: string) {
  const element = (await JoinPage(params(code))) as React.ReactElement<Record<string, unknown>>;
  const render = element.type as (props: Record<string, unknown>) => Promise<React.ReactElement>;
  return renderToStaticMarkup(await render(element.props));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.locale = 'en';
  h.partnerFindFirst.mockResolvedValue({ name: 'Acme Workforce Center', slug: 'acme', referralCode: 'acme-code', partnerType: 'referral' });
});

describe('/join/<code> partner landing page', () => {
  it('looks the partner up with the signup lookup and requires an approved (active) partner', async () => {
    await JoinPage(params('ACME-Code'));
    expect(h.partnerFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        active: true,
        organizationId: 'org-1',
        OR: [{ referralCode: 'acme-code' }, { slug: 'acme-code' }],
        status: 'active',
      },
    }));
  });

  it('404s an unknown, inactive or pending partner (the lookup returns nothing)', async () => {
    h.partnerFindFirst.mockResolvedValue(null);
    await expect(JoinPage(params('inactive-partner'))).rejects.toThrow('NOT_FOUND');
    const meta = await generateMetadata(params('inactive-partner'));
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBeUndefined();
  });

  it('404s a malformed code without querying', async () => {
    await expect(JoinPage(params('<script>'))).rejects.toThrow('NOT_FOUND');
    expect(h.partnerFindFirst).not.toHaveBeenCalled();
  });

  it('names the partner, discloses the restricted view and sends every Apply CTA to /apply?ref=', async () => {
    const html = await renderJoin('acme-code');
    expect(html).toContain('Acme Workforce Center invited you to WorkforceAP');
    expect(html).toContain('You were referred by Acme Workforce Center.');
    expect(html).toContain('will not see your email');
    const applyLinks = [...html.matchAll(/href="([^"]*\/apply[^"]*)"/g)].map((m) => m[1]);
    expect(applyLinks.length).toBeGreaterThanOrEqual(2);
    for (const href of applyLinks) expect(href).toBe('/en/apply?ref=acme-code');
    expect(html).toContain('IT Support');
    expect(html).toContain('/programs/it-support?ref=acme-code');
  });

  it('keeps the visitor locale on the CTA', async () => {
    h.locale = 'es';
    const html = await renderJoin('acme-code');
    expect(html).toContain('href="/es/apply?ref=acme-code"');
  });

  it('builds share metadata (title, description, OG) for the partner, not indexed', async () => {
    const meta = await generateMetadata(params('acme-code'));
    expect(meta.title).toBe('Apply to WorkforceAP with Acme Workforce Center');
    expect(String(meta.description)).toContain('Acme Workforce Center invites you');
    expect(meta.openGraph).toMatchObject({ url: '/join/acme-code' });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});
