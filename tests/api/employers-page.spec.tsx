import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { render } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';

// ─── Mocks ───
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/employers'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/analytics/events', () => ({
  trackCtaExperimentClick: vi.fn(),
  trackCtaExperimentExposure: vi.fn(),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace: string) => createTranslator({ locale: 'en', messages: messages as any, namespace })),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(async () => ({ id: 'employer-user-1' })),
}));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: vi.fn(async () => ({ employerId: 'emp-1' })) }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: vi.fn(async () => '/employer/unlinked') }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    employer: {
      findUnique: vi.fn(async () => ({
        tier: 'growth',
        stripeSubscriptionStatus: null,
        stripeCustomerId: null,
        _count: { jobs: 2 },
      })),
    },
  },
}));

// ─── Imports after mocks ───
import EmployersHeroCtaExperiment from '@/components/marketing/employers/EmployersHeroCtaExperiment';
import EmployerSignupPage from '@/app/employers/signup/page';
import EmployerLoiForm from '@/components/employer/EmployerLoiForm';
import EmployerBillingPage from '@/app/(portal)/employer/billing/page';

const KNOWN_PRICE_POINTS = /\$\s?(499|999)\b/;
const PER_MONTH_PRICING = /\$\s?[\d,]+\s?\/\s?mo/i;

function withIntl(node: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={messages as any}>
      {node}
    </NextIntlClientProvider>
  );
}

describe('Employers Page — honest trust presentation', () => {
  // NOTE: the Next.js app/employers/page.tsx was deleted in the Astro
  // marketing migration (PR #2073) — /employers is now served by
  // marketing/src/pages/employers.astro. The checks below render the pieces
  // that still live in this repo's Next app and assert on their output.

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the orphaned employer pricing message namespace deleted', () => {
    // The old `marketing.employers` namespace carried the $499/$999 tier copy
    // with zero render call sites; it must stay deleted so stale pricing
    // cannot resurface through a translation file.
    const parsed = messages as { marketing?: { employers?: Record<string, string> } };
    expect(parsed.marketing?.employers).toBeUndefined();
  });

  it('shows no employer pricing on the Astro employers page (CEO decision 2026-07-02)', () => {
    const astro = readFileSync(path.resolve(__dirname, '../../marketing/src/pages/employers.astro'), 'utf-8');
    expect(astro).not.toMatch(KNOWN_PRICE_POINTS);
    expect(astro).not.toMatch(PER_MONTH_PRICING);
  });

  it('renders no employer pricing on the signup page, the LOI form or the billing page', async () => {
    const rendered = {
      'employer signup page': render(withIntl(<EmployerSignupPage />)).container,
      'employer LOI form': render(withIntl(<EmployerLoiForm />)).container,
      'employer billing page': render(
        withIntl((await EmployerBillingPage({ searchParams: Promise.resolve({}) })) as React.ReactElement),
      ).container,
    };
    for (const [surface, container] of Object.entries(rendered)) {
      const text = container.textContent ?? '';
      expect(text.length, `${surface} rendered nothing`).toBeGreaterThan(0);
      expect(text, `${surface} must not show a price`).not.toMatch(KNOWN_PRICE_POINTS);
      expect(text, `${surface} must not show per-month pricing`).not.toMatch(PER_MONTH_PRICING);
      expect(container.innerHTML, `${surface} must not show a price in markup`).not.toMatch(KNOWN_PRICE_POINTS);
    }
    // The billing page still names the tiers (without amounts) so plans stay visible.
    expect(rendered['employer billing page'].textContent).toContain('Growth');
  });

  it('uses a forward icon on the hero CTA instead of a calendar booking cue', () => {
    const { container } = render(
      <EmployersHeroCtaExperiment controlLabel="Get started" variantALabel="Talk to us" href="/employers/signup" />,
    );

    // WAP-110: the hero CTA draws a Lucide arrow, not an icon-font ligature.
    const icon = container.querySelector('svg.employers-hero-cta__icon');
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute('class')).toMatch(/lucide-arrow-right/);
    expect(icon!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.material-symbols-outlined')).toBeNull();
    expect(container.querySelector('[class*="lucide-calendar"]')).toBeNull();
    expect(container.textContent).not.toMatch(/calendar_today/);
    // Either experiment variant renders its label next to the arrow.
    expect(['Get started', 'Talk to us']).toContain(container.querySelector('.employers-hero-cta__label')!.textContent);
  });
});
