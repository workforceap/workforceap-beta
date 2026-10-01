import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { ChatThread } from '@/components/portal/kit/ChatThread';
import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';
import { buildTrainingFeedbackDraft } from '@/lib/member/trainingFeedbackDraft';
import type { TrainingWorkspace } from '@/lib/member/trainingWorkspace';

const workspace: TrainingWorkspace = {
  programSlug: 'it-support-professional-certificate-ibm', programTitle: 'IT Support (IBM)', curriculumVersion: 'legacy-v1',
  weeklyHours: 10, planStartDate: null, planUpdatedAt: null, totalEstimatedHours: 12, publishedSyllabusHours: 160,
  courses: [{ slug: 'networking', name: 'Networking', estimatedHours: 12, notes: 'Private health and learning reflection.', artifactUrl: 'https://example.org/network', updatedAt: null }],
};

beforeEach(() => {
  window.history.replaceState(null, '', '/dashboard/messages?program=it-support-professional-certificate-ibm&course=networking&curriculum=legacy-v1');
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('course feedback handoff', () => {
  it('derives course and evidence from the pinned workspace without private notes', () => {
    const draft = buildTrainingFeedbackDraft(workspace, 'networking', 'legacy-v1');
    expect(draft?.text).toContain('Program: IT Support (IBM)');
    expect(draft?.text).toContain('Course: Networking');
    expect(draft?.text).toContain('https://example.org/network');
    expect(draft?.text).not.toContain('Private');
    expect(buildTrainingFeedbackDraft(workspace, 'unassigned-course', 'legacy-v1')).toBeUndefined();
    expect(buildTrainingFeedbackDraft(workspace, 'networking', 'different-version')).toBeUndefined();
    expect(buildTrainingFeedbackDraft(null, 'networking', 'legacy-v1')).toBeUndefined();
  });

  it('omits unsafe or missing saved evidence links', () => {
    for (const artifactUrl of ['javascript:alert(1)', 'https://user:password@example.org', 'not-a-url', null]) {
      const draft = buildTrainingFeedbackDraft({ ...workspace, courses: [{ ...workspace.courses[0], artifactUrl }] }, 'networking', 'legacy-v1');
      expect(draft?.text).not.toContain('Project link:');
    }
  });

  it('shows an editable multiline request and sends nothing until explicitly submitted', async () => {
    const onSend = vi.fn();
    render(<NextIntlClientProvider locale="en" messages={en}><MemberMessagesKit feedbackDraft={buildTrainingFeedbackDraft(workspace, 'networking', 'legacy-v1')} onSend={onSend} /></NextIntlClientProvider>);
    const composer = screen.getByRole('textbox', { name: 'Message Counselor…' });
    expect(composer.tagName).toBe('TEXTAREA');
    expect((composer as HTMLTextAreaElement).value).toContain('Course: Networking');
    expect(screen.getByText(/Your private notes are not shared/)).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: 'Could you review the addressing in my sample network?' } });
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith('Could you review the addressing in my sample network?');
  });

  it('keeps the reviewed draft after a failed member send and clears it after a successful retry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Please try again.' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: { id: 'saved-message', body: 'Please review my project.' } }), { status: 200 }));
    render(<NextIntlClientProvider locale="en" messages={en}><MemberMessagesKit memberUserId="fixture-member" feedbackDraft={buildTrainingFeedbackDraft(workspace, 'networking', 'legacy-v1')} /></NextIntlClientProvider>);
    const composer = screen.getByRole('textbox', { name: 'Message Counselor…' });
    fireEvent.change(composer, { target: { value: 'Please review my project.' } });
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Please try again.'));
    expect(composer).toHaveValue('Please review my project.');
    expect(screen.getByRole('log')).not.toHaveTextContent('Please review my project.');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(composer).toHaveValue(''));
    expect(screen.getByRole('log')).toHaveTextContent('Please review my project.');
    expect(window.location.search).toBe('');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('chat send integrity', () => {
  it('respects a custom async member send rejection', async () => {
    const onSend = vi.fn(async () => false);
    render(<NextIntlClientProvider locale="en" messages={en}><MemberMessagesKit onSend={onSend} feedbackDraft={{ key: 'custom', text: 'Keep my reviewed request' }} /></NextIntlClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
    expect(screen.getByRole('textbox')).toHaveValue('Keep my reviewed request');
  });

  it('preserves text edited while a previous message is sending', async () => {
    let complete!: (value: boolean) => void;
    const onSend = vi.fn(() => new Promise<boolean>((resolve) => { complete = resolve; }));
    render(<ChatThread messages={[]} initialText="First draft" onSend={onSend} />);
    const composer = screen.getByRole('textbox');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(screen.getByRole('button', { name: 'Sending message' })).toBeDisabled();
    fireEvent.change(composer, { target: { value: 'My next question' } });
    await act(async () => complete(true));
    expect(composer).toHaveValue('My next question');
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('keeps text when a send handler throws', async () => {
    render(<ChatThread messages={[]} initialText="Keep this question" onSend={async () => { throw new Error('offline'); }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
    expect(screen.getByRole('textbox')).toHaveValue('Keep this question');
  });
});
