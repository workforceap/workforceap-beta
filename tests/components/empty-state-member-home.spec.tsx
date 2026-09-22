import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import MatchedRoles from '@/components/portal/MatchedRoles';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * PR 2 of the empty-state consolidation (KIT_GUIDE §6): the member home
 * surfaces render their empty situations through KitEmptyState with a `kind`,
 * one primary action and `empty.*` copy in every locale — no hand-rolled
 * `<p>` and no raw message keys.
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

describe('member home: matched roles', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  /** Rendered with exactly the messages the (portal) layout ships to the browser. */
  function show(locale: Locale) {
    return render(
      <NextIntlClientProvider locale={locale} messages={pickClientMessageSlice(LOCALES[locale], 'portal')}>
        <MatchedRoles />
      </NextIntlClientProvider>,
    );
  }

  it.each(Object.keys(LOCALES) as Locale[])('%s: no matches yet is a first state with Update profile as the first action', async (locale) => {
    const m = LOCALES[locale];
    fetchMock.mockResolvedValue(json({ jobs: [] }));
    const { container } = show(locale);

    await screen.findByRole('heading', { level: 3, name: m.empty.matches.title });
    const empty = emptyOf(container, 'first');
    expect(empty.dataset.tone).toBe('muted');
    expect(empty.className).toContain('wa-kit-empty--framed');
    expect(within(empty).getByText(m.empty.matches.body)).toBeInTheDocument();
    expect(within(empty).getByRole('link', { name: m.empty.matches.action })).toHaveAttribute('href', '/dashboard/profile');
    const secondary = within(empty).getByRole('link', { name: m.empty.matches.secondary });
    expect(secondary).toHaveAttribute('href', '/dashboard/jobs');
    expect(secondary.className).toContain('wa-kit-cta--ghost');
    expect(empty.textContent).not.toMatch(RAW_KEY);
    expect(screen.queryByText('No matched jobs yet')).toBeNull();
  });

  it.each(Object.keys(LOCALES) as Locale[])('%s: a failed load is an unavailable/danger alert whose Try again refetches', async (locale) => {
    const m = LOCALES[locale];
    fetchMock
      .mockResolvedValueOnce(json({ error: 'nope' }, 500))
      .mockResolvedValueOnce(json({ jobs: [{ id: 'j1', title: 'Help Desk Technician', company: 'Acme', location: 'Austin, TX', locationType: 'onsite', matchPct: 82 }] }));
    const { container } = show(locale);

    const alert = await screen.findByRole('alert');
    expect(alert).toBe(emptyOf(container, 'unavailable'));
    expect(alert.dataset.tone).toBe('danger');
    expect(within(alert).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty.matchesUnavailable.title);
    expect(within(alert).getByText(m.empty.matchesUnavailable.body)).toBeInTheDocument();
    expect(within(alert).getByRole('link', { name: m.empty.matchesUnavailable.secondary })).toHaveAttribute('href', '/dashboard/jobs');
    expect(alert.textContent).not.toMatch(RAW_KEY);
    // Never reads as a confirmed empty result.
    expect(container.querySelector('[data-kind="first"]')).toBeNull();

    fireEvent.click(within(alert).getByRole('button', { name: m.empty.matchesUnavailable.action }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByText('Help Desk Technician');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
