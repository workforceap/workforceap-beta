import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CounselorTodayKit } from '@/components/portal/kit/pages/counselor/CounselorTodayKit';
import { buildAttentionQueue, emptyAttentionQueue } from '@/lib/attention/evaluate';
import { TODAY_GROUP_ORDER, TODAY_GROUPS, toTodayQueue } from '@/lib/attention/counselorViews';
import { FIXTURE_FLAGGED_IDS, FIXTURE_NOW, fixtureRoster } from '@/tests/fixtures/attentionRoster';

/**
 * The Today page renders `toTodayQueue` of the shared attention queue, so this
 * spec drives the kit with the same fixture roster the counselor agreement
 * test uses (lib/attention/counselorAgreement.test.ts).
 */

afterEach(cleanup);

const group = (key: string) => screen.getByTestId(`today-group-${key}`);
const tile = (id: string) => screen.getByTestId(`today-tile-${id}`);

describe('Counselor Today page — empty state', () => {
  it('renders one h1, three zero tiles and an empty state for every group', () => {
    render(<CounselorTodayKit queue={toTodayQueue(emptyAttentionQueue())} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Today');
    expect(screen.getByRole('link', { name: 'All members' })).toHaveAttribute('href', '/counselor/students');

    expect(tile('flagged')).toHaveTextContent('Needs attention');
    expect(tile('flagged')).toHaveTextContent('0');
    expect(tile('reply-owed')).toHaveTextContent('0');
    expect(tile('on-track')).toHaveTextContent('0');

    for (const key of TODAY_GROUP_ORDER) {
      const section = group(key);
      expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(TODAY_GROUPS[key].label);
      expect(within(section).getByRole('heading', { level: 3 })).toHaveTextContent(TODAY_GROUPS[key].emptyTitle);
      expect(within(section).queryAllByRole('listitem')).toHaveLength(0);
      expect(section).toHaveAttribute('data-count', '0');
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says when a clear caseload is on track instead of listing anyone', () => {
    const clear = buildAttentionQueue(fixtureRoster().filter((m) => m.memberId.startsWith('m-ok')), FIXTURE_NOW);
    render(<CounselorTodayKit queue={toTodayQueue(clear)} />);
    expect(screen.getByText(/Nothing needs attention · 2 members on track/)).toBeInTheDocument();
    expect(tile('on-track')).toHaveTextContent('2');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByText('m-ok')).toBeNull();
  });
});

describe('Counselor Today page — populated', () => {
  const queue = buildAttentionQueue(fixtureRoster(), FIXTURE_NOW);

  it('lists each flagged member once in its group and never the on-track members', () => {
    render(<CounselorTodayKit queue={toTodayQueue(queue)} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(tile('flagged')).toHaveTextContent(String(FIXTURE_FLAGGED_IDS.length));
    expect(tile('reply-owed')).toHaveTextContent('2');
    // m-ok, m-ok2 and the no-program alert holder (not a risk alert without a program).
    expect(tile('on-track')).toHaveTextContent('3');

    const expected: Record<string, string[]> = {
      at_risk: ['m-risk', 'm-quiet30'],
      reply_owed: ['m-sla', 'm-reply24'],
      quiet: ['m-warn'],
      follow_ups: ['m-app'],
      new: ['m-new'],
      celebrate: ['m-celebrate'],
    };
    for (const key of TODAY_GROUP_ORDER) {
      const section = group(key);
      const items = within(section).getAllByRole('listitem');
      expect(items, key).toHaveLength(expected[key].length);
      expected[key].forEach((memberId, index) => {
        expect(within(items[index]).getByRole('link', { name: `View member ${memberId}` })).toHaveAttribute(
          'href',
          `/counselor/students/${memberId}`,
        );
      });
      expect(within(section).queryByRole('heading', { level: 3 })).toBeNull();
    }
    // Flagged + celebrate = 8 rows; the two on-track members are not on the page.
    expect(screen.getAllByRole('listitem')).toHaveLength(FIXTURE_FLAGGED_IDS.length + 1);
    expect(screen.queryByText('m-ok')).toBeNull();
    expect(screen.queryByText('m-ok2')).toBeNull();
  });

  it('labels each row with its rule and links a reply-owed row straight to the thread', () => {
    render(<CounselorTodayKit queue={toTodayQueue(queue)} />);
    const replyOwed = group('reply_owed');
    expect(within(replyOwed).getByRole('link', { name: 'Open thread with m-sla' })).toHaveAttribute(
      'href',
      '/counselor/messages?thread=thread-sla',
    );
    expect(replyOwed).toHaveTextContent('Reply overdue 48h+');
    expect(replyOwed).toHaveTextContent('50h waiting');
    expect(replyOwed).toHaveTextContent('Urgent');

    const quiet = group('quiet');
    expect(quiet).toHaveTextContent('Quiet 10+ days');
    expect(quiet).toHaveTextContent('Also: No counselor contact 7+ days, Resume missing 3+ days');
    expect(within(quiet).queryByRole('link', { name: /Open thread/ })).toBeNull();

    expect(group('at_risk')).toHaveTextContent('Risk alert');
    expect(group('at_risk')).toHaveTextContent('critical risk (72)');
    expect(group('celebrate')).toHaveTextContent('Recent milestone');
    expect(group('celebrate')).toHaveTextContent('course completed');
  });

  it('shows only the failed-load card when the queue could not load', () => {
    render(<CounselorTodayKit queue={toTodayQueue(emptyAttentionQueue())} loadError />);
    const card = screen.getByRole('alert');
    expect(card).toHaveAttribute('data-portal-error-state', 'counselor-today-load-failed');
    expect(within(card).getByRole('link', { name: /Retry/ })).toHaveAttribute('href', '/counselor/today');
    expect(screen.queryByTestId('today-group-at_risk')).toBeNull();
    expect(screen.queryByTestId('today-tile-flagged')).toBeNull();
    expect(screen.queryByText(/Nothing needs attention/)).toBeNull();
  });
});
