import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';
import AtRiskDashboard from '@/components/portal/counselor/AtRiskDashboard';
import type { AtRiskMember } from '@/lib/member/atRiskRow';

vi.mock('next/navigation', () => ({ usePathname: () => '/dev/test', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalInlineSpinner', () => ({ PortalInlineSpinner: () => <span aria-hidden="true" /> }));

/**
 * The "last activity" date is server-rendered. It used toLocaleDateString(),
 * so a UTC server and a browser in another timezone printed different calendar
 * dates, React reported a hydration mismatch (#418) and client-rendered the
 * root, which dropped html.dark on /dev/staff/counselor-atrisk. The date now
 * goes through the shared formatDate (lib/i18n/date): the active app locale and
 * the fixed portal zone, America/Chicago (PORTAL_TIMEZONE, the zone every other
 * portal date uses), so both sides print the same text whatever the runtime's
 * own zone is. 02:00 UTC on 9 Oct is 21:00 CDT on 8 Oct, hence "Oct 8, 2026".
 */

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const member: AtRiskMember = {
  userId: 'u1', alertId: 'alert-u1', name: 'Member One', email: 'u1@example.invalid', phone: null,
  score: 75, riskLevel: 'CRITICAL', status: 'open', factors: [], enrolledProgram: null,
  enrolledAt: null, memberSince: '2026-01-01T00:00:00Z', profile: null,
  alertCreatedAt: '2026-09-01T00:00:00Z', alertUpdatedAt: '2026-09-01T00:00:00Z',
  // 02:00 UTC on 9 Oct is still 8 Oct in New York and in Chicago (CDT, UTC-5).
  lastActivityAt: '2026-10-09T02:00:00Z',
};

const markupFor = (locale: 'en' | 'es', row: AtRiskMember = member) => (
  <NextIntlClientProvider locale={locale} messages={pickClientMessageSlice(en, 'portal')}>
    <AtRiskDashboard initialMembers={[row]} />
  </NextIntlClientProvider>
);
const markup = markupFor('en');

describe('AtRiskDashboard last-activity date', () => {
  it('hydrates without a mismatch when the browser timezone differs from the server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [] })));
    process.env.TZ = 'UTC';
    const container = document.createElement('div');
    container.innerHTML = renderToString(markup);
    document.body.appendChild(container);
    expect(container.textContent).toContain('last activity Oct 8, 2026');

    process.env.TZ = 'America/New_York';
    const recoverableErrors = vi.fn();
    let root: Root | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, markup, { onRecoverableError: recoverableErrors }); });
      expect(recoverableErrors).not.toHaveBeenCalled();
      expect(container.textContent).toContain('last activity Oct 8, 2026');
    } finally {
      await act(async () => { root?.unmount(); });
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it('prints the calendar day in the portal zone, not UTC and not the runtime zone', () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [] })));
    // 04:30 UTC on 9 Oct is 9 Oct in UTC (and 00:30 in New York, 13:30 in Tokyo)
    // but 23:30 CDT on 8 Oct in Chicago, so only the pinned zone prints Oct 8.
    process.env.TZ = 'Asia/Tokyo';
    const container = document.createElement('div');
    container.innerHTML = renderToString(markupFor('en', { ...member, lastActivityAt: '2026-10-09T04:30:00Z' }));
    expect(container.textContent).toContain('last activity Oct 8, 2026');
    vi.unstubAllGlobals();
  });

  it('prints the date in the active app locale and still hydrates without a mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [] })));
    const expected = new Date(member.lastActivityAt!).toLocaleDateString('es-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric',
    });
    const spanish = markupFor('es');
    process.env.TZ = 'UTC';
    const container = document.createElement('div');
    container.innerHTML = renderToString(spanish);
    document.body.appendChild(container);
    expect(container.textContent).toContain(`last activity ${expected}`);
    expect(container.textContent).not.toContain('Oct 8, 2026');

    process.env.TZ = 'America/New_York';
    const recoverableErrors = vi.fn();
    let root: Root | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, spanish, { onRecoverableError: recoverableErrors }); });
      expect(recoverableErrors).not.toHaveBeenCalled();
      expect(container.textContent).toContain(`last activity ${expected}`);
    } finally {
      await act(async () => { root?.unmount(); });
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
