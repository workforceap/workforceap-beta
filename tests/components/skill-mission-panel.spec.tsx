import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SkillMissionPanel, { type SkillMissionSummary } from '@/components/portal/SkillMissionPanel';
import SkillMissionChallenge from '@/components/portal/SkillMissionChallenge';
import messages from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const QUESTION = {
  text: 'How do you start?',
  options: ['Ask questions', 'Guess', 'Ignore', 'Delete'] as [string, string, string, string],
};

type MissionItem = SkillMissionSummary['missions'][number];

function mission(overrides: Partial<MissionItem> = {}): MissionItem {
  return {
    key: 'program:mission:course-1',
    courseSlug: 'course-1',
    programSlug: 'program',
    programTitle: 'Program',
    courseTitle: 'Course One',
    missionName: 'Explain the fix',
    missionTagline: 'Walk a teammate through a fix.',
    primaryAxis: 'communication',
    skillLabels: ['Troubleshooting', 'Communication'],
    scenarioPrompt: 'Describe your support process.',
    evidenceHint: 'Use concrete observations.',
    quizQuestions: [QUESTION, QUESTION, QUESTION],
    estimatedMinutes: 15,
    status: 'ready',
    completedAt: null,
    latestResult: null,
    aiToolResultId: null,
    ...overrides,
  };
}

function summary(missions: MissionItem[], overrides: Partial<SkillMissionSummary> = {}): SkillMissionSummary {
  const passed = missions.filter((m) => m.status === 'passed').length;
  return {
    programSlug: 'program',
    programTitle: 'Program',
    totalMissions: missions.length,
    passedCount: passed,
    readyCount: missions.filter((m) => m.status === 'ready').length,
    retryCount: missions.filter((m) => m.status === 'needs_retry').length,
    streak: 0,
    careerReadinessPct: Math.round((passed / missions.length) * 100),
    demonstratedSkills: [],
    missions,
    ...overrides,
  };
}

const withIntl = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">{ui}</NextIntlClientProvider>
);

beforeEach(() => {
  refresh.mockClear();
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SkillMissionPanel', () => {
  const all = [
    mission({ key: 'p:mission:1', missionName: 'Passed one', status: 'passed', completedAt: new Date('2026-07-18T12:00:00Z'),
      aiToolResultId: 'artifact-1', latestResult: { verdict: 'passed', coachingNote: '', starStory: '', resumeBullet: 'Fixed it.', skillsUnlocked: ['Troubleshooting'] } }),
    mission({ key: 'p:mission:2', missionName: 'Ready one', status: 'ready' }),
    mission({ key: 'p:mission:3', missionName: 'Retry one', status: 'needs_retry',
      latestResult: { verdict: 'needs_retry', coachingNote: 'Name the service and the time window.', starStory: '', resumeBullet: '', skillsUnlocked: [] } }),
    mission({ key: 'p:mission:4', missionName: 'Locked one', status: 'locked', courseTitle: 'Course Four' }),
  ];

  it('keeps one clean heading outline under the page h1 when the route has its own opener', () => {
    render(withIntl(<SkillMissionPanel summary={summary(all)} hideTitle />));
    const levels = screen.getAllByRole('heading').map((h) => `${h.tagName}:${h.textContent}`);
    expect(levels).toEqual([
      'H2:Your progress',
      'H2:Your missions',
      'H3:Passed one',
      'H3:Ready one',
      'H3:Retry one',
      'H3:Locked one',
    ]);
  });

  it('adds its own h2 and shifts everything down one level when embedded in another page', () => {
    render(withIntl(<SkillMissionPanel summary={summary(all)} />));
    const levels = screen.getAllByRole('heading').map((h) => h.tagName);
    expect(levels).toEqual(['H2', 'H3', 'H3', 'H4', 'H4', 'H4', 'H4']);
  });

  it('gives each state the right control and no dead end', () => {
    render(withIntl(<SkillMissionPanel summary={summary(all)} hideTitle resumeStudioHref="/dashboard/ai-tools/resume-studio" />));
    const byName = (name: string) => screen.getByRole('article', { name });
    expect(within(byName('Passed one')).getByRole('link', { name: 'Open resume studio' })).toHaveAttribute('href', '/dashboard/ai-tools/resume-studio');
    expect(within(byName('Passed one')).getByText('Passed Jul 18')).toBeInTheDocument();
    expect(within(byName('Ready one')).getByRole('button', { name: /Start mission/ })).toBeInTheDocument();
    expect(within(byName('Retry one')).getByText('Name the service and the time window.')).toBeInTheDocument();
    expect(within(byName('Retry one')).getByRole('button', { name: /Retry mission/ })).toBeInTheDocument();
    expect(within(byName('Locked one')).queryByRole('button')).toBeNull();
    expect(within(byName('Locked one')).getByText('Course Four')).toBeInTheDocument();
  });

  it('shows the in-a-row chip only for a real run of two or more', () => {
    const { rerender } = render(withIntl(<SkillMissionPanel summary={summary(all, { streak: 1 })} hideTitle />));
    expect(screen.queryByText(/in a row/)).toBeNull();
    rerender(withIntl(<SkillMissionPanel summary={summary(all, { streak: 2 })} hideTitle />));
    expect(screen.getByText(/2 in a row/)).toBeInTheDocument();
  });

  it('opens the overlay on <body>, outside the page layout, and returns focus to the opener on Escape', async () => {
    render(withIntl(<div className="wa-space-y-6"><SkillMissionPanel summary={summary(all)} hideTitle preview /></div>));
    const start = screen.getByRole('button', { name: /Start mission/ });
    start.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Ready one' });
    expect(dialog.parentElement).toBe(document.body);
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(start).toHaveFocus();
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps focus in the list when the opener disappears after the refresh', async () => {
    const ready = summary(all);
    const { rerender } = render(withIntl(<SkillMissionPanel summary={ready} hideTitle preview />));
    screen.getByRole('button', { name: /Start mission/ }).focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The refreshed page now shows the mission as passed: the Start button is gone.
    const passedNow = summary(all.map((m) => (m.key === 'p:mission:2' ? { ...m, status: 'passed' as const } : m)));
    await act(async () => { rerender(withIntl(<SkillMissionPanel summary={passedNow} hideTitle preview />)); });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ready one' })).toHaveFocus());
  });
});

describe('SkillMissionChallenge', () => {
  const base = mission();
  const open = (props: Partial<React.ComponentProps<typeof SkillMissionChallenge>> = {}) =>
    render(withIntl(<SkillMissionChallenge mission={base} initialPhase={2} onClose={vi.fn()} onComplete={vi.fn()} {...props} />));

  it('caps the response at the server limit and ignores whitespace as an answer', async () => {
    open();
    const box = await screen.findByRole('textbox', { name: 'Your scenario response' });
    expect(box).toHaveAttribute('maxlength', '4000');
    const submit = screen.getByRole('button', { name: 'Submit for coaching' });
    fireEvent.change(box, { target: { value: ' '.repeat(40) } });
    expect(submit).toBeDisabled();
    fireEvent.change(box, { target: { value: 'too short' } });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/write at least 20 characters/i)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'I checked the logs, isolated the fault and wrote it up.' } });
    expect(submit).toBeEnabled();
  });

  it('sends exactly one evaluate request for a double click', async () => {
    let resolve!: (r: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    open();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your scenario response' }), {
      target: { value: 'I checked the logs, isolated the fault and wrote it up.' },
    });
    const submit = screen.getByRole('button', { name: 'Submit for coaching' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolve(new Response(JSON.stringify({ ok: false, error: 'Try again.' }), { status: 503 })));
  });

  it('shows a retryable error and never a pass when the evaluation fails', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: 'Our coach is unavailable right now. Your response was not graded. Please try again in a few minutes.' }),
      { status: 503 },
    ));
    const onComplete = vi.fn();
    open({ onComplete });
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your scenario response' }), {
      target: { value: 'I checked the logs, isolated the fault and wrote it up.' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Submit for coaching' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your response was not graded');
    expect(screen.queryByText('Mission passed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit for coaching' })).toBeEnabled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('treats a pass the member already has as practice: no celebration, the saved pass stands', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ok: true, verdict: 'passed', alreadyPassed: true, coachingNote: 'Nice, same approach.',
      starStory: 'Practice story.', resumeBullet: 'Practice bullet.', skillsUnlocked: ['Troubleshooting'], quizCorrectCount: 3, aiToolResultId: 'a-1',
    }), { status: 200 }));
    const onComplete = vi.fn();
    open({ onComplete });
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your scenario response' }), {
      target: { value: 'I checked the logs, isolated the fault and wrote it up.' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Submit for coaching' }));
    expect(await screen.findByRole('heading', { name: 'Practice complete' })).toBeInTheDocument();
    expect(screen.getByText(/You already passed this mission/)).toBeInTheDocument();
    expect(screen.getByText('Nice, same approach.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/stay here/)).toBeNull();
  });

  it('still celebrates a first pass', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      ok: true, verdict: 'passed', coachingNote: 'Clear reasoning.',
      starStory: 'A story.', resumeBullet: 'A bullet.', skillsUnlocked: ['Troubleshooting'], quizCorrectCount: 3, aiToolResultId: 'a-1',
    }), { status: 200 }));
    open();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your scenario response' }), {
      target: { value: 'I checked the logs, isolated the fault and wrote it up.' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Submit for coaching' }));
    expect(await screen.findByRole('heading', { name: 'Mission passed' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/The STAR story and resume bullet stay here/)).toBeInTheDocument();
  });

  it('gives a wrong quiz answer a text cue as well as a colour', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ correct: false, correctIndex: 0, explanation: 'Clarify first.' }), { status: 200 }));
    open({ initialPhase: 1 });
    await userEvent.click(await screen.findByRole('button', { name: /Guess/ }));
    expect(await screen.findByText(/your answer, not correct/)).toBeInTheDocument();
    expect(screen.getByText(/correct answer\)/)).toBeInTheDocument();
  });
});

describe('Skill missions in the member locale', () => {
  const inLocale = (locale: 'es' | 'fr', catalog: unknown, ui: React.ReactElement) => (
    <NextIntlClientProvider locale={locale} messages={catalog as typeof messages} timeZone="America/New_York">{ui}</NextIntlClientProvider>
  );

  it('renders the panel chrome, counts and passed date in French', () => {
    const list = [
      mission({ key: 'p:mission:1', missionName: 'Passed one', status: 'passed', completedAt: new Date('2026-07-18T12:00:00Z') }),
      mission({ key: 'p:mission:2', missionName: 'Ready one', status: 'ready' }),
      mission({ key: 'p:mission:3', missionName: 'Locked one', status: 'locked', courseTitle: 'Course Four' }),
    ];
    render(inLocale('fr', fr, <SkillMissionPanel summary={summary(list, { streak: 2 })} hideTitle />));
    expect(screen.getByRole('heading', { name: 'Votre progression' })).toBeInTheDocument();
    expect(screen.getByText('1 sur 3 missions réussies')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Commencer la mission/ })).toBeInTheDocument();
    expect(screen.getByText(/Réussie le 18 juil/)).toBeInTheDocument();
    expect(screen.getByText('2 d’affilée')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Locked one' })).getByText('Course Four')).toBeInTheDocument();
    expect(screen.queryByText('Start mission')).toBeNull();
  });

  it('shows a known server failure in Spanish and an unknown one as the server sentence', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: false, error: 'Daily attempt limit reached for this mission. Take a break and come back tomorrow.', code: 'attempt_cap' }),
      { status: 429 },
    ));
    render(inLocale('es', es, <SkillMissionChallenge mission={mission()} initialPhase={2} onClose={vi.fn()} onComplete={vi.fn()} />));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Tu respuesta al escenario' }), {
      target: { value: 'I checked the logs, isolated the fault and wrote it up.' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para recibir retroalimentación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Alcanzaste el límite diario de intentos');

    vi.mocked(fetch).mockResolvedValueOnce(new Response(
      JSON.stringify({ ok: false, error: 'Some new server sentence.', code: 'not_a_known_code' }),
      { status: 500 },
    ));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para recibir retroalimentación' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Some new server sentence.'));
  });

  it('counts one word as one word', async () => {
    render(withIntl(<SkillMissionChallenge mission={mission()} initialPhase={2} onClose={vi.fn()} onComplete={vi.fn()} />));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your scenario response' }), { target: { value: 'Logs' } });
    expect(screen.getByText(/^1 word(?!s)/)).toBeInTheDocument();
  });
});
