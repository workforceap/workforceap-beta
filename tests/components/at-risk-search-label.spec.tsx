import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtRiskDashboardView } from '@/components/portal/counselor/AtRiskDashboard';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
afterEach(cleanup);

describe('at-risk dashboard search', () => {
  it('has a programmatic label, not just a placeholder', () => {
    render(<AtRiskDashboardView members={[]} onUpdateStatus={vi.fn()} onBulkAcknowledge={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Search at-risk members' });
    expect(search).toHaveAttribute('placeholder', 'Search by name or email…');
    expect(search).toHaveAttribute('id', 'at-risk-search');
  });
});
