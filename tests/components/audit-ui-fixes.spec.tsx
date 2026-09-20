import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemberCertificatesKit } from '@/components/portal/kit/pages/member/MemberCertificatesKit';
import { COUNSELOR_PORTAL_NAV_ITEMS } from '@/lib/nav/portalNav';
import en from '@/messages/en.json';

const root = path.resolve(__dirname, '../..');

/** Portal audits 2026-09-20 — UI fixes that are cheap to pin as behaviour. */
describe('certificates page primary CTA', () => {
  it('is "Continue course" when a course is in progress, with Message counselor secondary', () => {
    render(
      <MemberCertificatesKit
        inProgress={[{ id: 'x', title: 'Intro to Software Engineering', percent: 20, note: '3 of 17 courses complete' }]}
        inProgressCount={1}
        continueHref="/dashboard/program"
      />,
    );
    const primary = screen.getByRole('link', { name: 'Continue course' });
    expect(primary).toHaveAttribute('href', '/dashboard/program');
    expect(primary.className).not.toContain('wa-kit-cta--ghost');
    expect(screen.getByRole('link', { name: 'Message counselor' }).className).toContain('wa-kit-cta--ghost');
  });

  it('keeps Message counselor primary when nothing is in progress', () => {
    render(<MemberCertificatesKit />);
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
    const src = readFileSync(path.join(root, 'components/portal/kit/pages/member/MemberHomeKit.tsx'), 'utf8');
    expect(src).toContain('firstName ? `Welcome back, ${firstName}` : \'Home\'');
  });

  it('Coursera coverage notice speaks to members', () => {
    const src = readFileSync(path.join(root, 'components/portal/CourseraProgressCoverageNotice.tsx'), 'utf8');
    expect(src).toContain('Progress may be a few hours behind.');
    expect(src).not.toContain('could not be fully refreshed');
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

describe('stat tiles colour numbers by state, not by column (WAP-99)', () => {
  it('ignores the categorical color prop and paints only a derived tone', async () => {
    const { StatTile } = await import('@/components/portal/kit/StatTile');
    const { container } = render(
      <>
        <StatTile label="Avg Caseload" value={12} color="info" />
        <StatTile label="At-Risk Owned" value={3} tone="accent" />
      </>,
    );
    const values = container.querySelectorAll('.wa-kit-stat-value');
    expect((values[0] as HTMLElement).style.color).toBe('var(--wa-text)');
    expect((values[1] as HTMLElement).style.color).toBe('var(--wa-accent)');
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
  it('starts eligibility answers unanswered instead of defaulting to "No"', () => {
    const src = readFileSync(path.join(root, 'app/admin/members/new/AddMemberWizard.tsx'), 'utf8');
    expect(src).toContain('usCitizen: null,\n  authorizedToWork: null,');
    expect(src).toContain('form.usCitizen === true && form.authorizedToWork === true');
  });
});

describe('partner portal', () => {
  it('legacy overview uses the kit StatusTag, not the legacy pill', () => {
    const src = readFileSync(path.join(root, 'app/(portal)/partner/page.tsx'), 'utf8');
    expect(src).not.toContain('StatusBadge');
    expect(src).toContain("import { StatusTag } from '@/components/portal/kit/StatusTag';");
  });

  it('/partner/signup redirects to the public /partner-signup page', () => {
    const src = readFileSync(path.join(root, 'app/(portal)/partner/signup/page.tsx'), 'utf8');
    expect(src).toContain("redirect('/partner-signup')");
  });
});
