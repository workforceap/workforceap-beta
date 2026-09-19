import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CounselorCommandCenter from '@/components/portal/counselor/CounselorCommandCenter';
import { AtRiskDashboardView, type AtRiskMember } from '@/components/portal/counselor/AtRiskDashboard';
import AdminCommandCenterClient from '@/components/admin/AdminCommandCenterClient';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
vi.mock('@/components/admin/ConfirmDialog', () => ({ default: () => null }));
afterEach(cleanup);

const savedRow = {
  memberId: 'm1', memberName: 'Fixture Member', memberEmail: 'fixture@example.invalid',
  daysInactive: null, enrolledProgram: null, riskScore: 75, alertStatus: 'escalated',
  reason: 'Saved risk score 75 · escalated',
};

describe('saved risk presentation', () => {
  it('admin separates unknown activity from the saved case and does not infer enrollment', () => {
    render(<AdminCommandCenterClient data={{
      atRisk: [savedRow], needsReply: [], interviewing: [], applicationsPending: [], programHealth: [],
      totals: { atRiskCount: 1, needsReplyCount: 0, interviewingCount: 0, applicationsPendingCount: 0,
        certificationsPendingCount: 0, oldestPendingApplicationDays: null },
    }} />);
    expect(screen.getByText('Saved risk score 75 · escalated · No activity recorded')).toBeVisible();
    expect(screen.getByText('No program label recorded')).toBeVisible();
    expect(screen.queryByText(/since portal activity or enrollment/)).not.toBeInTheDocument();
  });

  it('counselor keeps recent activity visible beside the unresolved saved alert', () => {
    render(<CounselorCommandCenter data={{
      atRisk: [{ ...savedRow, daysInactive: 0 }], needsReply: [], interviewing: [],
      totals: { atRiskCount: 1, needsReplyCount: 0, interviewingCount: 0, slaBreachCount: 0 },
    }} />);
    expect(screen.getByText('Saved risk score 75 · escalated · 0 days inactive')).toBeVisible();
    expect(screen.queryByText(/Everyone.*active/)).not.toBeInTheDocument();
  });

  it('dedicated dashboard never presents account creation as activity and sorts unknown recency last', () => {
    const member = (id: string, overrides: Partial<AtRiskMember> = {}): AtRiskMember => ({
      userId: id, alertId: id, name: `Member ${id}`, email: `${id}@example.invalid`, phone: null,
      score: 75, riskLevel: 'CRITICAL', status: 'open', factors: [], enrolledProgram: null,
      enrolledAt: null, memberSince: '2000-01-01T00:00:00Z', profile: null,
      alertCreatedAt: '2026-01-01T00:00:00Z', alertUpdatedAt: '2026-01-01T00:00:00Z',
      lastActivityAt: null, ...overrides,
    });
    render(<AtRiskDashboardView members={[
      member('unknown-medium', { score: 40, riskLevel: 'MEDIUM' }), member('unknown-critical'),
      member('known', { lastActivityAt: '2026-09-18T12:00:00Z', score: 30, riskLevel: 'MEDIUM' }),
    ]} onUpdateStatus={vi.fn()} onBulkAcknowledge={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Oldest activity' }));
    expect(screen.getAllByRole('button', { name: /^Member / }).map(button => button.textContent)).toEqual([
      'Member known', 'Member unknown-critical', 'Member unknown-medium',
    ]);
    expect(screen.getAllByText(/No activity recorded/)).toHaveLength(2);
    expect(screen.queryByText(/2000/)).not.toBeInTheDocument();
  });
});
