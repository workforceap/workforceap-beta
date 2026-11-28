import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/components/portal/PortalVoiceSessionLazy', () => ({
  default: () => <div data-testid="voice-session" />,
}));
vi.mock('@/components/portal/VoiceAgentSurface', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import ResumeCoachWorkspace from '@/components/portal/ResumeCoachWorkspace';

const LONG_TAIL = 'Later roles, certifications, and volunteer work stay on the stored draft.';
const FULL_DRAFT = `${'Operations coordinator with inventory and receiving experience. '.repeat(250)}${LONG_TAIL}`;
const TOOL_EXCERPT = FULL_DRAFT.slice(0, 12_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  sessionStorage.clear();
});

describe('Resume Coach stored-draft hydration', () => {
  it('hydrates, saves, and reopens the full enhanced draft without losing its ending', async () => {
    let storedText = FULL_DRAFT;
    let storedRevision = 'rev-1';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/member/resume/plain-text')) {
        const saved = JSON.parse(String(init?.body)) as { plainText: string; resumeRevision: string };
        expect(saved.resumeRevision).toBe(storedRevision);
        storedText = saved.plainText;
        storedRevision = 'rev-2';
        return new Response(JSON.stringify({ ok: true, resumeRevision: storedRevision }), { status: 200 });
      }
      return new Response(JSON.stringify({
        enhancedText: storedText,
        resumePlainText: storedText.slice(0, 12_000),
        resumeRevision: storedRevision,
        resumeDraftOwnerToken: 'member-a',
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstVisit = render(<ResumeCoachWorkspace />);

    const editor = await screen.findByRole('textbox', { name: 'Live resume draft' });
    expect(editor).toHaveValue(FULL_DRAFT.trim());
    expect((editor as HTMLTextAreaElement).value).toContain(LONG_TAIL);
    expect((editor as HTMLTextAreaElement).value.length).toBeGreaterThan(12_000);

    const edited = `${FULL_DRAFT.trim()}\nUpdated inventory bullet.`;
    fireEvent.change(editor, { target: { value: edited } });
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/member/resume/plain-text',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const saveCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/plain-text'));
    expect(saveCall).toBeTruthy();
    const body = JSON.parse(String(saveCall?.[1]?.body ?? '{}')) as { plainText?: string };
    expect(body.plainText).toBe(edited);
    expect(body.plainText).toContain(LONG_TAIL);
    expect(body.plainText).not.toBe(TOOL_EXCERPT);
    await screen.findByText('Saved to profile');

    firstVisit.unmount();
    // A fresh tab cannot rely on recovery storage to conceal a cropped save.
    sessionStorage.clear();
    render(<ResumeCoachWorkspace />);
    const reopened = await screen.findByRole('textbox', { name: 'Live resume draft' });
    expect(reopened).toHaveValue(edited);
    expect((reopened as HTMLTextAreaElement).value).toContain(LONG_TAIL);
    expect((reopened as HTMLTextAreaElement).value).toContain('Updated inventory bullet.');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/plain-text'))).toHaveLength(1);
  });
});
