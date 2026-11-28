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
  it('hydrates the full enhanced draft and saves that text, not the 12k tool excerpt', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/member/resume/plain-text')) {
        return new Response(JSON.stringify({ ok: true, resumeRevision: 'rev-2' }), { status: 200 });
      }
      return new Response(JSON.stringify({
        enhancedText: FULL_DRAFT,
        resumePlainText: TOOL_EXCERPT,
        resumeRevision: 'rev-1',
        resumeDraftOwnerToken: 'member-a',
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ResumeCoachWorkspace />);

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
  });
});
