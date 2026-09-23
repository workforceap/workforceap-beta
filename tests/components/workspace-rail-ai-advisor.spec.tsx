import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceShell from '@/components/portal/WorkspaceShell';
import { MEMBER_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

/**
 * WAP-197 item 5 (Mike, 2026-09-23: "Keep ai advisor"): the /dashboard/counselor
 * rail row is "AI Advisor". It had no translateLabel entry, and the nearest
 * key, nav.aiCounselor, is the assistant's name ("Lilley"), so the row now reads
 * its own nav.aiAdvisor key in every locale.
 */
const location = vi.hoisted(() => ({ pathname: '/dashboard/counselor' }));
vi.mock('next/navigation', () => ({ usePathname: () => location.pathname }));
vi.mock('@/components/super-admin-view-switcher', () => ({ default: () => null, useIsSuperAdmin: () => false }));
vi.mock('@/components/portal/PortalHeaderActions', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalRoleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberPortalTopNav', () => ({ default: () => null }));
vi.mock('@/components/portal/GlobalSearch', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('@/components/portal/LanguageToggle', () => ({ default: () => <span>Language</span> }));
vi.mock('@/components/theme/ThemeSelector', () => ({ default: () => null }));
vi.mock('@/components/portal/UnreviewedLocaleBanner', () => ({ default: () => null }));
vi.mock('@/components/portal/SignOutButton', () => ({
  SignOutButton: ({ className, children }: { className?: string; children?: React.ReactNode }) => (
    <button type="button" className={className}>{children ?? 'Sign out'}</button>
  ),
}));
vi.mock('@/hooks/useWorkspaceMobileScrollChrome', () => ({ useWorkspaceMobileScrollChrome: () => {} }));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const LOCALES = { en, es, fr, pt } as const;

function railRow(locale: keyof typeof LOCALES) {
  location.pathname = locale === 'en' ? '/dashboard/counselor' : `/${locale}/dashboard/counselor`;
  const { container } = render(
    <NextIntlClientProvider locale={locale} messages={LOCALES[locale]}>
      <WorkspaceShell portalRole="member" navItems={MEMBER_PORTAL_NAV_ITEMS} workspaceLabel="Member portal" contextLabel="Account" readOnlyAudit>
        <h1>AI Advisor</h1>
      </WorkspaceShell>
    </NextIntlClientProvider>,
  );
  return container.querySelector('.workspace-sidebar a[href="/dashboard/counselor"]');
}

describe('AI Advisor rail row (WAP-197)', () => {
  it('every locale carries nav.aiAdvisor, and English keeps "AI Advisor"', () => {
    expect(en.nav.aiAdvisor).toBe('AI Advisor');
    for (const [locale, messages] of Object.entries(LOCALES)) {
      expect(typeof messages.nav.aiAdvisor, locale).toBe('string');
      expect(messages.nav.aiAdvisor.trim(), locale).not.toBe('');
      expect(messages.nav.aiAdvisor, locale).not.toBe(messages.nav.aiCounselor);
    }
  });

  it.each(Object.keys(LOCALES) as Array<keyof typeof LOCALES>)('%s: the row reads nav.aiAdvisor, not the assistant name', (locale) => {
    const row = railRow(locale);
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent(LOCALES[locale].nav.aiAdvisor);
    expect(row).not.toHaveTextContent(LOCALES[locale].nav.aiCounselor);
    if (locale !== 'en') expect(row).not.toHaveTextContent('AI Advisor');
  });
});
