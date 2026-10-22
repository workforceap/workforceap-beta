import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyApprovalQueue } from '@/lib/counselor/approvalQueue';
import { emptyAttentionQueue } from '@/lib/attention/evaluate';

const mocks = vi.hoisted(() => ({
  user: { id: 'staff-1' } as { id: string } | null,
  counselor: true, admin: false, scope: { ok: true, orgId: 'org-1', superAdmin: false },
  views: vi.fn(), approvals: vi.fn(), attention: vi.fn(), roster: vi.fn(), training: vi.fn(), focus: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => { throw new Error(`redirect:${href}`); },
  usePathname: () => '/counselor/today', useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl', async () => {
  const { default: messages } = await import('@/messages/en.json');
  return { useTranslations: (namespace: string) => (key: string, values: Record<string, unknown> = {}) => {
    const value = `${namespace}.${key}`.split('.').reduce<unknown>((part, next) => (part as Record<string, unknown>)?.[next], messages);
    return String(value ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? name));
  } };
});
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => mocks.user }));
vi.mock('@/lib/auth/roles', () => ({ isCounselor: async () => mocks.counselor, isAdmin: async () => mocks.admin }));
vi.mock('@/lib/auth/portalGuards', () => ({ deniedPortalHomeHref: async () => '/dashboard' }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: async () => mocks.scope }));
vi.mock('@/lib/counselor/loadApprovalQueue', () => ({ getCounselorApprovalQueue: mocks.approvals }));
vi.mock('@/lib/attention/counselor', () => ({ getCounselorAttention: mocks.attention }));
vi.mock('@/lib/admin/studentsRosterLoad', () => ({ loadStudentsRoster: mocks.roster, studentsRosterNotice: () => undefined }));
vi.mock('@/lib/admin/trainingRosterLoad', () => ({ loadTrainingRoster: mocks.training }));
vi.mock('@/lib/admin/studentsRosterFocus', () => ({ loadStudentsRosterFocus: mocks.focus, STUDENTS_FOCUS_UNAVAILABLE_NOTICE: 'Unavailable' }));
vi.mock('@/components/portal/kit/pages/admin-subviews/StudentsRosterKit', () => ({
  StudentsRosterKit: (props: Record<string, unknown>) => { mocks.views(`students-${props.view}`, props); return <div data-testid="roster-content" />; },
}));
vi.mock('@/components/admin/workspace/MemberManagementView', () => ({ default: async (props: Record<string, unknown>) => {
  mocks.views('manage', props); return <div data-testid="manage-content">Management actions</div>;
} }));
vi.mock('@/components/admin/workspace/MemberInterviewReadyView', () => ({ default: async (props: Record<string, unknown>) => {
  mocks.views('interview', props); return <div data-testid="interview-content">Interview eligibility</div>;
} }));
vi.mock('@/components/admin/workspace/MemberJobReadyView', () => ({ default: async (props: Record<string, unknown>) => {
  mocks.views('job', props); return <div data-testid="job-content">Training completion</div>;
} }));
vi.mock('@/components/portal/counselor/workspace/CounselorAttentionView', () => ({ default: async () => {
  mocks.views('attention'); return <div data-testid="attention-content" />;
} }));
vi.mock('@/components/portal/counselor/workspace/CounselorRepliesView', () => ({ default: async () => {
  mocks.views('replies'); return <div data-testid="replies-content" />;
} }));
vi.mock('@/components/portal/counselor/workspace/CounselorFollowupView', () => ({ default: async () => {
  mocks.views('followup'); return <div data-testid="followup-content" />;
} }));
vi.mock('@/components/portal/counselor/workspace/CounselorOverviewView', () => ({ default: async () => {
  mocks.views('overview'); return <div data-testid="overview-content" />;
} }));
vi.mock('@/components/portal/counselor/workspace/CounselorPrioritiesView', () => ({ default: async () => {
  mocks.views('priorities'); return <div data-testid="priorities-content" />;
} }));
vi.mock('@/components/portal/counselor/workspace/CounselorAtRiskView', () => ({ default: async () => {
  mocks.views('at-risk'); return <div data-testid="at-risk-content" />;
} }));
vi.mock('@/components/portal/counselor/workspace/CounselorInactiveView', () => ({ default: () => {
  mocks.views('inactive'); return <div data-testid="inactive-content" />;
} }));

import CounselorTodayPage from '@/app/(portal)/counselor/today/page';
import CounselorQueuePage from '@/app/(portal)/counselor/queue/page';
import CounselorInboxPage from '@/app/(portal)/counselor/inbox/page';
import AdminStudentsPage from '@/app/admin/students/page';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: 'staff-1' }; mocks.counselor = true; mocks.admin = false;
  mocks.scope = { ok: true, orgId: 'org-1', superAdmin: false };
  mocks.approvals.mockResolvedValue(emptyApprovalQueue());
  mocks.attention.mockResolvedValue(emptyAttentionQueue());
  mocks.roster.mockResolvedValue({ ok: true, students: [], total: 0 });
  mocks.training.mockResolvedValue({ ok: true, students: [], total: 0 });
  mocks.focus.mockResolvedValue({ failed: false, focus: null });
});
afterEach(cleanup);

describe('Counselor Today workspace', () => {
  it.each([
    [{}, 'attention'], [{ view: 'replies' }, 'replies'], [{ view: 'followup' }, 'followup'],
    [{ view: 'overview' }, 'overview'], [{ filter: 'priorities' }, 'priorities'],
    [{ filter: 'at-risk' }, 'at-risk'], [{ filter: 'inactive' }, 'inactive'],
    [{ view: 'unknown', filter: 'unknown' }, 'attention'],
  ])('loads only the selected existing view for %j', async (params, selected) => {
    render(await CounselorTodayPage({ searchParams: Promise.resolve(params) }));
    expect(screen.getByTestId(`${selected}-content`)).toBeInTheDocument();
    expect(mocks.views).toHaveBeenCalledTimes(1);
    expect(mocks.views.mock.calls[0][0]).toBe(selected);
    expect(mocks.approvals).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(screen.getByRole('navigation', { name: 'Counselor work views' })).getAllByRole('link')).toHaveLength(5);
  });

  it('checks role access before a selected view or decision loader', async () => {
    mocks.counselor = false;
    await expect(CounselorTodayPage({ searchParams: Promise.resolve({ view: 'decisions' }) })).rejects.toThrow('redirect:/dashboard');
    expect(mocks.views).not.toHaveBeenCalled(); expect(mocks.approvals).not.toHaveBeenCalled();
    mocks.user = null;
    await expect(CounselorTodayPage()).rejects.toThrow('redirect:/login?redirectTo=/counselor/today');
  });

  it('renders a decision failure as a retryable error, with the other work views still reachable', async () => {
    mocks.approvals.mockRejectedValue(new Error('fixture unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(await CounselorTodayPage({ searchParams: Promise.resolve({ view: 'decisions' }) }));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Retry/ })).toHaveAttribute('href', '/counselor/today?view=decisions');
      expect(screen.getByRole('link', { name: 'Needs attention' })).toHaveAttribute('href', '/counselor/today?view=attention');
      expect(mocks.approvals).toHaveBeenCalledWith('staff-1', { isAdmin: false });
      expect(mocks.views).not.toHaveBeenCalled();
    } finally { error.mockRestore(); }
  });

  it('keeps the tour at-risk target on the visible filter and retains legacy reply/follow-up URLs', async () => {
    const { unmount } = render(<CounselorWorkspace view="attention"><p>Queue</p></CounselorWorkspace>);
    expect(screen.getByRole('link', { name: 'At-risk cases' })).toHaveAttribute('data-tour', 'tour-nav-at-risk');
    unmount();
    const queue = render(await CounselorQueuePage());
    expect(screen.getByTestId('replies-content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Awaiting reply' })).toHaveAttribute('aria-current', 'page');
    queue.unmount();
    render(await CounselorInboxPage());
    expect(screen.getByTestId('followup-content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Follow-up' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the real attention list available when only its approval count fails', async () => {
    const { default: AttentionView } = await vi.importActual<typeof import('@/components/portal/counselor/workspace/CounselorAttentionView')>('@/components/portal/counselor/workspace/CounselorAttentionView');
    mocks.approvals.mockRejectedValue(new Error('fixture unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(await AttentionView());
      expect(screen.getByTestId('today-tile-flagged')).toHaveTextContent('0');
      expect(screen.getByTestId('today-tile-awaiting-decision')).toHaveTextContent('—');
      expect(screen.getByRole('link', { name: /approval count unavailable/ })).toHaveAttribute('href', '/counselor/today?view=decisions');
      expect(screen.queryByRole('alert')).toBeNull();
    } finally { error.mockRestore(); }
  });
});

describe('Admin Students workspace', () => {
  it('gates before any roster, management or readiness view loads', async () => {
    mocks.scope.ok = false;
    await expect(AdminStudentsPage({ searchParams: Promise.resolve({ view: 'manage' }) })).rejects.toThrow('redirect:/dashboard');
    expect(mocks.views).not.toHaveBeenCalled(); expect(mocks.roster).not.toHaveBeenCalled();
  });

  it('passes the complete management query to the existing actions and keeps duplicate review separate', async () => {
    const params = { view: 'manage', search: 'Ada', status: 'active', partner: 'p1', page: '3' };
    render(await AdminStudentsPage({ searchParams: Promise.resolve(params) }));
    expect(mocks.views).toHaveBeenCalledTimes(1);
    expect(mocks.views.mock.calls[0][0]).toBe('manage');
    await expect(mocks.views.mock.calls[0][1].searchParams).resolves.toEqual(params);
    expect(mocks.roster).not.toHaveBeenCalled(); expect(mocks.training).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Duplicate review' })).toHaveAttribute('href', '/admin/members/duplicates');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(screen.getByRole('navigation', { name: 'Students workspace views' })).getAllByRole('link')).toHaveLength(4);
  });

  it.each([['interview', 'interview', 'Interview ready'], ['job', 'job', 'Training 70%+']] as const)('keeps %s readiness distinct', async (readiness, content, label) => {
    render(await AdminStudentsPage({ searchParams: Promise.resolve({ view: 'readiness', readiness, page: '2' }) }));
    expect(screen.getByTestId(`${content}-content`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    expect(mocks.roster).not.toHaveBeenCalled(); expect(mocks.training).not.toHaveBeenCalled();
  });

  it('retains roster focus and local URL refinements without loading management', async () => {
    const params = { search: 'Ada', sort: '-progress', chip: 'At Risk', page: '2', needs: 'at-risk' };
    render(await AdminStudentsPage({ searchParams: Promise.resolve(params) }));
    expect(mocks.roster).toHaveBeenCalledWith(mocks.scope);
    expect(mocks.views).toHaveBeenCalledWith('students-roster', expect.objectContaining({ embedded: true, showViewNav: false, urlState: new URLSearchParams(params).toString() }));
    expect(mocks.training).not.toHaveBeenCalled();
  });
});
