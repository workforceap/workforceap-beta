import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtRiskDashboardView } from '@/components/portal/counselor/AtRiskDashboard';
import type { AtRiskMember } from '@/lib/member/atRiskRow';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dev/test', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
afterEach(cleanup);

describe('at-risk dashboard search', () => {
  it('has a programmatic label, not just a placeholder', () => {
    render(<AtRiskDashboardView members={[]} onUpdateStatus={vi.fn()} onBulkAcknowledge={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Search at-risk members' });
    expect(search).toHaveAttribute('placeholder', 'Search by name or email…');
    expect(search).toHaveAttribute('id', 'at-risk-search');
  });

  it('names the program selector and filters the existing cases through it', () => {
    const member: AtRiskMember = {
      userId: 'cloud-member', alertId: 'cloud-alert', name: 'Cloud member',
      email: 'cloud@example.test', phone: null, score: 75, riskLevel: 'CRITICAL',
      status: 'open', factors: [], enrolledProgram: 'Cloud & IT', enrolledAt: null,
      memberSince: '2026-01-01T00:00:00Z', profile: null,
      alertCreatedAt: '2026-09-01T00:00:00Z', alertUpdatedAt: '2026-09-01T00:00:00Z', lastActivityAt: null,
    };
    render(<AtRiskDashboardView members={[
      member,
      { ...member, userId: 'data-member', alertId: 'data-alert', name: 'Data member', enrolledProgram: 'Data & AI' },
    ]} onUpdateStatus={vi.fn()} onBulkAcknowledge={vi.fn()} />);

    const program = screen.getByRole('combobox', { name: 'Program' });
    fireEvent.change(program, { target: { value: 'Cloud & IT' } });
    expect(screen.getByRole('button', { name: 'Cloud member' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Data member' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Program: Cloud & IT filter' }));
    expect(program).toHaveValue('all');
    expect(screen.getByRole('button', { name: 'Data member' })).toBeVisible();
  });
});
