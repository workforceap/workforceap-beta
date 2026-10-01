import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import LeaderDashboardPage from '@/app/(portal)/leader/dashboard/page';
import { statusToneToKitTone } from '@/lib/ui/statusToneAdapters';

/**
 * WAP-135: the leader roster was the fourth rendering of a member status and
 * the last consumer of the `StatusTone` vocabulary. It now speaks `KitTone`
 * and paints with the kit's `StatusTag`. The four labels are unchanged; only
 * the tone names and the rendering moved.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/leader/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

const member = (id: string, over: Record<string, unknown>) => ({
  user: {
    id,
    fullName: `Member ${id}`,
    email: `${id}@example.invalid`,
    enrolledProgram: null,
    assessmentCompleted: false,
    interviewEligible: false,
    placementRecord: null,
    ...over,
  },
  joinedAt: '2026-01-05T00:00:00.000Z',
  status: 'active',
});

/** One member per branch of `memberStatusTone`, in the order the table renders them. */
const EXPECTED: Array<{ label: string; tone: string }> = [
  { label: 'Placed', tone: 'ok' },
  { label: 'Interview ready', tone: 'info' },
  { label: 'Assessed', tone: 'warn' },
  { label: 'New', tone: 'muted' },
];

const chapter = {
  id: 'chapter-1',
  name: 'Austin Chapter',
  city: 'Austin',
  state: 'TX',
  meetingSchedule: null,
  meetingLocation: null,
  members: [
    member('placed', { placementRecord: { placedAt: '2026-08-01T00:00:00.000Z', employerName: 'Acme' }, assessmentCompleted: true, interviewEligible: true }),
    member('interview', { interviewEligible: true, assessmentCompleted: true }),
    member('assessed', { assessmentCompleted: true }),
    member('new', {}),
  ],
  meetings: [],
  curriculumItems: [],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderLeaderDashboard() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(chapter), { status: 200, headers: { 'content-type': 'application/json' } })));
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LeaderDashboardPage />
    </NextIntlClientProvider>,
  );
  return within(await screen.findByRole('table'));
}

describe('leader chapter roster status chips', () => {
  it('renders every status as a kit StatusTag on the kit tone, with the labels unchanged', async () => {
    const table = await renderLeaderDashboard();
    const rows = table.getAllByRole('row').slice(1);
    // Assert the roster really rendered before reading tones off it — a query
    // that stops matching would make the per-row checks vacuous.
    expect(rows).toHaveLength(EXPECTED.length);

    const tags = rows.map((row) => row.querySelector<HTMLElement>('.wa-kit-tag'));
    expect(tags.filter(Boolean)).toHaveLength(EXPECTED.length);
    tags.forEach((tag, i) => {
      expect(tag!.textContent).toBe(EXPECTED[i].label);
      expect(tag!.classList.contains(`wa-kit-tag--${EXPECTED[i].tone}`)).toBe(true);
    });
  });

  it('paints no hand-built chip: the status cell carries no inline background or border colour', async () => {
    const table = await renderLeaderDashboard();
    const cells = table.getAllByRole('cell').filter((cell) => cell.querySelector('.wa-kit-tag'));
    expect(cells).toHaveLength(EXPECTED.length);
    for (const cell of cells) {
      for (const el of cell.querySelectorAll<HTMLElement>('[style]')) {
        expect(el.getAttribute('style') ?? '').not.toMatch(/background|border(-|:)/);
      }
    }
  });

  it('uses exactly the tones the StatusTone adapter maps the old vocabulary onto', () => {
    // The chips must not have drifted from the legacy meanings while moving.
    expect(EXPECTED.map((e) => e.tone)).toEqual(
      (['success', 'info', 'warning', 'neutral'] as const).map(statusToneToKitTone),
    );
  });
});
