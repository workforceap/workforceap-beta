import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import SkillMissionChallenge from '@/components/portal/SkillMissionChallenge';
import messages from '@/messages/en.json';

/**
 * Keyboard and screen-reader contract for the challenge dialog: when a step
 * changes, the control the member just used unmounts, so focus must move to
 * the new step's heading instead of dropping to <body> behind the modal.
 */

const mission = {
  key: 'fixture:mission:1', courseSlug: 'fixture-course', programSlug: 'fixture-program', programTitle: 'Fixture program',
  courseTitle: 'Support', missionName: 'Support practice', missionTagline: 'Practice a support case', primaryAxis: 'Service',
  skillLabels: ['Troubleshooting'], scenarioPrompt: 'Describe your support process.', evidenceHint: 'Use concrete observations.',
  quizQuestions: [
    { text: 'How do you start?', options: ['Ask questions', 'Guess', 'Ignore', 'Delete'] as [string, string, string, string] },
    { text: 'What do you record?', options: ['Nothing', 'The steps taken', 'A joke', 'A guess'] as [string, string, string, string] },
  ],
  estimatedMinutes: 15, status: 'ready' as const, completedAt: null, latestResult: null, aiToolResultId: null,
};

const renderChallenge = (ui: React.ReactElement) =>
  render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">{ui}</NextIntlClientProvider>);

beforeEach(() => {
  // A fresh Response per call: a body can be read once.
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ correct: true, correctIndex: 0, explanation: 'Clarify first.' }), { status: 200 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('challenge dialog focus between steps', () => {
  it('lands on Close when it opens, then on the heading of each new step', async () => {
    renderChallenge(<SkillMissionChallenge mission={mission} onClose={vi.fn()} onComplete={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close mission' })).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Accept mission' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'How do you start?' })).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: /Ask questions/ }));
    await waitFor(() => expect(screen.getByText('Clarify first.', { exact: false })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'What do you record?' })).toHaveFocus());
  });

  it('moves focus to the scenario heading after the last question', async () => {
    renderChallenge(<SkillMissionChallenge mission={mission} initialPhase={1} onClose={vi.fn()} onComplete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Ask questions/ }));
    await waitFor(() => expect(screen.getByText('Clarify first.', { exact: false })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    await userEvent.click(screen.getByRole('button', { name: /The steps taken/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /See how you did/ })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /See how you did/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Now show it in action' })).toHaveFocus());
  });

  it('lands on the explanation after an answer, so the next Tab reaches Next', async () => {
    renderChallenge(<SkillMissionChallenge mission={mission} initialPhase={1} onClose={vi.fn()} onComplete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Ask questions/ }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveFocus());
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /Next/ })).toHaveFocus();
  });

  it('returns to the options when the answer check fails', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => new Response('{}', { status: 500 }));
    renderChallenge(<SkillMissionChallenge mission={mission} initialPhase={1} onClose={vi.fn()} onComplete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Ask questions/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check your answer');
    await waitFor(() => expect(screen.getByRole('button', { name: /Ask questions/ })).toHaveFocus());
  });

  it('lands on the message when a submission fails, so Submit is one Tab away', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => new Response(JSON.stringify({ ok: false, error: 'Coaching unavailable. Try again.' }), { status: 503 }));
    renderChallenge(<SkillMissionChallenge mission={mission} initialPhase={2} onClose={vi.fn()} onComplete={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Your scenario response' }), 'I reviewed the logs and documented a diagnostic sequence.');
    await userEvent.click(screen.getByRole('button', { name: 'Submit for coaching' }));
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Submit for coaching' })).toHaveFocus();
  });

  it('keeps every step heading focusable but out of the tab order', () => {
    renderChallenge(<SkillMissionChallenge mission={mission} initialPhase={2} onClose={vi.fn()} onComplete={vi.fn()} />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Now show it in action' });
    expect(heading).toHaveAttribute('tabindex', '-1');
  });
});
