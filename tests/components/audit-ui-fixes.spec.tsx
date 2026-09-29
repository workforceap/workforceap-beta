import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { MemberCertificatesKit } from '@/components/portal/kit/pages/member/MemberCertificatesKit';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import CourseraProgressCoverageNotice from '@/components/portal/CourseraProgressCoverageNotice';
import AddMemberWizard from '@/app/admin/members/new/AddMemberWizard';
import { COUNSELOR_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import en from '@/messages/en.json';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const root = path.resolve(__dirname, '../..');

/** Portal audits 2026-09-20 — UI fixes that are cheap to pin as behaviour. */
describe('certificates page primary CTA', () => {
  it('is "Continue course" when a course is in progress, with Message counselor secondary', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MemberCertificatesKit
          inProgress={[{ id: 'x', title: 'Intro to Software Engineering', percent: 20, note: '3 of 17 courses complete' }]}
          inProgressCount={1}
          continueHref="/dashboard/program"
        />
      </NextIntlClientProvider>,
    );
    const primary = screen.getByRole('link', { name: 'Continue course' });
    expect(primary).toHaveAttribute('href', '/dashboard/program');
    expect(primary.className).not.toContain('wa-kit-cta--ghost');
    expect(screen.getByRole('link', { name: 'Message counselor' }).className).toContain('wa-kit-cta--ghost');
  });

  it('keeps Message counselor primary when nothing is in progress', () => {
    render(<NextIntlClientProvider locale="en" messages={en}><MemberCertificatesKit /></NextIntlClientProvider>);
    expect(screen.queryByRole('link', { name: 'Continue course' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Message counselor' }).className).not.toContain('wa-kit-cta--ghost');
  });
});

describe('counselor navigation', () => {
  it('lists every reachable counselor route', () => {
    const hrefs = new Set(COUNSELOR_PORTAL_NAV_ITEMS.map((item) => item.href));
    for (const route of [
      '/counselor/at-risk',
      '/counselor/triage',
      '/counselor/queue',
      '/counselor/inactive-members',
      '/counselor/placements',
      '/counselor/notifications',
    ]) {
      expect(hrefs.has(route), route).toBe(true);
    }
  });
});

describe('member copy', () => {
  it('interview-prep tab title matches the page, not WIOA', () => {
    expect(en.dashboard.interviewPrepMetaTitle).toBe('Interview prep');
  });

  it('messages thread is addressed to a counselor or support, never "Inbox"', () => {
    const page = readFileSync(path.join(root, 'app/(portal)/dashboard/messages/page.tsx'), 'utf8');
    expect(page).toContain("counselorName ?? t('workforceapSupport')");
    expect(page).not.toContain("counselorName ?? t('inbox')");
    expect(en.messages.workforceapSupport).toBe('WorkforceAP support');
    expect(en.messages.yourCounselor).toBe('Your counselor');
  });

  it('home h1 falls back to "Welcome back, <name>" instead of a bare first name', () => {
    const renderHome = (props: { firstName?: string; greeting?: string }) =>
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <MemberHomeKit coursePercent={0} activeJobs={0} certs={0} points={0} {...props} />
        </NextIntlClientProvider>,
      );

    renderHome({ firstName: 'Maya' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back, Maya');
    cleanup();

    renderHome({});
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Home');
  });

  it('Coursera coverage notice speaks to members', () => {
    render(<CourseraProgressCoverageNotice coverage="unavailable" />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Progress may be a few hours behind.');
    expect(notice).not.toHaveTextContent(/could not be fully refreshed/);
  });
});

describe('admin headings', () => {
  it('outcomes methodology demotes the markdown h1 so the page has one h1', () => {
    const src = readFileSync(path.join(root, 'app/admin/outcomes/methodology/page.tsx'), 'utf8');
    expect(src).toContain('h1: ({ children }) => <h2>{children}</h2>');
  });

  it('command-center queue counts pluralise', () => {
    const page = readFileSync(path.join(root, 'app/admin/command-center/page.tsx'), 'utf8');
    expect(page).not.toMatch(/\$\{totals\.\w+\} items`/);
    const client = readFileSync(path.join(root, 'components/admin/AdminCommandCenterClient.tsx'), 'utf8');
    expect(client).not.toContain('View all {count} items</Link>');
  });
});

describe('stat tiles colour by state, not by column (WAP-99)', () => {
  it('keeps every number neutral and declares a derived tone only on the tile hook', async () => {
    const { StatTile } = await import('@/components/portal/kit/StatTile');
    const { container } = render(
      <>
        <StatTile label="Avg Caseload" value={12} />
        <StatTile label="At-Risk Owned" value={3} tone="alert" />
      </>,
    );
    const values = container.querySelectorAll<HTMLElement>('.wa-kit-stat-value');
    expect(values[0].style.color).toBe('');
    expect(values[1].style.color).toBe('');
    const cards = container.querySelectorAll<HTMLElement>('.wa-kit-card');
    expect(cards[0].className).not.toMatch(/wa-kit-tone--/);
    expect(cards[1].classList.contains('wa-kit-tone--alert')).toBe(true);
  });
});

describe('counselor home queue', () => {
  it('is titled "Caseload" with a caught-up state when nothing is flagged', async () => {
    const { CounselorHomeKit } = await import('@/components/portal/kit/pages/counselor/CounselorHomeKit');
    render(<CounselorHomeKit firstName="Dana" assignedCount={8} onTrackCount={8} queueRows={[]} queueTotal={0} />);
    expect(screen.getByRole('heading', { name: 'Caseload', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Needs attention' })).toBeNull();
    expect(screen.getByText(/Nothing flagged · 8 members on track/)).toBeInTheDocument();
  });

  it('is titled "Needs attention" only when a member is flagged', async () => {
    const { CounselorHomeKit } = await import('@/components/portal/kit/pages/counselor/CounselorHomeKit');
    render(
      <CounselorHomeKit
        firstName="Dana"
        assignedCount={8}
        queueRows={[{ memberId: 'm1', memberName: 'Jordan Williams', bucket: 'warning', blockerReason: 'No activity 10+ days' }]}
        queueTotal={1}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Needs attention', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/1 member in queue/)).toBeInTheDocument();
  });
});

describe('admin add-member wizard', () => {
  it('starts eligibility answers unanswered instead of defaulting to "No"', async () => {
    const user = userEvent.setup();
    render(<AddMemberWizard programs={[]} partners={[]} subgroups={[]} />);

    const citizen = screen.getByRole('group', { name: 'US Citizen or Permanent Resident? *' });
    const authorized = screen.getByRole('group', { name: 'Authorized to work in US? *' });
    for (const group of [citizen, authorized]) {
      expect(within(group).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
      expect(within(group).getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false');
    }

    // Fill every other required step-1 field; only the two unanswered
    // eligibility questions should keep the step closed.
    await user.type(screen.getByLabelText('First Name *'), 'Maya');
    await user.type(screen.getByLabelText('Email *'), 'maya@example.com');
    const employment = screen.getByLabelText('Employment Status *') as HTMLSelectElement;
    await user.selectOptions(employment, within(employment).getAllByRole('option')[1]);
    const education = screen.getByLabelText('Education Level *') as HTMLSelectElement;
    await user.selectOptions(education, within(education).getAllByRole('option')[1]);

    const next = screen.getByRole('button', { name: 'Continue to Step 2' });
    expect(next).toBeDisabled();

    await user.click(within(citizen).getByRole('button', { name: 'Yes' }));
    expect(next).toBeDisabled();
    await user.click(within(authorized).getByRole('button', { name: 'Yes' }));
    expect(next).toBeEnabled();
  });
});

describe('partner portal', () => {
  it('legacy overview uses the kit StatusTag, not the legacy pill', () => {
    const src = readFileSync(path.join(root, 'app/(portal)/partner/page.tsx'), 'utf8');
    expect(src).not.toContain('StatusBadge');
    // #2385 moved the import onto the kit barrel; the pill component is what matters.
    expect(src).toMatch(/import \{[^}]*\bStatusTag\b[^}]*\} from '@\/components\/portal\/kit(?:\/StatusTag)?';/);
    expect(src).toContain('<StatusTag tone={row.stage === \'placed\' ? \'ok\' : \'alert\'}>');
  });

  it('/partner/signup fallback points to the canonical public sign-up form', () => {
    const src = readFileSync(path.join(root, 'app/(portal)/partner/signup/page.tsx'), 'utf8');
    expect(src).toContain("redirect('/partners#partner-signup')");
  });
});
