import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@astryxdesign/core/StatusDot', () => ({ StatusDot: () => null }));
vi.mock('@/components/admin/BulkEmailModal', () => ({ default: () => null }));
vi.mock('@/components/admin/BulkUpdateModal', () => ({ default: () => null }));
vi.mock('@/components/admin/ConfirmDialog', () => ({ default: () => null }));

import { StudentsRosterKit, type StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import MembersTable from '@/components/admin/MembersTable';
import { AtRiskDashboardView } from '@/components/portal/counselor/AtRiskDashboard';
import type { AtRiskMember } from '@/lib/member/atRiskRow';
import { withPortalIntl } from '@/tests/helpers/withPortalIntl';

const students: StudentRow[] = Array.from({ length: 54 }, (_, index) => ({
  id: `student-${index}`, name: `Learner ${String(index + 1).padStart(2, '0')}`, email: `learner${index}@example.test`,
  program: 'IT Support', progress: index, status: 'In Training', lastActive: '2h ago', lastActiveAt: 1000 - index,
  training: { modulesDone: index % 10, modulesTotal: 10, pace: 'On track' },
}));

function tableRows() { return Array.from(screen.getByRole('table').querySelectorAll<HTMLElement>('tbody tr')); }

beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, '', '/admin/students'); });
afterEach(cleanup);

describe('Students results survive opening a record', () => {
  it('restores a training page from its query, carries it through the row link, and restores it again', () => {
    const initial = 'view=training&chip=All&sort=-lastActive&page=2';
    window.history.replaceState({}, '', `/admin/students?${initial}`);
    const first = render(<StudentsRosterKit view="training" students={students} total={54} urlState={initial} />);
    expect(tableRows()).toHaveLength(4);
    expect(tableRows()[0]).toHaveTextContent('Learner 51');
    fireEvent.click(tableRows()[0]);
    const detail = new URL(navigation.push.mock.lastCall?.[0], 'http://localhost');
    expect(detail.pathname).toBe('/admin/members/student-50');
    const returnTo = detail.searchParams.get('returnTo');
    expect(returnTo).toBeTruthy();
    const restored = new URL(returnTo!, 'http://localhost');
    expect(restored.pathname).toBe('/admin/students');
    expect(restored.searchParams.get('view')).toBe('training');
    expect(restored.searchParams.get('page')).toBe('2');
    expect(restored.searchParams.get('sort')).toBe('-lastActive');
    first.unmount();
    window.history.replaceState({}, '', returnTo);
    render(<StudentsRosterKit view="training" students={students} total={54} urlState={restored.searchParams.toString()} />);
    expect(tableRows()[0]).toHaveTextContent('Learner 51');
    expect(tableRows()).toHaveLength(4);
  });

  it('updates the visible results and query when search or sort changes, resetting page without a server navigation', () => {
    window.history.replaceState({}, '', '/admin/students?view=training&page=2&sort=-lastActive');
    render(<StudentsRosterKit view="training" students={students} total={54} urlState="view=training&page=2&sort=-lastActive" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Student' }));
    expect(tableRows()).toHaveLength(50);
    expect(new URLSearchParams(window.location.search).get('page')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('student');
    fireEvent.change(screen.getByPlaceholderText('Name, email or program'), { target: { value: 'Learner 53' } });
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]).toHaveTextContent('Learner 53');
    expect(new URLSearchParams(window.location.search).get('search')).toBe('Learner 53');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('training');
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('restores local management refinements and encodes the same context in desktop and mobile record links', () => {
    window.history.replaceState({}, '', '/admin/students?view=manage&page=2&health=red&sort=name:asc');
    const member = {
      id: 'member-1', fullName: 'Ada Example', email: 'ada@example.test', phone: null, profile: null,
      enrolledProgram: 'it-support', enrolledAt: null, createdAt: '2026-01-01', staleTrainingDetectedAt: null,
      assessmentScorePct: 80, assessmentCompleted: true, updatedAt: '2026-09-01', memberStatus: 'ACTIVE',
      programTitle: 'IT Support', coursesCompleted: [], totalCourses: 10, liveTraining: null, partnerName: null, partnerId: null,
      healthStatus: 'red' as const, enrollmentProgramSlugs: ['it-support'], enrollmentProgramTitleBySlug: { 'it-support': 'IT Support' },
    };
    const props: ComponentProps<typeof MembersTable> = {
      members: [member, { ...member, id: 'member-2', fullName: 'Other learner', email: 'other@example.test', healthStatus: 'green' }],
      totalCount: 100, currentPage: 2, pageSize: 50, searchQuery: '', programFilter: '', statusFilter: '', partnerFilter: '',
      startDateFilter: '', endDateFilter: '', allPartnerOptions: [], allAssignablePrograms: [],
    };
    render(<MembersTable {...props} />);
    expect(within(screen.getByRole('table')).queryByText('Other learner')).toBeNull();
    const links = screen.getAllByRole('link', { name: 'Ada Example' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      const href = new URL(link.getAttribute('href')!, 'http://localhost');
      const origin = new URL(href.searchParams.get('returnTo')!, 'http://localhost');
      expect(origin.searchParams.get('view')).toBe('manage');
      expect(origin.searchParams.get('health')).toBe('red');
      expect(origin.searchParams.get('page')).toBe('2');
      expect(origin.searchParams.get('sort')).toBe('name:asc');
    }
    fireEvent.click(tableRows()[0]);
    expect(navigation.push.mock.lastCall?.[0]).toBe(links[0].getAttribute('href'));
  });

  it('restores a counselor case filter and carries a changed search through both record actions', () => {
    window.history.replaceState({}, '', '/counselor/today?view=attention&filter=at-risk&severity=CRITICAL&caseStatus=open');
    const risk: AtRiskMember = {
      userId: 'a', alertId: 'alert-a', name: 'Ada Risk', email: 'ada@example.test', phone: null,
      score: 75, riskLevel: 'CRITICAL', status: 'open', factors: [], enrolledProgram: null,
      enrolledAt: null, memberSince: '2026-01-01', profile: null, alertCreatedAt: '2026-09-01', alertUpdatedAt: '2026-09-01',
    };
    render(withPortalIntl(<AtRiskDashboardView members={[risk, { ...risk, userId: 'b', alertId: 'alert-b', name: 'Other case', riskLevel: 'MEDIUM' }]}
      onUpdateStatus={vi.fn()} onBulkAcknowledge={vi.fn()} />));
    expect(screen.getByRole('button', { name: 'Ada Risk' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Other case' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search at-risk members' }), { target: { value: 'Ada' } });
    for (const label of ['View', 'Message']) {
      const href = new URL(screen.getByRole('link', { name: label }).getAttribute('href')!, 'http://localhost');
      const origin = new URL(href.searchParams.get('returnTo')!, 'http://localhost');
      expect(origin.pathname).toBe('/counselor/today');
      expect(origin.searchParams.get('filter')).toBe('at-risk');
      expect(origin.searchParams.get('severity')).toBe('CRITICAL');
      expect(origin.searchParams.get('caseStatus')).toBe('open');
      expect(origin.searchParams.get('caseSearch')).toBe('Ada');
    }
  });
});
