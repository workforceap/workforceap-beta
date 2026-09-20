import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { isWioaPortalAvailable } from './wioaAvailability';

vi.mock('@/lib/analytics/events', () => ({ trackLearningHubNavigate: vi.fn() }));

const WIOA_HREF = '/dashboard/learning/wioa-qualification';

/** Re-evaluates the discovery surfaces with the flag as the build would inline it. */
async function loadSurfaces(flag: string | undefined) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_WIOA_ENABLED', flag);
  const [nav, i18nNav, cards] = await Promise.all([
    import('@/lib/nav/portalNav'),
    import('@/lib/nav/portalNav.i18n'),
    import('@/components/portal/LearningHubDestinationCards'),
  ]);
  return {
    legacyHrefs: nav.MEMBER_PORTAL_NAV_ITEMS.map((item) => item.href),
    i18nHrefs: i18nNav.MEMBER_PORTAL_NAV_ITEMS_I18N.map((item) => item.href),
    LearningHubDestinationCards: cards.default,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('isWioaPortalAvailable', () => {
  it('is available by default', () => {
    expect(isWioaPortalAvailable(undefined)).toBe(true);
    expect(isWioaPortalAvailable('')).toBe(true);
    expect(isWioaPortalAvailable('1')).toBe(true);
  });

  it('hides WIOA from portal navigation and discovery only on an explicit zero', () => {
    expect(isWioaPortalAvailable('0')).toBe(false);
  });
});

describe('member discovery surfaces share the default-on guard', () => {
  it.each([undefined, '', '1'])('flag %j shows WIOA in both nav catalogs and the Learning Hub cards', async (flag) => {
    const { legacyHrefs, i18nHrefs, LearningHubDestinationCards } = await loadSurfaces(flag);
    expect(legacyHrefs).toContain(WIOA_HREF);
    expect(i18nHrefs).toContain(WIOA_HREF);
    render(createElement(LearningHubDestinationCards));
    expect(screen.getByRole('link', { name: /Funding eligibility check/ })).toHaveAttribute('href', WIOA_HREF);
  });

  it('flag "0" removes WIOA from both nav catalogs and the Learning Hub cards', async () => {
    const { legacyHrefs, i18nHrefs, LearningHubDestinationCards } = await loadSurfaces('0');
    expect(legacyHrefs).not.toContain(WIOA_HREF);
    expect(i18nHrefs).not.toContain(WIOA_HREF);
    render(createElement(LearningHubDestinationCards));
    expect(screen.queryByRole('link', { name: /Funding eligibility check/ })).toBeNull();
  });
});

it('.env.example documents the default-on switch', () => {
  const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
  expect(envExample).toMatch(/^NEXT_PUBLIC_WIOA_ENABLED=1$/m);
  expect(envExample).toMatch(/navigation and Learning Hub discovery/);
});
