import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/components/portal/tools/ResumeRewriterForm', () => ({
  default: ({
    resumeControlled,
    onResumeChange,
    resumeBanner,
  }: {
    resumeControlled: string;
    onResumeChange: (value: string) => void;
    resumeBanner?: ReactNode;
  }) => (
    <div>
      <textarea
        aria-label="Resume text"
        value={resumeControlled}
        onChange={(event) => onResumeChange(event.target.value)}
      />
      {resumeBanner}
    </div>
  ),
}));

import ResumeRewriterClient from '@/app/(portal)/dashboard/ai-tools/resume-rewriter/ResumeRewriterClient';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Resume Rewriter client source hydration', () => {
  it('requests only the original, keeps an unreadable original out of the form, and permits pasted text', async () => {
    const fetchResume = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasOriginal: true, resumePlainText: null }),
    });
    vi.stubGlobal('fetch', fetchResume);

    render(<ResumeRewriterClient />);

    await waitFor(() => expect(fetchResume).toHaveBeenCalledWith(
      '/api/member/resume?includePlainText=1&originalOnly=1',
    ));
    expect(await screen.findByText(/Could not read the original resume/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Resume text' })).toHaveValue('');

    fireEvent.change(screen.getByRole('textbox', { name: 'Resume text' }), {
      target: { value: 'My own verified work history and skills.' },
    });
    expect(screen.getByRole('textbox', { name: 'Resume text' })).toHaveValue(
      'My own verified work history and skills.',
    );
  });
});
