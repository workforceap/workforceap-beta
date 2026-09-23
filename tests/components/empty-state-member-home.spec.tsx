import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * PR 2 of the empty-state consolidation (KIT_GUIDE §6): the member home
 * surfaces render their empty situations through KitEmptyState with a `kind`,
 * one primary action and `empty.*` copy in every locale — no hand-rolled
 * `<p>` and no raw message keys. (The matched-roles panel went with the
 * retired ?ui=legacy home, WAP-195.)
 */

const LOCALES = { en, es, fr, pt } as const;
type Locale = keyof typeof LOCALES;
const RAW_KEY = /\bempty\.[a-zA-Z]+\.[a-zA-Z]+\b/;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function emptyOf(root: HTMLElement | Document, kind: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`.wa-kit-empty[data-kind="${kind}"]`);
  expect(el, `a KitEmptyState with data-kind="${kind}"`).not.toBeNull();
  return el as HTMLElement;
}

describe('member home: application pipeline table (kind first)', () => {
  it.each(Object.keys(LOCALES) as Locale[])('%s: names what appears here and links the first action', (locale) => {
    const m = LOCALES[locale];
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={m}>
        <MemberHomeKit firstName="Sam" pipeline={[]} jobsHref="/dashboard/jobs?from=home" />
      </NextIntlClientProvider>,
    );

    const empty = emptyOf(container, 'first');
    expect(empty.dataset.tone).toBe('muted');
    expect(empty.closest('.wa-kit-card')).not.toBeNull();
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty.activeApplications.title);
    expect(within(empty).getByText(m.empty.activeApplications.body).className).toContain('wa-kit-lede');
    const action = within(empty).getByRole('link', { name: m.empty.activeApplications.action });
    expect(action).toHaveAttribute('href', '/dashboard/jobs?from=home');
    expect(action.className).toContain('wa-kit-cta');
    expect(empty.textContent).not.toMatch(RAW_KEY);
    // The retired one-off sentence is gone in every locale.
    expect(screen.queryByText('Saved and submitted jobs will appear here.')).toBeNull();
  });

  it('keeps the structural change on record: before/after outerHTML of the pipeline card', async () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MemberHomeKit firstName="Sam" pipeline={[]} />
      </NextIntlClientProvider>,
    );
    const card = emptyOf(container, 'first').closest('.wa-kit-card') as HTMLElement;
    await expect(card.outerHTML).toMatchFileSnapshot('../fixtures/empty-state-2/member-home-pipeline.after.html');

    const before = readFileSync(join(__dirname, '../fixtures/empty-state-2/member-home-pipeline.before.html'), 'utf8');
    expect(before).toContain('No active applications');
    expect(before).toContain('Saved and submitted jobs will appear here.');
    expect(before).not.toMatch(/wa-kit-empty-actions|wa-kit-cta/);
    expect(card.outerHTML).toContain('wa-kit-empty-actions');
    expect(card.outerHTML).not.toContain('Saved and submitted jobs will appear here.');
  });
});
