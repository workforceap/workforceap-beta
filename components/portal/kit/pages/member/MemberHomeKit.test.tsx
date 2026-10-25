import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import messages from '@/messages/en.json';
import { MemberHomeKit } from './MemberHomeKit';
import { MemberPipelineTable } from './MemberPipelineTable';
import { splitLead } from './MemberTaskRow';

// The kit's cards use next/navigation hooks that need a mounted app router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
// The placement row and the First 90 Days row call server actions; the render
// tests only click them against these mocks.
const actions = vi.hoisted(() => ({
  confirmPlacement: vi.fn(),
  submitFirst90DaysCheckIn: vi.fn(),
}));
vi.mock('@/app/(portal)/dashboard/placementAction', () => ({ confirmPlacement: actions.confirmPlacement }));
vi.mock('@/app/(portal)/dashboard/first90DaysAction', () => ({ submitFirst90DaysCheckIn: actions.submitFirst90DaysCheckIn }));

beforeEach(() => {
  actions.confirmPlacement.mockReset();
  actions.submitFirst90DaysCheckIn.mockReset();
});

function renderKit(ui: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
}

const base = {
  firstName: 'Sam',
  coursePercent: 0,
  programTitle: 'IT Support Professional Certificate (IBM)',
  programStatus: 'In progress',
  activeJobs: 0,
  certs: 0,
  points: 0,
  currentStreak: 0,
  longestStreak: 0,
  goals: [],
  pipeline: [],
  pointsLedger: [],
  certModulesDone: 0,
  certModulesTotal: 9,
  doThisNext: {
    id: 'skills_assessment',
    title: 'Take your WIOA Preassessment (35 questions)',
    body: 'Short preassessment.',
    href: '/dashboard/assessment',
    cta: 'Start preassessment',
    variant: 'urgent' as const,
    weight: 90,
  },
};

describe('MemberHomeKit certification-path card', () => {
  it('links the next module title when the loader supplies a module href', () => {
    renderKit(
      <MemberHomeKit
        {...base}
        nextLesson="Introduction to Technical Support"
        nextLessonHref="/dashboard/program?course=introduction-to-technical-support"
      />,
    );
    const link = screen.getByRole('link', { name: 'Introduction to Technical Support' });
    expect(link.getAttribute('href')).toBe('/dashboard/program?course=introduction-to-technical-support');
    expect(screen.queryByText('No next module on file.')).toBeNull();
    // Today's action keeps its CTA.
    expect(screen.getByRole('link', { name: /Start preassessment/ })).toBeTruthy();
  });

  it('falls back to plain text without a module href and to the empty copy without a next lesson', () => {
    const { unmount } = renderKit(<MemberHomeKit {...base} nextLesson="Take your WIOA Preassessment (35 questions)" />);
    expect(screen.queryByRole('link', { name: 'Take your WIOA Preassessment (35 questions)' })).toBeNull();
    expect(screen.getAllByText(/Next:/).length).toBeGreaterThan(0);
    unmount();

    renderKit(<MemberHomeKit {...base} />);
    expect(screen.getByText('No next module on file.')).toBeTruthy();
  });

  // Dashboard progress semantics (PRODUCT_STAKES, Approval Required): partial
  // course progress reads as progress, never as an earned certificate. This
  // pinned the legacy home's first-cert bar until WAP-195 retired it; the kit
  // certification-path card is the one surface that shows it now.
  it('shows recorded course progress without claiming a certificate', () => {
    renderKit(<MemberHomeKit {...base} coursePercent={50} certModulesDone={1} certModulesTotal={2} />);
    expect(screen.getByRole('progressbar', { name: 'Certification module progress' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.queryByText(/certifi(ed|cation earned)|certificate earned/i)).toBeNull();
  });

  it('keeps the WorkforceAP lab note one tap away under "What the module count includes"', () => {
    const note = 'Nine courses: eight on the Coursera path plus the WorkforceAP Lab.';
    renderKit(<MemberHomeKit {...base} programCoursesNote={note} />);
    const text = screen.getByTestId('program-courses-note');
    expect(text.textContent).toBe(note);
    const disclosure = text.closest('details') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(within(disclosure).getByText('What the module count includes')).toBeTruthy();
  });
});

describe('MemberHomeKit resume module CTA', () => {
  it('rewrites the dead training stub to My Program and keeps the query string', () => {
    const { container } = renderKit(
      <MemberHomeKit {...base} resumeHref="/dashboard/training?program=google-it-support" />,
    );
    const link = screen.getByRole('link', { name: /Resume module/ });
    expect(link.getAttribute('href')).toBe('/dashboard/program?program=google-it-support');
    // The CTA lives in the certification-path card in the main column of the two-column home grid.
    const card = link.closest('.wa-kit-cert-path');
    expect(card).not.toBeNull();
    expect(card!.parentElement?.className).toBe('wa-kit-home-grid__main');
    expect(container.querySelector('a[href="/dashboard/training"]')).toBeNull();
    expect(container.querySelector('a[href^="/dashboard/training?"]')).toBeNull();
  });

  it('leaves a real resume destination alone and defaults to My Program', () => {
    const { unmount } = renderKit(<MemberHomeKit {...base} resumeHref="/dashboard/learning" />);
    expect(screen.getByRole('link', { name: /Resume module/ }).getAttribute('href')).toBe('/dashboard/learning');
    unmount();

    renderKit(<MemberHomeKit {...base} />);
    expect(screen.getByRole('link', { name: /Resume module/ }).getAttribute('href')).toBe('/dashboard/program');
  });
});

/**
 * The home is "This week": one card of ordered task rows. The four totals
 * tiles, the application pipeline, the points ledger, the streak pair and the
 * Start-here tiles left it (points and the pipeline live on Progress and Jobs).
 */
describe('MemberHomeKit one-screen "This week" home', () => {
  const upNext = [
    {
      id: 'upload_resume',
      title: 'Add your resume',
      body: 'Upload a resume so employers and AI tools can tailor help to your background.',
      href: '/dashboard/ai-tools/resume-studio?view=rewrite',
      cta: 'Try resume rewriter',
      variant: 'default' as const,
      weight: 80,
    },
    {
      id: 'career_readiness',
      title: 'Build your job readiness plan',
      body: 'Review your readiness checklist.',
      href: '/dashboard/readiness',
      cta: 'Open readiness',
      variant: 'default' as const,
      weight: 68,
    },
  ];
  const recommendedTool = {
    slug: 'interview-prep',
    title: 'Get ready for your interview',
    body: 'You have an interview or screening in your tracker.',
    href: '/dashboard/ai-tools/interview-prep',
    cta: 'Open interview prep',
  };
  const offers = [{ id: 'o1', role: 'IT Support Specialist', company: 'Acme Health' }];
  const first90 = {
    stage: 'day_30' as const,
    daysSincePlacement: 20,
    employerName: 'Acme Health',
    currentStageResponse: null,
    completedStages: ['week_1' as const],
  };

  function weekList() {
    return screen.getByRole('list', { name: 'Steps for this week' });
  }

  it('puts today first, then the rows that apply, in order', () => {
    renderKit(
      <MemberHomeKit
        {...base}
        doThisNext={{ ...base.doThisNext, id: 'resume-module', title: 'Shared Responsibility Model', href: '/dashboard/program', cta: 'Resume module' }}
        jobOffers={offers}
        first90={first90}
        upNext={upNext}
        recommendedTool={recommendedTool}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'This week' })).toBeTruthy();
    const rows = Array.from(weekList().children) as HTMLElement[];
    const titles = rows.map((row) => row.querySelector('.wa-kit-task-row__title')?.textContent);
    expect(titles).toEqual([
      'Shared Responsibility Model',
      'Did you accept the role at Acme Health?',
      'Your new job at Acme Health',
      'Take your WIOA Preassessment',
      'Add your resume',
      'Build your job readiness plan',
      'Try this next: Get ready for your interview',
    ]);
    expect(screen.getByText('7 steps')).toBeTruthy();
    // Exactly one row carries the crimson "current" ring: the first.
    const states = rows.map((row) => (row.matches('[data-state]') ? row : row.querySelector('[data-state]'))?.getAttribute('data-state'));
    expect(states).toEqual(['current', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo']);
  });

  it('lists each next step as one link to its page, with its CTA as the row action', () => {
    renderKit(<MemberHomeKit {...base} upNext={upNext} />);
    const links = Array.from(weekList().querySelectorAll('a'));
    // Today's CTA first, then the preassessment is NOT repeated (today already is it).
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard/assessment',
      '/dashboard/ai-tools/resume-studio?view=rewrite',
      '/dashboard/readiness',
    ]);
    expect(links[1]?.textContent).toContain('Add your resume');
    expect(links[1]?.textContent).toContain('Try resume rewriter');
  });

  it('names the recommended tool as the last row and keeps the way to every tool', () => {
    renderKit(<MemberHomeKit {...base} upNext={upNext} recommendedTool={recommendedTool} />);
    const row = screen.getByTestId('recommended-tool');
    expect(row.getAttribute('data-tool')).toBe('interview-prep');
    expect(row.getAttribute('href')).toBe('/dashboard/ai-tools/interview-prep');
    expect(row.textContent).toContain('Open interview prep');
    expect(weekList().lastElementChild?.contains(row)).toBe(true);
    // The quiet link row still reaches every tool.
    expect(within(screen.getByRole('navigation', { name: 'Shortcuts' })).getByRole('link', { name: 'AI Career Tools' })).toHaveAttribute(
      'href',
      '/dashboard/ai-tools',
    );
  });

  it('shows the WIOA preassessment as a row only while it is pending and not already today', () => {
    // Pending, and today is something else: its own row.
    const { unmount } = renderKit(
      <MemberHomeKit {...base} doThisNext={{ ...base.doThisNext, id: 'resume-module', title: 'Resume module', href: '/dashboard/program' }} />,
    );
    const row = screen.getByTestId('member-preassessment-row');
    expect(row.getAttribute('href')).toBe('/dashboard/assessment');
    expect(row.textContent).toContain('35 questions for your counselor');
    unmount();

    // Already on file: no row.
    const done = renderKit(
      <MemberHomeKit {...base} preassessmentCompleted doThisNext={{ ...base.doThisNext, id: 'resume-module', title: 'Resume module', href: '/dashboard/program' }} />,
    );
    expect(screen.queryByTestId('member-preassessment-row')).toBeNull();
    done.unmount();

    // Pending but today already is the preassessment: one row, not two.
    renderKit(<MemberHomeKit {...base} />);
    expect(screen.queryByTestId('member-preassessment-row')).toBeNull();
    expect(screen.getAllByRole('link', { name: /preassessment/i })).toHaveLength(1);
  });

  it('says so, plainly, when there are no steps', () => {
    renderKit(<MemberHomeKit {...base} doThisNext={null} preassessmentCompleted />);
    expect(screen.queryByRole('list', { name: 'Steps for this week' })).toBeNull();
    expect(screen.getByText('No steps this week.')).toBeTruthy();
  });

  it('no longer renders the totals tiles, pipeline, points ledger, streak or Start-here tiles', () => {
    const { container } = renderKit(
      <MemberHomeKit
        {...base}
        activeJobs={4}
        certs={2}
        points={1240}
        currentStreak={12}
        longestStreak={12}
        pointsThisWeek={85}
        pointsLedger={[{ label: 'Module complete', amount: 40 }]}
        pipeline={[{ role: 'Help Desk Analyst', company: 'Acme', stage: 'Applied', tone: 'muted' }]}
        courseSpark={{ series: [1, 2, 3], delta: '4%' }}
      />,
    );
    expect(container.querySelector('[data-testid="stat-spark-tile"]')).toBeNull();
    expect(screen.queryByText('Application pipeline')).toBeNull();
    expect(screen.queryByText('Help Desk Analyst')).toBeNull();
    expect(screen.queryByText('Recent points')).toBeNull();
    expect(screen.queryByText(/day streak/)).toBeNull();
    expect(screen.queryByText('1,240')).toBeNull();
    expect(screen.queryByTestId('member-start-here')).toBeNull();
    expect(screen.queryByText('What the AI Career Tools do')).toBeNull();
  });

  it('keeps one quiet row of links to Progress, Points, Jobs, AI Career Tools and the Learning hub', () => {
    // Points joined the row (Addendum A1): the streak and the ledger left Home and
    // the signed-in points page is the only route that still shows them. Jobs
    // joined it too (Addendum A5): the application pipeline left Home for the
    // Job board, which already lists the member's applications.
    renderKit(<MemberHomeKit {...base} progressHref="/dev/member/progress" pointsHref="/dashboard/points" jobsHref="/dev/member/jobs" toolkitHref="/dev/member/toolkit" coursesHref="/dev/member/program" />);
    const nav = within(screen.getByRole('navigation', { name: 'Shortcuts' }));
    expect(nav.getAllByRole('link').map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['Progress', '/dev/member/progress'],
      ['Points', '/dashboard/points'],
      ['Jobs', '/dev/member/jobs'],
      ['AI Career Tools', '/dev/member/toolkit'],
      ['Learning hub', '/dev/member/program'],
    ]);
  });

  it('defaults the Progress link to the real My progress route, Points to the points page and Jobs to the Job board', () => {
    renderKit(<MemberHomeKit {...base} />);
    expect(screen.getByRole('link', { name: 'Progress' })).toHaveAttribute('href', '/dashboard/readiness');
    expect(screen.getByRole('link', { name: 'Points' })).toHaveAttribute('href', '/dashboard/points');
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/dashboard/jobs');
  });

  it('shows study minutes against the weekly goal when there is one, and no points', () => {
    const week = [
      { day: 'Mon', minutes: 120 },
      { day: 'Tue', minutes: 128 },
    ];
    const { unmount } = renderKit(<MemberHomeKit {...base} weeklyActivity={week} weeklyStudyGoalMinutes={240} pointsThisWeek={85} />);
    expect(screen.getByText('4h 8m of your 4h goal')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Study goal progress' })).toHaveAttribute('aria-valuenow', '100');
    // No points number anywhere on Home; the only "Points" text is the shortcut link to the points page.
    expect(within(screen.getByRole('region', { name: 'Study this week' })).queryByText(/points/i)).toBeNull();
    expect(screen.queryByText(/\d+ points/i)).toBeNull();
    unmount();

    // No goal on file: the total alone, nothing invented.
    renderKit(<MemberHomeKit {...base} weeklyActivity={week} />);
    expect(screen.getByText('4h 8m')).toBeTruthy();
    expect(screen.queryByText(/of your .* goal/i)).toBeNull();
    expect(screen.queryByRole('progressbar', { name: 'Study goal progress' })).toBeNull();
  });

  it('puts the long part of today\'s subline under "What happens next"', () => {
    const body = 'Confirm your contact details. Your counselor uses them to reach you and to review your file.';
    renderKit(<MemberHomeKit {...base} doThisNext={{ ...base.doThisNext, body }} />);
    const row = screen.getByTestId('member-today-row');
    expect(row.querySelector('.wa-kit-task-row__sub')?.textContent).toBe('Confirm your contact details.');
    const more = row.querySelector('details') as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(more.textContent).toContain('Your counselor uses them to reach you and to review your file.');
    expect(within(more).getByText('What happens next')).toBeTruthy();
  });
});

describe('splitLead', () => {
  it('returns short text whole', () => {
    expect(splitLead('Short preassessment.')).toEqual({ lead: 'Short preassessment.', rest: '' });
  });
  it('splits a long body on its first sentence and drops nothing', () => {
    const body = 'First sentence is short. The second sentence carries the long explanation that would crowd a single row line.';
    const { lead, rest } = splitLead(body, 60);
    expect(lead).toBe('First sentence is short.');
    expect(`${lead} ${rest}`).toBe(body);
  });
  it('keeps a long single sentence whole instead of cutting it', () => {
    const body = 'One long sentence with no break inside the limit that still has to be shown in full to the member.';
    expect(splitLead(body, 40)).toEqual({ lead: body, rest: '' });
  });
});

describe('MemberPipelineTable company line (moved off the home)', () => {
  it('hides QA / demo / sandbox employers and keeps real ones', () => {
    renderKit(
      <MemberPipelineTable
        rows={[
          { role: 'Browser Tester', company: 'QA Audit Co', stage: 'Applied', tone: 'muted', appliedLabel: 'Apr 21' },
          { role: 'IT Support Technician', company: 'Dell Technologies', stage: 'Applied', tone: 'muted', appliedLabel: 'Apr 15' },
        ]}
      />,
    );
    expect(screen.getAllByText('Browser Tester').length).toBeGreaterThan(0);
    expect(screen.queryByText('QA Audit Co')).toBeNull();
    expect(screen.getAllByText('IT Support Technician').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dell Technologies').length).toBeGreaterThan(0);
  });
});

describe('MemberHomeKit pieces moved over from the legacy home', () => {
  const first90 = {
    stage: 'day_30' as const,
    daysSincePlacement: 20,
    employerName: 'Acme Health',
    currentStageResponse: null,
    completedStages: ['week_1' as const],
  };

  it('asks about each OFFER application as a row, below today', () => {
    renderKit(<MemberHomeKit {...base} jobOffers={[{ id: 'o1', role: 'IT Support Specialist', company: 'Acme Health' }]} />);
    const question = screen.getByText('Did you accept the role at Acme Health?');
    expect(screen.getByRole('button', { name: /notify my team/ })).toBeTruthy();
    const hero = screen.getByRole('link', { name: /Start preassessment/ });
    expect(hero.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A row in the This week list, not a card with its own gutter.
    const row = question.closest('li') as HTMLElement;
    expect(row.getAttribute('data-testid')).toBe('member-offer-row');
    expect(row.className).toContain('wa-kit-task-row');
    expect(row.parentElement?.tagName).toBe('OL');
    expect(row.style.padding).toBe('');
    expect(row.style.marginBottom).toBe('');
    // The long explanation is under "What happens next", not on the main line.
    expect(within(row).getByText('What happens next')).toBeTruthy();
    expect((row.querySelector('details') as HTMLDetailsElement).open).toBe(false);
  });

  it('confirming an offer logs it and leaves a done row that says what happened', async () => {
    actions.confirmPlacement.mockResolvedValue({ placementOutcome: 'created' });
    renderKit(<MemberHomeKit {...base} jobOffers={[{ id: 'o1', role: 'IT Support Specialist', company: 'Acme Health' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, notify my team' }));
    const status = await screen.findByRole('status');
    expect(actions.confirmPlacement).toHaveBeenCalledWith('o1');
    expect(status).toHaveTextContent('Placement logged: Acme Health');
    expect(status).toHaveTextContent(/counselor has been alerted/i);
    expect(status.closest('li')).toHaveAttribute('data-state', 'done');
    expect(screen.queryByRole('heading', { name: /Did you accept the role/ })).toBeNull();
  });

  it('"Not yet" hides the question for the session', () => {
    renderKit(<MemberHomeKit {...base} jobOffers={[{ id: 'o1', role: 'IT Support Specialist', company: 'Acme Health' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not yet, hide this question' }));
    expect(screen.queryByRole('heading', { name: /Did you accept the role/ })).toBeNull();
    expect(actions.confirmPlacement).not.toHaveBeenCalled();
  });

  it('shows the First 90 Days check-in as a row for a placed member', () => {
    renderKit(<MemberHomeKit {...base} first90={first90} />);
    expect(screen.getByText('Your new job at Acme Health')).toBeTruthy();
    expect(screen.getByText("How's the job going?")).toBeTruthy();
    const row = screen.getByTestId('member-first90-row');
    expect(row.className).toContain('wa-kit-task-row');
    expect(row.style.padding).toBe('');
    // Scripts and the advisor note sit under "What happens next".
    const more = row.querySelector('details') as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(more.textContent).toContain('Talk to your supervisor');
    expect(more.textContent).toContain('no-cost to members');
  });

  it('answering the check-in turns the row into a done row with the thank-you line', async () => {
    actions.submitFirst90DaysCheckIn.mockResolvedValue(undefined);
    renderKit(<MemberHomeKit {...base} first90={first90} />);
    fireEvent.click(screen.getByRole('button', { name: 'Going well' }));
    await waitFor(() => expect(screen.getByTestId('member-first90-row')).toHaveAttribute('data-state', 'done'));
    expect(actions.submitFirst90DaysCheckIn).toHaveBeenCalledWith('day_30', 'going_well');
    expect(screen.getByTestId('member-first90-row')).toHaveTextContent(/Great to hear/);
    expect(screen.queryByText("How's the job going?")).toBeNull();
  });

  it('shows the youth notice for a member under 18', () => {
    renderKit(<MemberHomeKit {...base} youthNoticeAge={16} />);
    const notice = screen.getByRole('region', { name: 'Youth Member Portal (Age 16)' });
    expect(notice.textContent).toContain('Full job board access and applications become available when you turn 18');
  });

  it('renders none of them for a member they do not apply to', () => {
    renderKit(<MemberHomeKit {...base} />);
    expect(screen.queryByText(/Did you accept the role/)).toBeNull();
    expect(screen.queryByText('First 90 Days')).toBeNull();
    expect(screen.queryByText(/Youth Member Portal/)).toBeNull();
  });

  it('sends "Open goals" to the goals section on the career brief, never into ?ui=legacy', () => {
    const { container } = renderKit(<MemberHomeKit {...base} goals={[{ title: 'Apply to 5 roles', percent: 40 }]} />);
    expect(screen.getByRole('link', { name: 'Open goals' }).getAttribute('href')).toBe('/dashboard/career-brief#goals');
    expect(screen.queryByRole('link', { name: /Set a goal/ })).toBeNull();
    expect(container.querySelector('a[href*="ui=legacy"]')).toBeNull();
  });

  it('offers a quiet "Set a goal" link in the Next badge card when there are no goals', () => {
    const { container } = renderKit(<MemberHomeKit {...base} goals={[]} />);
    const link = screen.getByRole('link', { name: /Set a goal/ });
    expect(link.getAttribute('href')).toBe('/dashboard/career-brief#goals');
    expect(link.closest('.wa-kit-card')?.textContent).toContain('Next badge');
    expect(screen.queryByRole('link', { name: 'Open goals' })).toBeNull();
    expect(container.querySelector('a[href*="ui=legacy"]')).toBeNull();
  });
});

// ── WAP-194: the staff-view banner and the view-only program switch ─────────
const TWO_PROGRAMS = {
  options: [
    { id: 'enr-1', programSlug: 'aws-cloud-technology-amazon', programTitle: 'AWS Cloud Technology Certificate', isPrimary: true },
    { id: 'enr-2', programSlug: 'comptia-a-professional-certificate', programTitle: 'CompTIA A+ Professional Certificate (CompTIA A+)', isPrimary: false },
  ],
  activeProgramSlug: 'aws-cloud-technology-amazon',
  viewingSecondary: false,
};

describe('MemberHomeKit staff-view banner', () => {
  it('shows StaffViewBanner only for a staff viewer', () => {
    const { container, unmount } = renderKit(<MemberHomeKit {...base} showStaffViewBanner />);
    const banner = container.querySelector('[data-staff-view-banner="dashboard"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toMatch(/viewing this as a super-admin/);
    // Kit paint: lucide icons, no Material Symbols, no legacy --color-* chain.
    expect(banner?.querySelector('.material-symbols-outlined')).toBeNull();
    expect(banner?.querySelectorAll('svg.lucide').length).toBe(2);
    expect(banner?.getAttribute('style') ?? '').not.toMatch(/--color-|rgba?\(/);
    unmount();

    const member = renderKit(<MemberHomeKit {...base} />);
    expect(member.container.querySelector('[data-staff-view-banner]')).toBeNull();
  });
});

describe('MemberHomeKit enrolled-program switch (view only)', () => {
  it('puts DashboardProgramSelector on the Certification path card when there are two or more enrollments', () => {
    renderKit(<MemberHomeKit {...base} programSwitch={TWO_PROGRAMS} />);
    const wrap = screen.getByTestId('home-program-switch');
    const card = wrap.closest('.wa-kit-cert-path');
    expect(card, 'the switch sits on the Certification path card').not.toBeNull();
    const chip = screen.getByTestId('dashboard-program-selector');
    expect(chip).toHaveTextContent('1 of 2 programs');
    expect(chip.querySelector('.material-symbols-outlined')).toBeNull();
    expect(chip.getAttribute('style') ?? '').not.toMatch(/--color-|rgba?\(/);
    // The primary view says nothing about Learning hub links.
    expect(screen.queryByText(/My Program shows your primary program/)).toBeNull();
  });

  it('links a secondary program into My Program for that program (WAP-196)', () => {
    const href = '/dashboard/program?program=comptia-a-professional-certificate';
    renderKit(
      <MemberHomeKit
        {...base}
        programHref={href}
        programSwitch={{ ...TWO_PROGRAMS, activeProgramSlug: 'comptia-a-professional-certificate', viewingSecondary: true }}
      />,
    );
    expect(screen.getByTestId('dashboard-program-selector')).toHaveTextContent('2 of 2 programs');
    // The old "links open the Learning hub" caveat is gone: the links now open this program.
    expect(screen.queryByText(/My Program shows your primary program/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Open plan' }).getAttribute('href')).toBe(href);
  });

  it('renders no switch for one enrollment or none', () => {
    const { unmount } = renderKit(
      <MemberHomeKit {...base} programSwitch={{ ...TWO_PROGRAMS, options: TWO_PROGRAMS.options.slice(0, 1) }} />,
    );
    expect(screen.queryByTestId('home-program-switch')).toBeNull();
    unmount();
    renderKit(<MemberHomeKit {...base} programSwitch={null} />);
    expect(screen.queryByTestId('dashboard-program-selector')).toBeNull();
  });
});
