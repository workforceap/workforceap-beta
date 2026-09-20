import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Counselor audit §4.4 (deferred by #2403): the roster's "hot member queue"
 * renders as kit cards on the `.wa-kit-tone--warn` hook — the tone lives on
 * the container and paints the icon chip, the kicker and each row's edge;
 * names and times stay neutral. No Material Symbols glyph, no legacy amber
 * palette (unmapped in dark mode) in any rendered style attribute.
 */

const db = vi.hoisted(() => {
  const overrides: Record<string, (args: unknown) => Promise<unknown>> = {};
  const defaultFor = (method: string) => async () =>
    method === 'count' ? 0 : method === 'findMany' || method === 'groupBy' ? [] : null;
  const prisma = new Proxy({} as Record<string, unknown>, {
    get: (_t, model: string) =>
      new Proxy({}, {
        get: (_m, method: string) => (args: unknown) =>
          (overrides[`${model}.${method}`] ?? defaultFor(method))(args),
      }),
  });
  return { prisma, overrides };
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'staff-1' })) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => false), isCounselor: vi.fn(async () => true) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/lib/counselor/counselorStudentsRoster', () => ({
  loadCounselorRosterRiskAndActivity: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/attention/loadFacts', () => ({ loadAttentionFacts: vi.fn(async () => []) }));
vi.mock('@/lib/attention/evaluate', () => ({
  buildAttentionQueue: vi.fn(() => ({ members: [], onTrack: [], totals: {} })),
  selectByReason: vi.fn(() => []),
}));
vi.mock('@/lib/counselor/rosterStats', () => ({
  ROSTER_STAT_LOOKBACK_DAYS: 30,
  buildCounselorRosterStats: vi.fn(() => []),
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalEmptyState', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/portal/counselor/CounselorStudentsRosterClient', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/CounselorRosterStats', () => ({ default: () => null }));

import CounselorStudentsPage from '@/app/(portal)/counselor/students/page';

const MEMBER = {
  id: 'member-1',
  fullName: 'Fixture Member',
  email: 'fixture@example.com',
  enrolledProgram: null,
  courseEnrollments: [],
  programInterest: null,
  assessmentScorePct: null,
  wioaReviewStatus: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  memberProgramProgress: [],
};

const HOT_ACTION = {
  id: 'nba-1',
  memberId: 'member-1',
  title: 'Completed IT Support',
  description: 'Book the placement call this week.',
  ctaLabel: 'Open member',
  ctaHref: '/counselor/students/member-1',
  createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  member: { id: 'member-1', fullName: 'Fixture Member', enrolledProgram: null, programInterest: null },
};

async function renderPage(): Promise<Document> {
  const html = renderToStaticMarkup(
    await CounselorStudentsPage({ searchParams: Promise.resolve({}) }),
  );
  const doc = document.implementation.createHTMLDocument('roster');
  doc.body.innerHTML = html;
  return doc;
}

const OTHER_TONES = ['ok', 'alert', 'danger', 'info', 'muted'] as const;

describe('counselor roster hot member queue (kit tones)', () => {
  beforeEach(() => {
    for (const key of Object.keys(db.overrides)) delete db.overrides[key];
    db.overrides['counselor.findFirst'] = async () => ({ id: 'counselor-1', userId: 'staff-1' });
    db.overrides['counselorAssignment.findMany'] = async () => [{ id: 'assign-1', memberId: 'member-1', member: MEMBER }];
    db.overrides['memberNextBestAction.findMany'] = async () => [HOT_ACTION];
  });

  it('renders one warn-toned kit card per width with a lucide icon chip and neutral values', async () => {
    const doc = await renderPage();
    const queues = Array.from(doc.querySelectorAll<HTMLElement>('[data-hot-queue]'));
    expect(queues.map((q) => q.dataset.hotQueue)).toEqual(['mobile', 'desktop']);

    for (const queue of queues) {
      expect(queue.classList.contains('wa-kit-card')).toBe(true);
      expect(queue.classList.contains('wa-kit-tone--warn')).toBe(true);
      for (const other of OTHER_TONES) expect(queue.classList.contains(`wa-kit-tone--${other}`)).toBe(false);

      // Icon: lucide glyph inside the toned chip, no Material Symbols anywhere in the card.
      const chip = queue.querySelector('.wa-kit-tone-icon');
      expect(chip?.querySelector('svg')?.getAttribute('class')).toMatch(/lucide/);
      expect(queue.querySelector('.material-symbols-outlined')).toBeNull();
      expect(queue.textContent).not.toContain('local_fire_department');

      // Kicker is toned text; the heading is neutral and labels the section.
      expect(queue.querySelector('.wa-kit-tone-text')?.textContent).toBe('hotMemberQueue');
      const heading = queue.querySelector('h2');
      expect(heading?.id).toBe(queue.getAttribute('aria-labelledby'));
      expect(heading?.getAttribute('style')).toBeNull();

      // Each row is a kit card with the toned edge and the shared focus recipe.
      const cards = Array.from(queue.querySelectorAll<HTMLAnchorElement>('[data-hot-queue-card]'));
      expect(cards).toHaveLength(1);
      const [card] = cards;
      expect(card.getAttribute('href')).toBe('/counselor/students/member-1');
      for (const cls of ['wa-kit-card', 'wa-kit-card--sm', 'wa-kit-card--hover', 'wa-kit-tone-edge', 'wa-kit-focus']) {
        expect(card.classList.contains(cls), cls).toBe(true);
      }
      expect(card.querySelector('.wa-kit-tone-text')?.textContent).toBe('Completed IT Support');
      expect(card.textContent).toContain('Fixture Member');
      expect(card.textContent).toContain('hotQueueHoursAgo:3');
      // Name and time carry no inline colour of their own.
      for (const el of Array.from(card.querySelectorAll('[style]'))) {
        expect(el.getAttribute('style')).not.toMatch(/color/);
      }
    }

    expect(queues[0].querySelector('h2')?.textContent).toBe('freshCompletionsNeedFollowup');
    expect(queues[1].querySelector('h2')?.textContent).toBe('membersWhoJustBecameActionable');
    expect(queues[1].querySelector('.btn.btn-primary')?.textContent).toBe('openMember');
    expect(queues[0].querySelector('.btn.btn-primary')).toBeNull();
  });

  it('never resolves the legacy palette or a hard-coded brand hue in a rendered style', async () => {
    const doc = await renderPage();
    const html = doc.body.innerHTML;
    expect(html).not.toMatch(/color-amber/);
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[style]'))) {
      const style = el.getAttribute('style') ?? '';
      expect(style, `<${el.tagName.toLowerCase()} class="${el.className}">`).not.toMatch(/--color-/);
      expect(style).not.toMatch(/var\(--wa-(gold|success|accent|info|danger)\)/);
      expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it('renders no hot queue card when nothing is fresh', async () => {
    db.overrides['memberNextBestAction.findMany'] = async () => [];
    const doc = await renderPage();
    expect(doc.querySelector('[data-hot-queue]')).toBeNull();
  });
});
