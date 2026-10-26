import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/portal/kit', () => ({
  CardHead: ({ title }: { title: string }) => <h2>{title}</h2>,
  KitEmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  SegmentedProgress: ({ pct, label }: { pct: number; label: string }) => <div role="progressbar" aria-label={label} aria-valuenow={pct} />,
  StageTrack: ({ index }: { index: number }) => <span data-stage-index={index} />,
  StatusTag: ({ children, tone }: { children: React.ReactNode; tone: string }) => <span data-tone={tone}>{children}</span>,
  colorVar: (color: string) => color,
}));

import PartnerMilestonesView from '@/components/partner/PartnerMilestonesView';
import PartnerMilestonesMobile from '@/components/partner/PartnerMilestonesMobile';

/**
 * /dev/staff/partner-impact?view=milestones server-renders both feeds from
 * initialMilestones. The dates used toLocaleString()/toLocaleDateString(), so a
 * UTC server and a browser in another timezone printed different calendar days,
 * React reported a hydration mismatch (#418) and client-rendered the root,
 * which dropped html.dark. They now print in the portal timezone
 * (America/Chicago), whatever the runtime timezone is.
 */

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  vi.unstubAllGlobals();
});

// 03:30 UTC on 20 Oct is still 19 Oct in Chicago (10:30 PM CDT) and in New York.
const at = '2026-10-20T03:30:00.000Z';
const milestones = [
  { id: 'cert', kind: 'certification', label: 'Earned certificate', memberId: 'm3', memberName: 'Certified Member', at },
  { id: 'pending', kind: 'placement_pending', label: 'Placement reported', memberId: 'm1', memberName: 'Pending Member', at },
];

const cases = [
  { name: 'desktop feed', node: <PartnerMilestonesView initialMilestones={milestones} />, expected: 'Oct 19, 2026, 10:30 PM CDT' },
  { name: 'mobile feed', node: <PartnerMilestonesMobile initialMilestones={milestones} />, expected: 'Oct 19, 2026' },
];

describe('partner milestones dates', () => {
  it.each(cases)('$name hydrates without a mismatch when the browser timezone differs from the server', async ({ node, expected }) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ milestones })));
    process.env.TZ = 'UTC';
    const container = document.createElement('div');
    container.innerHTML = renderToString(node);
    document.body.appendChild(container);
    expect(container.textContent).toContain(expected);

    process.env.TZ = 'Pacific/Kiritimati';
    const recoverableErrors = vi.fn();
    let root: Root | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, node, { onRecoverableError: recoverableErrors }); });
      expect(recoverableErrors).not.toHaveBeenCalled();
      expect(container.textContent).toContain(expected);
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });
});
