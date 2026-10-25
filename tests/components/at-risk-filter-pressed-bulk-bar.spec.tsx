import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';
import AtRiskDashboard from '@/components/portal/counselor/AtRiskDashboard';
import type { AtRiskMember } from '@/lib/member/atRiskRow';

vi.mock('next/navigation', () => ({ usePathname: () => '/dev/test', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalInlineSpinner', () => ({ PortalInlineSpinner: () => <span aria-hidden="true" /> }));

const member = (id: string, riskLevel: AtRiskMember['riskLevel'], score: number): AtRiskMember => ({
  userId: id, alertId: `alert-${id}`, name: `Member ${id}`, email: `${id}@example.invalid`, phone: null,
  score, riskLevel, status: 'open', factors: [], enrolledProgram: null,
  enrolledAt: null, memberSince: '2026-01-01T00:00:00Z', profile: null,
  alertCreatedAt: '2026-09-01T00:00:00Z', alertUpdatedAt: '2026-09-01T00:00:00Z', lastActivityAt: null,
});

afterEach(cleanup);

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="en" messages={pickClientMessageSlice(en, 'portal')}>
      <AtRiskDashboard initialMembers={[member('a', 'CRITICAL', 80), member('b', 'LOW', 10)]} />
    </NextIntlClientProvider>,
  );
}

const PRESSED = 'aria-pressed';

describe('at-risk filter chips', () => {
  it('expose their pressed state and toggle it with the filter', () => {
    renderDashboard();
    const chips = screen.getAllByRole('button', { name: / · \d+$/ });
    expect(chips.length).toBeGreaterThan(1);
    for (const chip of chips) expect(chip).toHaveAttribute(PRESSED, 'false');

    const critical = screen.getByRole('button', { name: /^Critical · \d+$/ });
    fireEvent.click(critical);
    expect(critical).toHaveAttribute(PRESSED, 'true');
    expect(chips.filter((c) => c.getAttribute(PRESSED) === 'true')).toEqual([critical]);

    fireEvent.click(critical);
    expect(critical).toHaveAttribute(PRESSED, 'false');
  });
});

describe('at-risk bulk bar', () => {
  it('appears once a row is selected, pins below md and announces the count', () => {
    renderDashboard();
    expect(screen.queryByTestId('at-risk-bulk-bar')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Member a' }));
    const bar = screen.getByTestId('at-risk-bulk-bar');
    expect(bar).toHaveClass('wa-sticky', 'md:wa-static');
    expect(screen.getByRole('status')).toHaveTextContent('1 selected');
    expect(bar).toHaveTextContent('Acknowledge (1)');
  });
});
