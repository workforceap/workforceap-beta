import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CounselorTodayKit } from '@/components/portal/kit/pages/counselor/CounselorTodayKit';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';
import { toTodayQueue } from '@/lib/attention/counselorViews';
import { buildApprovalQueue, emptyApprovalQueue, type ApprovalQueueMemberFacts } from '@/lib/counselor/approvalQueue';
import { colorOf, contrast, loadBlockTokens, loadRootTokens, over, readCss, resolve } from '@/lib/ui/cssTokenContrast.test-helpers';

/**
 * The Today page's "Waiting on your decision" queue: every application /
 * intake check awaiting this counselor, oldest first, with an age clock.
 * Rows over the SLA take the kit `warn` tone, over twice it `alert`; the
 * "Waiting on you" tile prints the row count (tile = table). Driven by the
 * pure builder with a fixed clock so the render is deterministic.
 */

/** Tuesday. */
const NOW = new Date('2026-09-22T12:00:00Z');
const at = (iso: string) => new Date(iso);

function member(overrides: Partial<ApprovalQueueMemberFacts> & { memberId: string }): ApprovalQueueMemberFacts {
  return {
    memberName: overrides.memberId,
    memberEmail: `${overrides.memberId}@example.test`,
    enrolledProgram: null,
    applications: [],
    wioaReviewStatus: null,
    wioaReviewedAt: null,
    wioaScreeningSubmittedAt: null,
    ...overrides,
  };
}
const application = (id: string, submittedAt: string) => ({
  id, status: 'PENDING', programInterest: 'it-support', submittedAt: at(submittedAt), createdAt: at(submittedAt),
});

const facts: ApprovalQueueMemberFacts[] = [
  member({ memberId: 'm-fresh', applications: [application('a-fresh', '2026-09-18T12:00:00Z')] }),
  member({ memberId: 'm-warn', applications: [application('a-warn', '2026-09-17T09:00:00Z')] }),
  member({ memberId: 'm-old', applications: [application('a-old', '2026-08-08T12:00:00Z')] }),
  member({ memberId: 'm-intake', wioaReviewStatus: 'in_review', wioaScreeningSubmittedAt: at('2026-09-10T10:00:00Z'), wioaReviewedAt: at('2026-09-21T10:00:00Z') }),
];
const approvals = buildApprovalQueue(facts, NOW);
const attention = toTodayQueue(emptyAttentionQueue());

afterEach(cleanup);

const section = () => screen.getByTestId('today-approval-queue');
const tileValue = () => screen.getByTestId('today-tile-awaiting-decision').querySelector('.wa-kit-stat-value')?.textContent;

describe('Counselor Today — waiting on your decision', () => {
  it('lists every awaiting decision oldest first, each row a link to the member review panel', () => {
    render(<CounselorTodayKit queue={attention} approvals={approvals} />);
    const rows = within(section()).getAllByTestId('approval-row');
    expect(rows.map((r) => r.getAttribute('href'))).toEqual([
      '/counselor/students/m-old#counselor-intake-review-panel',
      '/counselor/students/m-intake#counselor-intake-review-panel',
      '/counselor/students/m-warn#counselor-intake-review-panel',
      '/counselor/students/m-fresh#counselor-intake-review-panel',
    ]);
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['application', 'intake', 'application', 'application']);
    expect(within(section()).getByRole('heading', { level: 2 })).toHaveTextContent('Waiting on your decision');
    expect(section()).toHaveTextContent('4 decisions');
    expect(rows[0]).toHaveTextContent('Application decision');
    expect(rows[1]).toHaveTextContent('Intake verification');
    expect(rows[1]).toHaveTextContent('Intake in review');
    expect(within(section()).queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('shows the age in plain words and tones rows over the SLA warn, over twice the SLA alert', () => {
    render(<CounselorTodayKit queue={attention} approvals={approvals} />);
    const rows = within(section()).getAllByTestId('approval-row');
    const [old, intake, warn, fresh] = rows;

    expect(old).toHaveTextContent('45 days waiting');
    expect(old).toHaveClass('wa-kit-tone--alert', 'wa-kit-tone-edge');
    expect(within(old).getByText('45 days waiting')).toHaveClass('wa-kit-tag--alert');

    expect(intake).toHaveTextContent('12 days waiting');
    expect(intake).toHaveClass('wa-kit-tone--alert');

    expect(warn).toHaveTextContent('5 days waiting');
    expect(warn).toHaveClass('wa-kit-tone--warn');
    expect(warn).not.toHaveClass('wa-kit-tone--alert');
    expect(within(warn).getByText('5 days waiting')).toHaveClass('wa-kit-tag--warn');

    // Friday noon -> Tuesday noon is two business days: at the SLA, not over it.
    expect(fresh).toHaveTextContent('4 days waiting');
    expect(fresh.className).not.toMatch(/wa-kit-tone--/);
    expect(within(fresh).getByText('4 days waiting')).toHaveClass('wa-kit-tag--muted');
  });

  it('the "Waiting on you" tile equals the row count and takes the worst row tone (tile = table)', () => {
    render(<CounselorTodayKit queue={attention} approvals={approvals} />);
    const tile = screen.getByTestId('today-tile-awaiting-decision');
    expect(tile).toHaveTextContent('Waiting on you');
    expect(tileValue()).toBe(String(within(section()).getAllByTestId('approval-row').length));
    expect(section()).toHaveAttribute('data-count', '4');
    expect(tile.querySelector('.wa-kit-stat-tile')).toHaveClass('wa-kit-tone--alert', 'wa-kit-tone-edge');
    expect(tile).toHaveTextContent('Approvals past 2 business days: 3');
    // The other three tiles are untouched.
    for (const id of ['flagged', 'reply-owed', 'on-track']) expect(screen.getByTestId(`today-tile-${id}`)).toBeInTheDocument();
  });

  it('empty queue renders the same kit empty state the Today groups use, and a zero tile with no tone', () => {
    render(<CounselorTodayKit queue={attention} approvals={emptyApprovalQueue()} />);
    expect(within(section()).getByRole('heading', { level: 3 })).toHaveTextContent('Nothing is waiting on you');
    // Zero decisions is the goal: `clear`, ok tone, not an alert.
    expect(section().querySelector('.wa-kit-empty')).toHaveAttribute('data-kind', 'clear');
    expect(section().querySelector('.wa-kit-empty')).toHaveAttribute('data-tone', 'ok');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(section()).queryAllByRole('listitem')).toHaveLength(0);
    expect(section()).toHaveAttribute('data-count', '0');
    expect(section()).toHaveTextContent('0 decisions');
    expect(tileValue()).toBe('0');
    // The stat card takes no state tone at zero (the caption's own `muted` delta tone is not a state).
    expect(screen.getByTestId('today-tile-awaiting-decision').querySelector('.wa-kit-stat-tile')?.className).not.toMatch(/wa-kit-tone--(warn|alert)/);
    // Omitting the prop (loader not wired) reads the same as empty.
    cleanup();
    render(<CounselorTodayKit queue={attention} />);
    expect(tileValue()).toBe('0');
  });

  it('a failed approval load shows a retry in that section only; the tile reads 0 and says so', () => {
    render(<CounselorTodayKit queue={attention} approvals={approvals} approvalsLoadError />);
    expect(within(section()).getByRole('heading', { level: 3 })).toHaveTextContent("Couldn't load the approval queue");
    expect(within(section()).getByRole('link', { name: /Retry/ })).toHaveAttribute('href', '/counselor/today');
    expect(within(section()).queryAllByTestId('approval-row')).toHaveLength(0);
    expect(tileValue()).toBe('0');
    expect(screen.getByTestId('today-tile-awaiting-decision')).toHaveTextContent('Approval queue did not load');
    // The attention tiles and groups still render.
    expect(screen.getByTestId('today-group-at_risk')).toBeInTheDocument();
    // The failed load is the one alert on the page: `unavailable` + danger, never a confirmed empty.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-kind', 'unavailable');
    expect(alert).toHaveAttribute('data-tone', 'danger');
    expect(section().contains(alert)).toBe(true);
  });
});

describe('the warn / alert tones the queue paints resolve in light and dark', () => {
  const kit = readCss('css/portal-kit.css');
  // The (portal) chain: css/portal.css @imports portal-kit.css and portal-tokens.css, which @imports wa-brand-tokens.css.
  const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));

  /** `prop: value` pairs of the first rule whose selector is exactly `selector`. */
  function declsOf(selector: string): Record<string, string> {
    const src = kit.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = src.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`rule not found: ${selector}`);
    const body = src.slice(start + selector.length + 2, src.indexOf('}', start));
    const out: Record<string, string> = {};
    for (const m of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  }

  it.each(['warn', 'alert'] as const)('%s: the row edge / icon token and the chip colours are defined, opaque and scheme-specific', (tone) => {
    const hook = loadBlockTokens(kit, `.wa-kit-tone--${tone}`);
    const edge = hook.get('--wa-kit-tone');
    const soft = hook.get('--wa-kit-tone-soft');
    expect(edge, `.wa-kit-tone--${tone} sets --wa-kit-tone`).toBeTruthy();
    expect(soft, `.wa-kit-tone--${tone} sets --wa-kit-tone-soft`).toBeTruthy();
    const light = colorOf(edge!, tokens, 'light');
    const dark = colorOf(edge!, tokens, 'dark');
    expect(light.a).toBe(1);
    expect(dark.a).toBe(1);
    expect(resolve(edge!, tokens, 'light')).not.toBe(resolve(edge!, tokens, 'dark'));
    expect(() => colorOf(soft!, tokens, 'light')).not.toThrow();
    expect(() => colorOf(soft!, tokens, 'dark')).not.toThrow();

    const tag = declsOf(`.wa-kit-tag--${tone}`);
    for (const scheme of ['light', 'dark'] as const) {
      const surface = colorOf('var(--wa-surface)', tokens, scheme);
      const bg = over(colorOf(tag.background, tokens, scheme), surface);
      const fg = colorOf(tag.color, tokens, scheme);
      expect(contrast(fg, bg), `${scheme} ${tone} chip text`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
