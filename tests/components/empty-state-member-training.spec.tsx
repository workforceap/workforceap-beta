import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard/learning',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/(portal)/dashboard/_actions/analyticsActions', () => ({ logCourseraLaunchFromPortal: vi.fn(async () => undefined) }));
// Server pages: auth, DB and loaders are stubbed; translations are the real en.json.
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'member-1' })) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    pathwayStepProgress: { findMany: vi.fn(async () => []) },
    counselorAssignment: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock('@/lib/member/skillMissions', () => ({ loadSkillMissionSummary: vi.fn(async () => null) }));
vi.mock('@/lib/coursera/memberSkillsetProgress', () => ({ loadMemberSkillsetProgress: vi.fn(async () => []) }));
vi.mock('@/lib/content/careerBriefPersonalization', () => ({ getCareerBriefContext: vi.fn(async () => ({ recommendedActions: [] })) }));
vi.mock('@/lib/content/programResources', () => ({ getResourcesForCategory: vi.fn(() => []) }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => {
    let node: unknown = (en as Record<string, unknown>)[ns];
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    return typeof node === 'string' ? node : `${ns}.${key}`;
  }),
}));
vi.mock('@/components/portal/PageHeader', () => ({ default: ({ title }: { title: string }) => <h2>{title}</h2> }));
vi.mock('@/components/portal/LearningPathCard', () => ({ default: () => <div>Path card fixture</div> }));
vi.mock('@/components/portal/LearningHubDestinationCards', () => ({ default: () => <div>Destinations fixture</div> }));
vi.mock('@/components/portal/FindYourCareerSection', () => ({ default: () => <div>Career fixture</div> }));
vi.mock('@/components/portal/SkillMissionPanel', () => ({ default: () => <div>Missions fixture</div> }));
vi.mock('@/components/portal/SkillsetProgressList', () => ({ default: () => <div>Skillsets fixture</div> }));
vi.mock('@/components/portal/VoiceCoachLauncherCard', () => ({ default: () => <div>Voice fixture</div> }));
vi.mock('@/components/portal/ResourceFilters', () => ({
  default: ({ onCategoryChange }: { onCategoryChange: (c: 'Resume' | '') => void }) => (
    <button type="button" onClick={() => onCategoryChange('Resume')}>Filter fixture</button>
  ),
}));
vi.mock('@/components/portal/ResourceCard', () => ({ default: ({ resource }: { resource: { title: string } }) => <div>{resource.title}</div> }));

import { MemberProgramKit } from '@/components/portal/kit/pages/member/MemberProgramKit';
import { MemberTrainingWorkspace } from '@/components/portal/kit/pages/member/MemberTrainingWorkspace';
import { MemberProgressKit } from '@/components/portal/kit/pages/member/MemberProgressKit';
import LearningHubEnrolledCourses from '@/components/portal/LearningHubEnrolledCourses';
import LearningPage from '@/app/(portal)/dashboard/learning/page';
import DashboardResourcesPage from '@/app/(portal)/dashboard/resources/page';
import DashboardResourcesClient from '@/app/(portal)/dashboard/resources/ResourcesClient';
import LibraryResourcesClient from '@/app/(portal)/resources/ResourcesClient';
import type { TrainingWorkspace } from '@/lib/member/trainingWorkspace';
import type { MemberResource } from '@/lib/content/memberResources';
import { prisma } from '@/lib/db/prisma';

/**
 * PR 4 of the empty-state consolidation (KIT_GUIDE §6): the member program /
 * learning / resources / progress surfaces render every empty state through
 * KitEmptyState with a `kind` and `empty.*` copy. The kinds follow what the
 * loaders actually do: an enrolled member whose curriculum, course list or
 * resource list is not published sees `unavailable` and a counselor route —
 * never "will appear here once you're enrolled" — while a member with no
 * program sees `first` and the real first step. Readiness lists are `first`
 * with no CTA (nothing the member does creates a row), and a failed score
 * read stays `unavailable`/danger.
 */

const LOCALES = { en, es, fr, pt } as const;
type Locale = keyof typeof LOCALES;
const RAW_KEY = /\bempty\.[a-zA-Z]+\.[a-zA-Z]+\b/;
const ENROLLMENT_GATE = /once you're enrolled|when your enrollment is ready|will appear here/i;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function emptyOf(root: ParentNode, kind: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`.wa-kit-empty[data-kind="${kind}"]`);
  expect(el, `a KitEmptyState with data-kind="${kind}"`).not.toBeNull();
  return el as HTMLElement;
}
function noLegacyEmpty(root: ParentNode) {
  expect(root.querySelector('.portal-empty-state, .resource-empty-state')).toBeNull();
}
/** Rendered with exactly the messages the (portal) layout ships to the browser. */
function portal(locale: Locale, ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale={locale} messages={pickClientMessageSlice(LOCALES[locale], 'portal')}>{ui}</NextIntlClientProvider>);
}
function expectCounselorRoute(empty: HTMLElement, m: (typeof LOCALES)[Locale], group: 'modules' | 'assignedCourses' | 'enrolledCoursesUnavailable' | 'learningPathwayUnavailable' | 'programResources') {
  expect(empty.dataset.tone).toBe(group === 'enrolledCoursesUnavailable' || group === 'learningPathwayUnavailable' ? 'warn' : 'info');
  expect(empty).not.toHaveAttribute('role');
  expect(within(empty).getByRole('heading')).toHaveTextContent(m.empty[group].title);
  expect(within(empty).getByText(m.empty[group].body).className).toContain('wa-kit-lede');
  const action = within(empty).getByRole('link', { name: m.empty[group].action });
  expect(action).toHaveAttribute('href', '/dashboard/messages');
  expect(action.className).toContain('wa-kit-cta');
  expect(empty.textContent).not.toMatch(RAW_KEY);
  expect(empty.textContent).not.toMatch(ENROLLMENT_GATE);
}

const workspace = (courses: TrainingWorkspace['courses']): TrainingWorkspace => ({
  programSlug: 'fixture-program',
  programTitle: 'Fixture program',
  curriculumVersion: 'fixture-v1',
  weeklyHours: null,
  planStartDate: null,
  totalEstimatedHours: 0,
  publishedSyllabusHours: 0,
  courses,
} as TrainingWorkspace);

describe('MemberProgramKit', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: an empty module list is unavailable (curriculum not published), with a counselor route', (locale) => {
    const { container } = portal(locale, <MemberProgramKit modules={[]} resumeHref="/dashboard/learning" missionsHref="/dashboard/missions" />);
    const empty = emptyOf(container, 'unavailable');
    expectCounselorRoute(empty, LOCALES[locale], 'modules');
    expect(within(empty).getByRole('heading', { level: 4 })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/No modules on this path yet\./);
  });

  it('never claims "No missions assigned" — the route does not load missions', () => {
    const { container } = portal('en', <MemberProgramKit modules={[{ title: 'Cloud Concepts', state: 'active', slug: 'cloud-concepts' }]} missionsHref="/dashboard/missions" />);
    expect(container.querySelector('.wa-kit-empty')).toBeNull();
    expect(container.textContent).not.toMatch(/No missions assigned/);
    expect(container.textContent).toMatch(/Open missions to see what is ready/);
    expect(screen.getByRole('link', { name: /Open missions/ })).toHaveAttribute('href', '/dashboard/missions');
  });

  it('shows the summary line when the caller loaded one', () => {
    portal('en', <MemberProgramKit modules={[{ title: 'Cloud Concepts', state: 'done' }]} missionsSummary="3 missions ready on this path." />);
    expect(screen.getByText('3 missions ready on this path.')).toBeInTheDocument();
  });
});

describe('MemberTrainingWorkspace', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a workspace with no courses is unavailable (info) at h2, with a counselor route — never "when your enrollment is ready"', () => {
    const { container } = portal('en', <MemberTrainingWorkspace workspace={workspace([])} programTitle="Fixture program" completedSlugs={[]} practiceMissions={[]} destinations={[]} />);
    const empty = emptyOf(container, 'unavailable');
    expectCounselorRoute(empty, en, 'assignedCourses');
    expect(within(empty).getByRole('heading', { level: 2 })).toHaveTextContent(en.empty.assignedCourses.title);
    expect(container.textContent).not.toMatch(/enrollment is ready/);
  });

  it('renders the course editor, not the empty state, when a course exists', () => {
    const { container } = portal('en', (
      <MemberTrainingWorkspace
        workspace={workspace([{ slug: 'course-1', name: 'Course one', estimatedHours: 4, kind: 'coursera', notes: '', artifactUrl: null, updatedAt: null }])}
        programTitle="Fixture program"
        completedSlugs={[]}
        practiceMissions={[]}
        destinations={[]}
      />
    ));
    expect(container.querySelector('.wa-kit-empty')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Course one' })).toBeInTheDocument();
  });
});

describe('LearningHubEnrolledCourses', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: no program → first, the first step is My Program', (locale) => {
    const m = LOCALES[locale];
    const { container } = portal(locale, <LearningHubEnrolledCourses programSlug={null} programTitle={null} courses={[]} completedSlugs={[]} assessmentCompleted={false} />);
    noLegacyEmpty(container);
    const empty = emptyOf(container, 'first');
    expect(empty.dataset.tone).toBe('muted');
    expect(empty.className).toContain('wa-kit-empty--framed');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty.enrolledCourses.title);
    expect(within(empty).getByText(m.empty.enrolledCourses.body).className).toContain('wa-kit-lede');
    expect(within(empty).getByRole('link', { name: m.empty.enrolledCourses.action })).toHaveAttribute('href', '/dashboard/program');
    expect(empty.textContent).not.toMatch(RAW_KEY);
  });

  it('an enrolled program whose curriculum has no published courses → unavailable with a counselor route, not "choose a track"', () => {
    const { container } = portal('en', <LearningHubEnrolledCourses programSlug="fixture-program" programTitle="Fixture program" courses={[]} completedSlugs={[]} assessmentCompleted />);
    const empty = emptyOf(container, 'unavailable');
    expectCounselorRoute(empty, en, 'enrolledCoursesUnavailable');
    expect(container.textContent).not.toMatch(/Choose a track|Go to My Program/);
  });

  it('a program slug the catalog no longer knows is the same unavailable state', () => {
    const { container } = portal('en', <LearningHubEnrolledCourses programSlug="retired-program" programTitle={null} courses={[]} completedSlugs={[]} assessmentCompleted />);
    emptyOf(container, 'unavailable');
    expect(container.querySelector('.wa-kit-empty[data-kind="first"]')).toBeNull();
  });
});

describe('/dashboard/learning page', () => {
  it('no enrolled program → first pathway state (digital basics + choose a program) in both layouts, plus the first-kind course list', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ enrolledProgram: null, assessmentCompleted: false, courseraEnrollmentApproved: false, courseEnrollments: [], courseProgress: [] } as never);
    const { container } = portal('en', <>{await LearningPage()}</>);
    noLegacyEmpty(container);
    const pathway = container.querySelectorAll<HTMLElement>('.wa-kit-empty[data-kind="first"]');
    expect(pathway).toHaveLength(3); // mobile + desktop pathway state, enrolled-courses section
    for (const empty of Array.from(pathway).slice(0, 2)) {
      expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(en.empty.learningPathway.title);
      expect(within(empty).getByRole('link', { name: en.empty.learningPathway.action })).toHaveAttribute('href', expect.stringContaining('/dashboard/learning/modules/'));
      expect(within(empty).getByRole('link', { name: en.empty.learningPathway.secondary })).toHaveAttribute('href', '/dashboard/program');
      expect(empty.className).toContain('wa-kit-empty--framed');
    }
    expect(container.querySelector('.wa-kit-empty[data-kind="unavailable"]')).toBeNull();
    expect(container.textContent).not.toMatch(RAW_KEY);
  });

  it('an enrolled program the catalog cannot resolve → unavailable pathway state with a counselor route, no "choose a program"', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ enrolledProgram: 'retired-program-fixture', assessmentCompleted: true, courseraEnrollmentApproved: true, courseEnrollments: [], courseProgress: [] } as never);
    const { container } = portal('en', <>{await LearningPage()}</>);
    const unavailable = container.querySelectorAll<HTMLElement>('.wa-kit-empty[data-kind="unavailable"]');
    expect(unavailable).toHaveLength(3); // mobile + desktop pathway state, enrolled-courses section
    expectCounselorRoute(unavailable[0], en, 'learningPathwayUnavailable');
    expectCounselorRoute(unavailable[2], en, 'enrolledCoursesUnavailable');
    expect(container.querySelector('.wa-kit-empty[data-kind="first"]')).toBeNull();
    expect(screen.queryByRole('link', { name: en.empty.learningPathway.secondary })).toBeNull();
  });
});

describe('resources', () => {
  it('/dashboard/resources with no catalog resources for the program area → unavailable (info), counselor + AI tools, never an enrollment gate', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ enrolledProgram: 'fixture-program', enrolledAt: null } as never);
    const { container } = portal('en', <>{await DashboardResourcesPage()}</>);
    noLegacyEmpty(container);
    const empty = emptyOf(container, 'unavailable');
    expectCounselorRoute(empty, en, 'programResources');
    expect(empty.className).toContain('wa-kit-empty--framed');
    const secondary = within(empty).getByRole('link', { name: en.empty.programResources.secondary });
    expect(secondary).toHaveAttribute('href', '/dashboard/ai-tools');
    expect(secondary.className).toContain('wa-kit-cta--ghost');
    expect(screen.queryByRole('link', { name: 'Choose a program' })).toBeNull();
  });

  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: the dashboard ResourcesClient guard renders the same unavailable state', (locale) => {
    const { container } = portal(locale, <DashboardResourcesClient resources={[]} />);
    expectCounselorRoute(emptyOf(container, 'unavailable'), LOCALES[locale], 'programResources');
  });

  const resource: MemberResource = { id: 'r1', title: 'Resume basics', summary: 's', category: 'Interviewing', stage: 'New to workforce', tags: [], url: 'https://example.test', type: 'link' };

  it('career library: rows exist but none match → filtered with a real Clear filters button', () => {
    const { container } = portal('en', <LibraryResourcesClient resources={[resource]} />);
    expect(container.querySelector('.wa-kit-empty')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filter fixture' }));
    const empty = emptyOf(container, 'filtered');
    noLegacyEmpty(container);
    expect(empty.dataset.tone).toBe('muted');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(en.empty.resourcesFiltered.title);
    const clear = within(empty).getByRole('button', { name: en.empty.resourcesFiltered.action });
    expect(clear.className).toContain('wa-kit-cta');
    fireEvent.click(clear);
    expect(container.querySelector('.wa-kit-empty')).toBeNull();
    expect(screen.getByText('Resume basics')).toBeInTheDocument();
  });

  it('career library: nothing published → unavailable pointing at the tools that exist, never "check back soon"', () => {
    const { container } = portal('en', <LibraryResourcesClient resources={[]} />);
    const empty = emptyOf(container, 'unavailable');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(en.empty.resourcesUnavailable.title);
    expect(within(empty).getByRole('link', { name: en.empty.resourcesUnavailable.action })).toHaveAttribute('href', '/dashboard/ai-tools');
    expect(within(empty).queryByRole('button')).toBeNull();
    expect(container.textContent).not.toMatch(/check back soon/i);
  });
});

describe('MemberProgressKit', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('%s: empty category scores and milestones are first states with no CTA', (locale) => {
    const m = LOCALES[locale];
    const { container } = portal(locale, <MemberProgressKit readinessScore={0} weekStats={[]} milestones={[]} />);
    const empties = container.querySelectorAll<HTMLElement>('.wa-kit-empty');
    expect(empties).toHaveLength(2);
    for (const empty of Array.from(empties)) {
      expect(empty.dataset.kind).toBe('first');
      expect(empty.dataset.tone).toBe('muted');
      expect(within(empty).queryByRole('link')).toBeNull();
      expect(within(empty).queryByRole('button')).toBeNull();
      expect(empty.textContent).not.toMatch(RAW_KEY);
    }
    expect(within(empties[0]).getByRole('heading', { level: 3 })).toHaveTextContent(m.empty.categoryScores.title);
    expect(within(empties[1]).getByRole('heading', { level: 4 })).toHaveTextContent(m.empty.milestones.title);
    expect(screen.queryByRole('link', { name: 'Open profile' })).toBeNull();
  });

  it('a failed score read is unavailable/danger (role=alert) with the readiness coach as the way forward', () => {
    const { container } = portal('en', <MemberProgressKit loadFailed />);
    const empty = emptyOf(container, 'unavailable');
    expect(empty.dataset.tone).toBe('danger');
    expect(empty).toHaveAttribute('role', 'alert');
    expect(within(empty).getByRole('heading', { level: 3 })).toHaveTextContent(en.empty.readinessUnavailable.title);
    expect(within(empty).getByRole('link', { name: en.empty.readinessUnavailable.action })).toHaveAttribute('href', expect.stringContaining('/dashboard/ai-tools/studio'));
    expect(container.querySelector('[data-portal-error-state="member-readiness-load"]')).not.toBeNull();
    expect(container.querySelectorAll('.wa-kit-empty')).toHaveLength(1);
  });
});
