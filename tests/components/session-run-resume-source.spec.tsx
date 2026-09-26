import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/portal/VoiceAgentSurface', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({ default: () => null }));

import SessionRunClient from '@/components/portal/sessions/SessionRunClient';

const enhanced = 'Enhanced draft from a prior AI run. '.repeat(8);
const original = 'Member-provided original work history with real roles, dates, projects, and skills. '.repeat(3);
const props = {
  memberId: 'member-1',
  memberFullName: 'Jordan Example',
  memberEmail: 'jordan@example.org',
  memberPhone: null,
  memberTargetRole: 'Support Specialist',
  sessionId: 'session-1',
  isFreshWalkIn: false,
};

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia = () => ({
    matches: false, media: '', onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('staff session Resume Rewriter source', () => {
  it('posts the original while other tools keep the shared context', async () => {
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify({ output: 'Done' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<SessionRunClient {...props} existingResume={enhanced} originalResume={original} />);

    expect(screen.getByLabelText(/Resume \/ experience/i)).toHaveValue(original);
    fireEvent.click(screen.getByRole('button', { name: /Build resume/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/resume-rewriter', expect.anything()));
    const rewriterCall = fetchMock.mock.calls.find(([url]) => url === '/api/ai/resume-rewriter');
    expect(JSON.parse((rewriterCall?.[1] as RequestInit).body as string)).toMatchObject({
      resume: original, subjectMemberId: props.memberId, sessionId: props.sessionId,
    });

    fireEvent.click(screen.getByRole('button', { name: /^Gap Analysis$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Analyze gaps/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/gap-analyzer', expect.anything()));
    const gapCall = fetchMock.mock.calls.find(([url]) => url === '/api/ai/gap-analyzer');
    expect(JSON.parse((gapCall?.[1] as RequestInit).body as string)).toMatchObject({ resume: enhanced });
  });

  it('does not submit an enhanced-only fallback and accepts first-hand text entered by staff', async () => {
    const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify({ output: 'Done' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<SessionRunClient {...props} existingResume={enhanced} originalResume="" />);

    const source = screen.getByLabelText(/Resume \/ experience/i);
    expect(source).toHaveValue('');
    expect(screen.getByText(/Only a previous draft is available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Build resume/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(source, { target: { value: 'Short note' } });
    expect(screen.getByRole('button', { name: /Build resume/i })).toBeDisabled();
    expect(screen.getByText(/Other tools continue using the saved draft/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Gap Analysis$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Analyze gaps/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/gap-analyzer', expect.anything()));
    const gapCall = fetchMock.mock.calls.find(([url]) => url === '/api/ai/gap-analyzer');
    expect(JSON.parse((gapCall?.[1] as RequestInit).body as string).resume).toBe(enhanced);

    fireEvent.change(source, { target: { value: original } });
    fireEvent.click(screen.getByRole('button', { name: /Build resume/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/resume-rewriter', expect.anything()));
    const rewriterCall = fetchMock.mock.calls.find(([url]) => url === '/api/ai/resume-rewriter');
    expect(JSON.parse((rewriterCall?.[1] as RequestInit).body as string).resume).toBe(original);
    await waitFor(() => expect(container.querySelector('#session-card-cover')).toHaveTextContent('Will use the saved resume draft as context.'));
    expect(container.querySelector('#session-card-interview')).toHaveTextContent('Uses saved resume draft as context.');
  });

  it('uses a newly uploaded original as the Rewriter source', async () => {
    const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => new Response(
      JSON.stringify(url.includes('upload-resume') ? { text: original } : { output: 'Done' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<SessionRunClient {...props} existingResume={enhanced} originalResume="" />);

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [new File(['work history'], 'original.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(screen.getByLabelText(/Resume \/ experience/i)).toHaveValue(original));

    fireEvent.click(screen.getByRole('button', { name: /Build resume/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/resume-rewriter', expect.anything()));
    const rewriterCall = fetchMock.mock.calls.find(([url]) => url === '/api/ai/resume-rewriter');
    expect(JSON.parse((rewriterCall?.[1] as RequestInit).body as string).resume).toBe(original);

    fireEvent.click(screen.getByRole('button', { name: /^Gap Analysis$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Analyze gaps/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/gap-analyzer', expect.anything()));
    const gapCall = fetchMock.mock.calls.find(([url]) => url === '/api/ai/gap-analyzer');
    expect(JSON.parse((gapCall?.[1] as RequestInit).body as string).resume).toBe(original);
  });
});
