import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentRow } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';

/**
 * Attention numbers on the Command Center and the overview digest link to
 * `/admin/students?needs=…`. The roster page resolves that param to the
 * nearest chip and the kit opens on it, so the link lands on a filtered
 * roster rather than the whole list (admin audit 2026-09-20).
 *
 * `?needs=new-applicants` has no chip: the page hands the kit the member ids
 * behind the admin Today's "new applicants have no counselor" row, from the
 * same attention queue, and the kit shows only those (WAP-198).
 */

const mocks = vi.hoisted(() => ({ members: vi.fn(), enrichment: vi.fn(), kit: vi.fn(), attention: vi.fn() }));

vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@astryxdesign/core/Button', () => ({ Button: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('@astryxdesign/core/Link', () => ({
  Link: ({ children, href }: { children?: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@astryxdesign/core/SegmentedControl', () => ({
  SegmentedControl: ({ children, value, label }: { children?: React.ReactNode; value: string; label: string }) => (
    <div role="radiogroup" aria-label={label}>
      {Array.isArray(children)
        ? children.map((child: { props: { value: string; label: string } }) => (
            <button type="button" role="radio" key={child.props.value} aria-checked={child.props.value === value}>
              {child.props.label}
            </button>
          ))
        : null}
    </div>
  ),
  SegmentedControlItem: () => null,
}));
vi.mock('@astryxdesign/core/Token', () => ({ Token: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('@astryxdesign/core/ProgressBar', () => ({ ProgressBar: () => <div role="progressbar" /> }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: false }),
  inheritUserOrg: () => ({}), inheritMemberOrg: () => ({}),
  withAdminPageScope: (_scope: unknown, run: (db: unknown) => unknown) => run({
    user: { findMany: mocks.members, count: async () => 1 },
    memberEvent: { groupBy: async () => [] },
    counselorAssignment: { findMany: async () => [] },
  }),
}));
vi.mock('@/lib/content/programTitle', () => ({ programDisplayTitle: (slug: string) => slug }));
vi.mock('@/lib/admin/healthScore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/healthScore')>()),
  calculateHealthStatus: () => 'green',
}));
vi.mock('@/lib/admin/studentsRosterEnrichment', () => ({ loadStudentRosterEnrichment: mocks.enrichment }));
vi.mock('@/lib/coursera/progressQueries', () => ({ loadUnmatchedLearners: async () => [], countUnmatchedLearners: async () => 0 }));
vi.mock('@/lib/admin/trainingRosterLoad', () => ({ loadTrainingRoster: async () => ({ ok: false }) }));
vi.mock('@/lib/attention/admin', () => ({ getAdminAttention: mocks.attention }));

import { StudentsRosterKit } from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import { ADMIN_ATTENTION_HREF, buildCommandCenterAttentionRows } from '@/lib/attention/adminViews';
import { emptyAttentionQueue, type AttentionQueue, type MemberAttention } from '@/lib/attention/evaluate';
import type { AttentionReason } from '@/lib/attention/reasons';
import { STUDENTS_FOCUS_UNAVAILABLE_NOTICE } from '@/lib/admin/studentsRosterFocus';
import type { StudentsRosterFocus } from '@/lib/admin/studentsRosterView';

function flagged(memberId: string, reasons: AttentionReason[]): MemberAttention {
  return {
    memberId, memberName: memberId, memberEmail: `${memberId}@example.test`, enrolledProgram: null,
    reasons, primaryReason: reasons[0], severity: 'warning', urgency: 1, context: {}, lastActivityAt: null,
  };
}

/** Two members new with no counselor (one also has a pending application), one only at risk. */
function attentionQueue(): AttentionQueue {
  const queue = emptyAttentionQueue();
  queue.rows.push(
    flagged('new-1', ['new_no_counselor']),
    flagged('new-2', ['pending_application', 'new_no_counselor']),
    flagged('risk-1', ['risk_alert']),
  );
  for (const row of queue.rows) for (const reason of row.reasons) queue.totals.byReason[reason] += 1;
  return queue;
}

const ROWS: StudentRow[] = [
  {
    id: 'u1', name: 'Noel Gonzalez', email: 'noel@example.test', location: 'Austin, TX', program: 'IT Support',
    progress: 22, readiness: 40, counselor: 'S. Chen', status: 'At Risk',
    training: { modulesDone: 2, modulesTotal: 10, pace: 'Behind' },
    courseraGrade: 85.4, inWap: true, lastActive: '2h ago', lastActiveAt: 3,
  },
  {
    id: 'u2', name: 'Joseph Ring', email: 'joseph@example.test', location: 'Austin, TX', program: 'AI',
    progress: 16, readiness: 55, counselor: 'R. Patel', status: 'In Training',
    training: { modulesDone: 0, modulesTotal: 17, pace: 'Stalled' },
    courseraGrade: 86.8, inWap: true, lastActive: '1d ago', lastActiveAt: 2,
  },
];

function checkedChip(): string {
  const group = screen.getByRole('radiogroup', { name: 'Roster filters' });
  return within(group).getAllByRole('radio').find((radio) => radio.getAttribute('aria-checked') === 'true')?.textContent ?? '';
}

afterEach(cleanup);

describe('roster kit opens on the chip an attention link asks for', () => {
  it('starts filtered on At Risk and shows only those students', () => {
    render(<StudentsRosterKit students={ROWS} total={2} initialChip="At Risk" />);
    expect(checkedChip()).toMatch(/^At Risk · 1/);
    expect(screen.getAllByText('Noel Gonzalez').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Joseph Ring')).toHaveLength(0);
  });

  it('falls back to All when the chip does not exist in this view', () => {
    render(<StudentsRosterKit students={ROWS} total={2} view="training" initialChip="At Risk" />);
    expect(checkedChip()).toMatch(/^All · 2/);
    expect(screen.getAllByText('Joseph Ring').length).toBeGreaterThan(0);
  });

  it('opens on a focus: only those members, the rule, a way back, and chip counts inside the focus', () => {
    const focus: StudentsRosterFocus = {
      label: 'New applicants with no counselor',
      detail: 'Joined in the last 7 days with no active counselor assignment',
      memberIds: ['u2'],
      clearHref: '/admin/students',
    };
    render(<StudentsRosterKit students={ROWS} total={2} focus={focus} />);
    const notice = screen.getByTestId('students-roster-focus');
    expect(notice).toHaveTextContent('New applicants with no counselor · 1');
    expect(notice).toHaveTextContent('Joined in the last 7 days with no active counselor assignment.');
    expect(within(notice).getByRole('link', { name: 'Show all students' })).toHaveAttribute('href', '/admin/students');
    expect(checkedChip()).toMatch(/^All · 1/);
    expect(screen.getAllByText('Joseph Ring').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Noel Gonzalez')).toHaveLength(0);
    expect(screen.getByTestId('students-roster-footer')).toHaveTextContent('Showing 1 of 1');
  });

  it('says how many focused members this list could not show, instead of dropping them silently', () => {
    const focus: StudentsRosterFocus = {
      label: 'New applicants with no counselor', detail: 'Rule', memberIds: ['u1', 'not-loaded-1', 'not-loaded-2'], clearHref: '/admin/students',
    };
    render(<StudentsRosterKit students={ROWS} total={2} focus={focus} />);
    expect(screen.getByTestId('students-roster-focus')).toHaveTextContent('New applicants with no counselor · 1');
    expect(screen.getByTestId('students-roster-focus')).toHaveTextContent("2 more are past this list's load limit; open them from Today.");
  });

  it('opens the training preset on its real Stalled chip', () => {
    render(<StudentsRosterKit students={ROWS} total={2} view="training" initialChip="Stalled" />);
    expect(checkedChip()).toMatch(/^Stalled · 1/);
    expect(screen.getAllByText('Joseph Ring').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Noel Gonzalez')).toHaveLength(0);
  });
});

describe('/admin/students resolves ?needs= from the attention links', () => {
  const member = {
    id: 'member-1', fullName: 'Fixture Learner', email: 'learner@example.test',
    enrolledProgram: 'program', enrolledAt: new Date('2026-08-01'),
    assessmentScorePct: 0, memberStatus: null, interviewRequestedAt: null, interviewCompletedAt: null,
    lastLoginAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-19'), profile: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.members.mockResolvedValue([member]);
    mocks.enrichment.mockResolvedValue([]);
    mocks.attention.mockResolvedValue(attentionQueue());
  });

  async function kitPropsFor(href: string) {
    vi.doMock('@/components/portal/kit/pages/admin-subviews/StudentsRosterKit', () => ({
      StudentsRosterKit: (props: Record<string, unknown>) => { mocks.kit(props); return null; },
    }));
    const { default: AdminStudentsPage } = await import('@/app/admin/students/page');
    const url = new URL(href, 'https://example.test');
    expect(url.pathname).toBe('/admin/students');
    render(await AdminStudentsPage({ searchParams: Promise.resolve(Object.fromEntries(url.searchParams)) }));
    return mocks.kit.mock.calls.at(-1)?.[0] as {
      initialChip: string; view: string; focus?: StudentsRosterFocus; notice?: string;
    };
  }

  it('a risk alert or a quiet member opens the At Risk chip, with no focus and no attention read', async () => {
    expect(await kitPropsFor(ADMIN_ATTENTION_HREF.risk_alert)).toMatchObject({ view: 'roster', initialChip: 'At Risk', focus: undefined });
    expect(await kitPropsFor(ADMIN_ATTENTION_HREF.no_activity_30d)).toMatchObject({ view: 'roster', initialChip: 'At Risk', focus: undefined });
    expect(await kitPropsFor('/admin/students?needs=anything-else')).toMatchObject({ initialChip: 'All', focus: undefined });
    expect(await kitPropsFor('/admin/students')).toMatchObject({ initialChip: 'All', focus: undefined });
    expect(mocks.attention).not.toHaveBeenCalled();
  });

  it('new applicants open on exactly the members the admin Today row counts', async () => {
    const props = await kitPropsFor(ADMIN_ATTENTION_HREF.new_no_counselor);
    expect(props).toMatchObject({ view: 'roster', initialChip: 'All' });
    expect(props.focus).toMatchObject({
      label: 'New applicants with no counselor',
      detail: 'Joined in the last 7 days with no active counselor assignment',
      memberIds: ['new-1', 'new-2'],
      clearHref: '/admin/students',
    });
    const todayRow = buildCommandCenterAttentionRows(attentionQueue()).find((row) => row.id === 'new_no_counselor')!;
    expect(todayRow.href).toBe(ADMIN_ATTENTION_HREF.new_no_counselor);
    expect(props.focus!.memberIds).toHaveLength(todayRow.count);
    expect(mocks.attention).toHaveBeenCalledWith({ ok: true, orgId: 'org-1', superAdmin: false });
  });

  it('the training preset does not focus', async () => {
    mocks.members.mockResolvedValue([member]);
    const { loadStudentsRosterFocus } = await import('@/lib/admin/studentsRosterFocus');
    await expect(
      loadStudentsRosterFocus({ ok: true, orgId: 'org-1', superAdmin: false } as never, 'new-applicants', 'training'),
    ).resolves.toEqual({ focus: null, failed: false });
    expect(mocks.attention).not.toHaveBeenCalled();
  });

  it('a failed attention read falls back to everyone with a notice, never an empty list', async () => {
    mocks.attention.mockRejectedValue(new Error('db down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const props = await kitPropsFor(ADMIN_ATTENTION_HREF.new_no_counselor);
    expect(props.focus).toBeUndefined();
    expect(props.notice).toBe(STUDENTS_FOCUS_UNAVAILABLE_NOTICE);
    error.mockRestore();
  });
});
