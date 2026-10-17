import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import messages from '@/messages/en.json';
import { MemberHomeKit } from './MemberHomeKit';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/(portal)/dashboard/placementAction', () => ({ confirmPlacement: vi.fn() }));
vi.mock('@/app/(portal)/dashboard/first90DaysAction', () => ({ submitFirst90DaysCheckIn: vi.fn() }));

function renderKit(ui: ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
}

const home = messages.dashboard.home;

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

describe('MemberHomeKit focus card', () => {
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
    expect(screen.queryByText(home.noNextModule)).toBeNull();
    expect(screen.getByRole('link', { name: home.resumeModuleN.replace('{n}', '1') })).toBeTruthy();
  });

  it('falls back to plain text without a module href and to the empty copy without a next lesson', () => {
    const { unmount } = renderKit(<MemberHomeKit {...base} nextLesson="Take your WIOA Preassessment (35 questions)" />);
    expect(screen.queryByRole('link', { name: 'Take your WIOA Preassessment (35 questions)' })).toBeNull();
    expect(screen.getAllByText('Take your WIOA Preassessment (35 questions)').length).toBeGreaterThan(0);
    unmount();

    renderKit(<MemberHomeKit {...base} />);
    expect(screen.getAllByText(home.noNextModule).length).toBeGreaterThan(0);
  });

  it('states remaining modules as a claim and does not call partial progress a certificate', () => {
    renderKit(<MemberHomeKit {...base} coursePercent={50} certModulesDone={1} certModulesTotal={2} />);
    expect(screen.getByRole('heading', { name: /You are 1 module away from completing your IT Support Professional Certificate \(IBM\) training/ })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Modules complete, 1 of 2' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.queryByText(/certifi(ed|cation earned)|certificate earned/i)).toBeNull();
  });
});

describe('MemberHomeKit resume module CTA', () => {
  it('rewrites the dead training stub to My Program and keeps the query string', () => {
    const { container } = renderKit(
      <MemberHomeKit {...base} resumeHref="/dashboard/training?program=google-it-support" />,
    );
    const link = screen.getByRole('link', { name: home.resumeModuleN.replace('{n}', '1') });
    expect(link.getAttribute('href')).toBe('/dashboard/program?program=google-it-support');
    const card = link.closest('.wa-kit-cert-path');
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute('data-testid', 'member-home-focus');
    expect(container.querySelector('a[href="/dashboard/training"]')).toBeNull();
    expect(container.querySelector('a[href^="/dashboard/training?"]')).toBeNull();
  });

  it('leaves a real resume destination alone and defaults to My Program', () => {
    const { unmount } = renderKit(<MemberHomeKit {...base} resumeHref="/dashboard/learning" />);
    expect(screen.getByRole('link', { name: home.resumeModuleN.replace('{n}', '1') }).getAttribute('href')).toBe('/dashboard/learning');
    unmount();

    renderKit(<MemberHomeKit {...base} />);
    expect(screen.getByRole('link', { name: home.resumeModuleN.replace('{n}', '1') }).getAttribute('href')).toBe('/dashboard/program');
  });
});

describe('MemberHomeKit no longer paints positional stat tiles', () => {
  it('does not render the four Command Center tiles', () => {
    renderKit(<MemberHomeKit {...base} coursePercent={0} courseProgressStale />);
    expect(screen.queryByText('Course')).toBeNull();
    expect(screen.queryByText('Active jobs')).toBeNull();
    expect(screen.queryByText('Points')).toBeNull();
    expect(screen.queryByTestId('stat-spark-tile')).toBeNull();
  });
});

describe('MemberHomeKit interview steps + recommended tool', () => {
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

  it('lists interview-readiness steps as links and keeps other next steps off that list', () => {
    renderKit(<MemberHomeKit {...base} upNext={upNext} />);
    const list = screen.getByRole('list', { name: home.interviewClaim });
    const links = Array.from(list.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/dashboard/readiness']);
    expect(links[0]?.textContent).toContain('Build your job readiness plan');
    expect(screen.queryByText('Add your resume')).toBeNull();
  });

  it('names the recommended tool and keeps the way to every tool', () => {
    renderKit(<MemberHomeKit {...base} upNext={upNext} recommendedTool={recommendedTool} />);
    const card = screen.getByTestId('recommended-tool');
    expect(card.getAttribute('data-tool')).toBe('interview-prep');
    expect(screen.getByRole('link', { name: /Open interview prep/ }).getAttribute('href')).toBe(
      '/dashboard/ai-tools/interview-prep',
    );
    expect(screen.getByRole('link', { name: 'Explore all AI Career Tools' }).getAttribute('href')).toBe('/dashboard/ai-tools');
  });

  it('omits an empty interview list while retaining the tools introduction', () => {
    renderKit(<MemberHomeKit {...base} />);
    expect(screen.queryByRole('list', { name: home.interviewClaim })).toBeNull();
    expect(screen.queryByTestId('recommended-tool')).toBeNull();
    expect(screen.getByRole('link', { name: 'Explore AI Career Tools' })).toHaveAttribute('href', '/dashboard/ai-tools');
  });
});

describe('MemberHomeKit curriculum rows', () => {
  it('labels finished modules as Done, not Next module', () => {
    renderKit(
      <MemberHomeKit
        {...base}
        certModulesDone={7}
        certModulesTotal={9}
        curriculum={[
          { title: 'Networking', state: 'done', grade: 'Completed · Grade: 98%', number: 6 },
          { title: 'Shared Responsibility Model', state: 'active', due: 'Due Thursday', number: 8 },
        ]}
      />,
    );
    expect(screen.getByText(/Module 6: Networking/)).toBeTruthy();
    expect(screen.getByText(home.curriculumDone)).toBeTruthy();
    expect(screen.queryByText(/Next module 6/)).toBeNull();
  });
});

describe('MemberHomeKit application pipeline actions', () => {
  it('keeps the Action labels visible for every stage', () => {
    renderKit(
      <MemberHomeKit
        {...base}
        pipeline={[
          { role: 'IT Support Specialist', company: 'Lakeview Health System', stage: 'Interviewing', tone: 'warn', appliedLabel: 'Jun 18' },
          { role: 'Cloud Support Associate', company: 'Brightline Credit Union', stage: 'Screening', tone: 'info', appliedLabel: 'Jun 24' },
          { role: 'Help Desk Technician', company: 'Metro Transit Authority', stage: 'Applied', tone: 'muted', appliedLabel: 'Jun 29' },
        ]}
      />,
    );
    expect(screen.getAllByText(home.openNotes).length).toBeGreaterThan(0);
    expect(screen.getAllByText(home.details).length).toBeGreaterThan(0);
    expect(screen.getAllByText(home.review).length).toBeGreaterThan(0);
    expect(screen.getByText(home.pipelineAction)).toBeTruthy();
  });
});

describe('MemberHomeKit application pipeline company line', () => {
  it('hides QA / demo / sandbox employers and keeps real ones', () => {
    renderKit(
      <MemberHomeKit
        {...base}
        pipeline={[
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

  it('asks about each OFFER application, below the focus card', () => {
    renderKit(<MemberHomeKit {...base} jobOffers={[{ id: 'o1', role: 'IT Support Specialist', company: 'Acme Health' }]} />);
    const question = screen.getByRole('heading', { name: 'Did you accept the role at Acme Health?' });
    expect(screen.getByRole('button', { name: /notify my team/ })).toBeTruthy();
    const focus = screen.getByTestId('member-home-focus');
    expect(focus.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const strip = question.closest('section') as HTMLElement;
    expect(strip.style.padding).toBe('');
    expect(strip.style.marginBottom).toBe('');
    expect((strip.firstElementChild as HTMLElement).style.marginBottom).toBe('');
  });

  it('shows the First 90 Days check-in for a placed member', () => {
    renderKit(<MemberHomeKit {...base} first90={first90} />);
    expect(screen.getByText('Your new job at Acme Health')).toBeTruthy();
    expect(screen.getByText("How's the job going?")).toBeTruthy();
    const card = screen.getByRole('region', { name: 'First 90 Days' });
    expect(card.style.padding).toBe('');
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
    expect(screen.getByRole('link', { name: home.openGoals }).getAttribute('href')).toBe('/dashboard/career-brief#goals');
    expect(screen.queryByRole('link', { name: home.setAGoal })).toBeNull();
    expect(container.querySelector('a[href*="ui=legacy"]')).toBeNull();
  });

  it('offers a quiet "Set a goal" link when there are no goals', () => {
    const { container } = renderKit(<MemberHomeKit {...base} goals={[]} />);
    const link = screen.getByRole('link', { name: home.setAGoal });
    expect(link.getAttribute('href')).toBe('/dashboard/career-brief#goals');
    expect(screen.queryByRole('link', { name: home.openGoals })).toBeNull();
    expect(screen.queryByText('Next badge')).toBeNull();
    expect(container.querySelector('a[href*="ui=legacy"]')).toBeNull();
  });
});

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
    expect(banner?.querySelector('.material-symbols-outlined')).toBeNull();
    expect(banner?.querySelectorAll('svg.lucide').length).toBe(2);
    expect(banner?.getAttribute('style') ?? '').not.toMatch(/--color-|rgba?\(/);
    unmount();

    const member = renderKit(<MemberHomeKit {...base} />);
    expect(member.container.querySelector('[data-staff-view-banner]')).toBeNull();
  });
});

describe('MemberHomeKit enrolled-program switch (view only)', () => {
  it('puts DashboardProgramSelector on the focus card when there are two or more enrollments', () => {
    renderKit(<MemberHomeKit {...base} programSwitch={TWO_PROGRAMS} />);
    const wrap = screen.getByTestId('home-program-switch');
    const card = wrap.closest('.wa-kit-cert-path');
    expect(card, 'the switch sits on the focus card').not.toBeNull();
    const chip = screen.getByTestId('dashboard-program-selector');
    expect(chip).toHaveTextContent('1 of 2 programs');
    expect(chip.querySelector('.material-symbols-outlined')).toBeNull();
    expect(chip.getAttribute('style') ?? '').not.toMatch(/--color-|rgba?\(/);
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
    expect(screen.queryByText(/My Program shows your primary program/)).toBeNull();
    expect(screen.getByRole('link', { name: home.openPlan }).getAttribute('href')).toBe(href);
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
