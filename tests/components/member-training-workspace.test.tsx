import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { MemberTrainingWorkspace, nextCourseContinueTarget } from '@/components/portal/kit/pages/member/MemberTrainingWorkspace';
import type { TrainingWorkspace } from '@/lib/member/trainingWorkspace';
import { PROGRAM_SYLLABI } from '@/shared/programSyllabi';
import type { TrainingCoursePractice } from '@/lib/member/trainingCoursePractice';

// This is the server action called by the real Coursera launch link. Keep the
// actual link, form controls, kit components, and workspace behavior mounted.
vi.mock('@/app/(portal)/dashboard/_actions/analyticsActions', () => ({
  logCourseraLaunchFromPortal: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const programSlug = 'it-support-professional-certificate-ibm';
const syllabus = PROGRAM_SYLLABI[programSlug];
const courseSlug = (index: number) => `${programSlug}-course-${index + 1}`;
const launchHref = `/api/member/coursera/launch?course=${courseSlug(0)}`;
const moduleHref = `/dashboard/learning/modules/${courseSlug(9)}?program=${programSlug}`;

function fixture(): TrainingWorkspace {
  return {
    programSlug,
    programTitle: syllabus.title,
    curriculumVersion: 'test-syllabus-v1',
    weeklyHours: null,
    planStartDate: null,
    planUpdatedAt: null,
    totalEstimatedHours: syllabus.totalHours,
    publishedSyllabusHours: syllabus.totalHours,
    courses: syllabus.courses.map((course, index) => ({
      slug: courseSlug(index), name: course.name, estimatedHours: course.hours,
      description: course.description, kind: index === 9 ? 'workforceap' : 'coursera',
      notes: '', artifactUrl: null, updatedAt: null,
    })),
  };
}

function mount(workspace = fixture(), completedSlugs: string[] = [], practiceMissions: TrainingCoursePractice[] = [], modulesNote?: string | null) {
  return render(<NextIntlClientProvider locale="en" messages={en}><MemberTrainingWorkspace workspace={workspace} programTitle={workspace.programTitle}
    completedSlugs={completedSlugs} practiceMissions={practiceMissions} syllabusHours={160} syllabusBreakdown={syllabus.totalHoursLabel} modulesNote={modulesNote}
    destinations={[
      { slug: courseSlug(0), launchHref },
      { slug: courseSlug(9), moduleHref },
    ]} /></NextIntlClientProvider>);
}

const editor = () => screen.getByRole('region', { name: 'Selected course workspace' });
const outline = () => screen.getByRole('complementary', { name: 'Assigned curriculum' });
const notes = () => within(editor()).getByRole('textbox', { name: 'Course notes and project reflection' });
const evidenceLink = () => within(editor()).getByRole('textbox', { name: 'Project or evidence link' });
const saveWork = () => within(editor()).getByRole('button', { name: 'Save course work' });
const response = (workspace: TrainingWorkspace) => new Response(JSON.stringify({ workspace }), { status: 200 });

async function chooseCourse(index: number) {
  const item = within(outline()).getByText(syllabus.courses[index].name).closest('button');
  expect(item).not.toBeNull();
  await userEvent.click(item!);
}

function savedCourse(workspace: TrainingWorkspace, index: number, text: string, artifactUrl: string | null = null) {
  return {
    ...workspace,
    courses: workspace.courses.map((course, courseIndex) => courseIndex === index
      ? { ...course, notes: text, artifactUrl, updatedAt: '2026-09-09T02:00:00.000Z' } : course),
  };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/dashboard/program');
  // Browser capability shim for jsdom; no workspace component is mocked.
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(async () => {
  cleanup();
  // Flush focus/live-region callbacks before removing browser capability shims.
  await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('member training workspace', () => {
  it('resolves Continue this course to Coursera launch or the in-platform module', () => {
    expect(nextCourseContinueTarget(courseSlug(0), [{ slug: courseSlug(0), launchHref }])).toEqual({
      href: launchHref,
      kind: 'coursera',
    });
    expect(nextCourseContinueTarget(courseSlug(9), [{ slug: courseSlug(9), moduleHref }])).toEqual({
      href: moduleHref,
      kind: 'module',
    });
    expect(nextCourseContinueTarget(courseSlug(0), [])).toBeNull();
  });  it('shows the full supplied 160-hour curriculum and ten assigned courses', () => {
    mount();
    expect(screen.getByText('160 hours of assigned training')).toBeInTheDocument();
    expect(screen.getByText(syllabus.totalHoursLabel)).toBeInTheDocument();
    expect(within(outline()).getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('0 of 10 complete · 160 planned hours in unfinished courses')).toBeInTheDocument();
    for (const course of syllabus.courses) expect(within(outline()).getByText(course.name)).toBeInTheDocument();
  });

  it('calculates progress from all ten assigned courses without awarding credit for saved notes', () => {
    const workspace = savedCourse(fixture(), 9, 'Lab draft is saved, but not complete.');
    mount(workspace, [courseSlug(0), courseSlug(1), courseSlug(2), 'an-unrelated-completed-course']);
    expect(screen.getByRole('progressbar', { name: 'Assigned courses completed' })).toHaveAttribute('aria-valuenow', '30');
    expect(screen.getByText('3 of 10 complete · 114 planned hours in unfinished courses')).toBeInTheDocument();
    expect(screen.getByText('1 course with saved work')).toBeInTheDocument();
  });

  it('keeps independent unsaved notes and links when moving between courses', async () => {
    mount();
    fireEvent.change(notes(), { target: { value: 'Diagnosed a support request.' } });
    fireEvent.change(evidenceLink(), { target: { value: 'https://example.org/support-project' } });
    await chooseCourse(1);
    expect(notes()).toHaveValue('');
    fireEvent.change(notes(), { target: { value: 'Compared operating systems.' } });
    await chooseCourse(0);
    expect(notes()).toHaveValue('Diagnosed a support request.');
    expect(evidenceLink()).toHaveValue('https://example.org/support-project');
    await chooseCourse(1);
    expect(notes()).toHaveValue('Compared operating systems.');
    expect(new URL(window.location.href).searchParams.get('course')).toBe(courseSlug(1));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the saved server record after a successful save without marking completion', async () => {
    const workspace = fixture();
    vi.mocked(fetch).mockResolvedValue(response(savedCourse(workspace, 0, 'Saved server note', 'https://example.org/evidence')));
    mount(workspace);
    fireEvent.change(notes(), { target: { value: 'My draft note' } });
    fireEvent.change(evidenceLink(), { target: { value: '  https://example.org/evidence  ' } });
    await userEvent.click(saveWork());
    await waitFor(() => expect(notes()).toHaveValue('Saved server note'));
    expect(evidenceLink()).toHaveValue('https://example.org/evidence');
    expect(within(editor()).getByText('Saved in your account')).toBeInTheDocument();
    expect(screen.getByText('1 course with saved work')).toBeInTheDocument();
    expect(screen.getByText('0 of 10 complete · 160 planned hours in unfinished courses')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Assigned courses completed' })).toHaveAttribute('aria-valuenow', '0');
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/member/training-workspace');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: 'coursework', programSlug, curriculumVersion: workspace.curriculumVersion,
      courseSlug: courseSlug(0), notes: 'My draft note', artifactUrl: 'https://example.org/evidence',
    });
  });

  it('preserves newer edits and another selected course while an earlier save resolves', async () => {
    const workspace = fixture();
    let finishSave!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { finishSave = resolve; }));
    mount(workspace);
    fireEvent.change(notes(), { target: { value: 'Submitted first revision' } });
    await userEvent.click(saveWork());
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.change(notes(), { target: { value: 'Newer revision typed during save' } });
    await chooseCourse(1);
    fireEvent.change(notes(), { target: { value: 'Separate course draft' } });
    await act(async () => finishSave(response(savedCourse(workspace, 0, 'Submitted first revision'))));
    await waitFor(() => expect(saveWork()).toBeEnabled());
    expect(notes()).toHaveValue('Separate course draft');
    expect(within(editor()).getByRole('heading', { level: 2, name: syllabus.courses[1].name })).toBeInTheDocument();
    await chooseCourse(0);
    expect(notes()).toHaveValue('Newer revision typed during save');
    expect(within(editor()).getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('keeps coursework available for retry after an API save failure', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Your work was not saved. Please try again.' }), { status: 503 }));
    mount();
    fireEvent.change(notes(), { target: { value: 'Do not lose this lab reflection.' } });
    await userEvent.click(saveWork());
    await waitFor(() => expect(within(screen.getByRole('main')).getByText('Your work was not saved. Please try again.')).toBeInTheDocument());
    expect(notes()).toHaveValue('Do not lose this lab reflection.');
    expect(saveWork()).toBeEnabled();
    expect(within(editor()).getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByText('0 courses with saved work')).toBeInTheDocument();
  });

  it('only lists work in the saved filter after a successful API save', async () => {
    const workspace = fixture();
    vi.mocked(fetch).mockResolvedValue(response(savedCourse(workspace, 0, 'Saved lab notes')));
    mount(workspace);
    fireEvent.change(notes(), { target: { value: 'Saved lab notes' } });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Show courses' }), 'saved');
    expect(within(outline()).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(outline()).getByText('Save notes or a project link in any course to find them here.')).toBeInTheDocument();
    await userEvent.click(saveWork());
    await waitFor(() => expect(within(outline()).getAllByRole('listitem')).toHaveLength(1));
    expect(within(outline()).getByText(syllabus.courses[0].name)).toBeInTheDocument();
  });

  it('accepts only whole weekly hours from one through forty and saves an actual schedule', async () => {
    const workspace = fixture();
    vi.mocked(fetch).mockResolvedValue(response({ ...workspace, weeklyHours: 40, planStartDate: '2026-09-09', planUpdatedAt: '2026-09-09T02:00:00.000Z' }));
    mount(workspace);
    await userEvent.click(screen.getByRole('button', { name: 'Study schedule' }));
    const input = screen.getByRole('spinbutton', { name: 'Hours per week' });
    const save = screen.getByRole('button', { name: 'Save my study schedule' });
    fireEvent.change(screen.getByLabelText('Start this schedule on'), { target: { value: '2026-09-09' } });
    for (const value of ['', '0', '-1', '1.5', '41']) {
      fireEvent.change(input, { target: { value } });
      expect(save).toBeDisabled();
    }
    fireEvent.change(input, { target: { value: '1' } });
    expect(save).toBeEnabled();
    expect(screen.getByText('160 weeks')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '40' } });
    expect(save).toBeEnabled();
    expect(screen.getByText('4 weeks')).toBeInTheDocument();
    await userEvent.click(save);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update study schedule' })).toBeEnabled());
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      kind: 'plan', programSlug, curriculumVersion: workspace.curriculumVersion,
      weeklyHours: 40, planStartDate: '2026-09-09',
    });
    expect(screen.getByText('Saved pace · adjust it whenever your week changes.')).toBeInTheDocument();
  });

  it('uses the assigned Coursera and internal lesson destinations', async () => {
    mount();
    expect(within(editor()).getByRole('link', { name: /Open course in Coursera/ })).toHaveAttribute('href', launchHref);
    expect(within(editor()).getByRole('link', { name: /Open course in Coursera/ })).toHaveAttribute('target', '_blank');
    await chooseCourse(9);
    expect(within(editor()).getByRole('link', { name: 'Open lessons and lab' })).toHaveAttribute('href', moduleHref);
    expect(within(editor()).queryByRole('link', { name: /Open course in Coursera/ })).not.toBeInTheDocument();
  });

  it('makes Continue this course a real Coursera or module link, not a same-page no-op', async () => {
    const { unmount } = mount();
    const courseraContinue = screen.getByRole('link', { name: 'Continue this course' });
    expect(courseraContinue).toHaveAttribute('href', launchHref);
    expect(courseraContinue).toHaveAttribute('target', '_blank');
    unmount();

    mount(fixture(), [courseSlug(0), courseSlug(1), courseSlug(2), courseSlug(3), courseSlug(4), courseSlug(5), courseSlug(6), courseSlug(7), courseSlug(8)]);
    expect(screen.getByRole('link', { name: 'Continue this course' })).toHaveAttribute('href', moduleHref);
    expect(screen.getByRole('link', { name: 'Continue this course' })).not.toHaveAttribute('target', '_blank');
  });

  it('carries only assigned identifiers into a reviewable feedback request', async () => {
    mount(savedCourse(fixture(), 0, 'Private reflection must stay here.', 'https://example.org/private-project'));
    const link = () => within(editor()).getByRole('link', { name: /Ask for feedback on this course/ });
    let destination = new URL(link().getAttribute('href')!, window.location.origin);
    expect(destination.pathname).toBe('/dashboard/messages');
    expect(Object.fromEntries(destination.searchParams)).toEqual({ program: programSlug, course: courseSlug(0), curriculum: 'test-syllabus-v1' });
    expect(destination.href).not.toContain('Private');
    expect(destination.href).not.toContain('example.org');
    await chooseCourse(9);
    destination = new URL(link().getAttribute('href')!, window.location.origin);
    expect(destination.searchParams.get('course')).toBe(courseSlug(9));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens the selected course practice without sending an attempt or losing notes', async () => {
    const practice: TrainingCoursePractice = {
      assignedCourseSlug: courseSlug(0),
      mission: {
        key: 'fixture:mission:support', courseSlug: 'support-mission', programSlug,
        programTitle: syllabus.title, courseTitle: syllabus.courses[0].name,
        missionName: 'Support practice', missionTagline: 'Explain a support request.',
        primaryAxis: 'Service', skillLabels: ['Troubleshooting'], scenarioPrompt: 'Explain your diagnostic steps.',
        evidenceHint: 'Use concrete observations.', estimatedMinutes: 15,
        quizQuestions: [{ text: 'What comes first?', options: ['Ask', 'Guess', 'Restart', 'Ignore'] }],
        status: 'ready', completedAt: null, latestResult: null, aiToolResultId: null,
      },
    };
    mount(fixture(), [], [practice]);
    fireEvent.change(notes(), { target: { value: 'Keep this diagnostic reflection.' } });
    await userEvent.click(screen.getByRole('button', { name: 'Start this skill practice' }));
    expect(screen.getByRole('dialog', { name: 'Support practice' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start this skill practice' })).toHaveFocus();
    expect(notes()).toHaveValue('Keep this diagnostic reflection.');
    await chooseCourse(1);
    expect(screen.queryByRole('region', { name: 'Course skill practice' })).not.toBeInTheDocument();
  });

  it('shows authoritative practice status and feedback without pretending a credential was earned', () => {
    const mission: TrainingCoursePractice['mission'] = {
      key: 'fixture:mission:support', courseSlug: 'support-mission', programSlug,
      programTitle: syllabus.title, courseTitle: syllabus.courses[0].name,
      missionName: 'Support practice', missionTagline: 'Explain a support request.', primaryAxis: 'Service',
      skillLabels: ['Troubleshooting'], scenarioPrompt: 'Explain your steps.', evidenceHint: '', estimatedMinutes: 15,
      quizQuestions: [], status: 'passed', completedAt: new Date('2026-09-09'), aiToolResultId: 'result-1',
      latestResult: { verdict: 'passed', coachingNote: 'Your diagnostic sequence is clear.', resumeBullet: 'Documented a sample support investigation.', starStory: 'I investigated a sample request.', skillsUnlocked: ['Troubleshooting'] },
    };
    const { unmount } = mount(fixture(), [], [{ assignedCourseSlug: courseSlug(0), mission }]);
    expect(screen.getByText('Your diagnostic sequence is clear.')).toBeInTheDocument();
    expect(screen.getByText('Documented a sample support investigation.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Practice this skill again' })).toBeEnabled();
    expect(screen.getByText(/does not award a credential/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Assigned courses completed' })).toHaveAttribute('aria-valuenow', '0');
    unmount();
    mount(fixture(), [], [{ assignedCourseSlug: courseSlug(0), mission: { ...mission, status: 'locked', latestResult: null } }]);
    expect(screen.getByText(/opens when this course's completion is recorded/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start this skill practice/ })).not.toBeInTheDocument();
  });

  it('keeps the editor and blocks internal navigation when a member declines to discard unsaved work', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount();
    fireEvent.change(notes(), { target: { value: 'Unsaved troubleshooting work' } });
    await userEvent.click(within(editor()).getByRole('link', { name: /Practice with Skill Missions/ }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/dashboard/program');
    expect(notes()).toHaveValue('Unsaved troubleshooting work');
    const unloading = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloading);
    expect(unloading.defaultPrevented).toBe(true);
  });

  it('handles invalid and far-future schedule dates without crashing the workspace', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: 'Study schedule' }));
    const date = screen.getByLabelText('Start this schedule on');
    const save = screen.getByRole('button', { name: 'Save my study schedule' });
    fireEvent.change(date, { target: { value: '' } });
    expect(save).toBeDisabled();
    fireEvent.change(date, { target: { value: '10000-01-01' } });
    expect(save).toBeDisabled();
    fireEvent.change(date, { target: { value: '9999-12-31' } });
    expect(save).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Your course-by-course schedule' })).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the course denominator note where the count is stated, and nothing when there is none', () => {
    // /dashboard/program renders this workspace for assigned members, so the
    // "Lab named in the 17" sentence must appear here, not only on the home tile.
    const note = "10 courses: 9 on Coursera's learning path plus the WorkforceAP Lab (delivered by WorkforceAP, not part of the Coursera path).";
    mount(fixture(), [], [], note);
    const rendered = screen.getByTestId('program-courses-note');
    expect(rendered).toHaveTextContent(note);
    expect(rendered).toHaveClass('wa-kit-training-muted');
    expect(rendered.closest('section')).toHaveAttribute('aria-label', 'Your assigned training');
    cleanup();

    mount(fixture(), [], [], undefined);
    expect(screen.queryByTestId('program-courses-note')).not.toBeInTheDocument();
    cleanup();

    mount(fixture(), [], [], null);
    expect(screen.queryByTestId('program-courses-note')).not.toBeInTheDocument();
  });
});
