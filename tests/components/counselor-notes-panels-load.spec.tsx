import { act, cleanup, fireEvent, render as renderBare, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import CounselorNotesPanel from '@/app/(portal)/counselor/students/[memberId]/CounselorNotesPanel';
import AdvisorSessionNotesPanel from '@/app/(portal)/counselor/students/[memberId]/AdvisorSessionNotesPanel';
import { MEMBER_REQUEST_FAILURE } from '@/lib/portal/memberRequestFailure';

/**
 * The notes panels load through the real `fetchWithTimeout` (only `fetch` is
 * stubbed here) so the #2404 contract is proven end to end: every load carries
 * an AbortSignal, a 5xx or a dropped connection reads as one plain sentence
 * with a Try again, a hung request times out visibly, and a request the
 * component itself cancelled (unmount, memberId change) never paints a
 * failure.
 */

vi.mock('@/components/admin/ConfirmDialog', () => ({ default: () => null }));

const render = (ui: ReactElement) => renderBare(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);
const note = (id: string, content: string) => ({ id, content, createdAt: '2026-09-18T19:00:00Z', updatedAt: '2026-09-18T19:00:00Z', author: { fullName: 'Dana', email: 'dana@example.test' } });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const abortError = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
/** A fetch that never answers on its own and rejects the way the platform does when its signal aborts. */
const hanging = (_input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  });

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

for (const [label, Component, path] of [
  ['Counselor notes', CounselorNotesPanel, '/api/counselor/members/member-1/notes'],
  ['Session notes', AdvisorSessionNotesPanel, '/api/counselor/members/member-1/session-notes'],
] as const) {
  describe(`${label} loading`, () => {
    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => {
      cleanup();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it('loads with an AbortSignal and renders the notes without an alert', async () => {
      fetchMock.mockResolvedValue(ok([note('n1', 'First saved note')]));
      render(<Component memberId="member-1" />);
      expect(await screen.findByText('First saved note')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe(path);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText(/Loading notes/)).toBeNull();
    });

    it('turns a 500 into plain copy with Try again, and Try again replaces the failure with the notes', async () => {
      fetchMock.mockResolvedValueOnce(new Response('<html>proxy error</html>', { status: 500 })).mockResolvedValueOnce(ok([note('n2', 'Loaded on retry')]));
      render(<Component memberId="member-1" />);
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Couldn’t load notes.');
      expect(alert).toHaveTextContent(MEMBER_REQUEST_FAILURE.unavailable);
      expect(alert).not.toHaveTextContent('proxy error');
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('Loaded on retry')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reads a dropped connection as the network sentence', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      render(<Component memberId="member-1" />);
      expect(await screen.findByRole('alert')).toHaveTextContent(MEMBER_REQUEST_FAILURE.network);
    });

    it('fails visibly when the request hangs past the timeout', async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(hanging);
      render(<Component memberId="member-1" />);
      expect(screen.getByText(/Loading notes/)).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(screen.getByRole('alert')).toHaveTextContent(MEMBER_REQUEST_FAILURE.timeout);
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    });

    it('aborts its own request on unmount and paints no failure', async () => {
      fetchMock.mockImplementation(hanging);
      const view = render(<Component memberId="member-1" />);
      await act(async () => {});
      const signal = fetchMock.mock.calls[0][1]?.signal;
      expect(signal?.aborted).toBe(false);
      view.unmount();
      await act(async () => {});
      expect(signal?.aborted).toBe(true);
      expect(document.body.querySelector('[role="alert"]')).toBeNull();
    });

    it('cancels the stale request when the member changes and shows only the new member\'s notes', async () => {
      fetchMock.mockImplementationOnce(hanging).mockResolvedValueOnce(ok([note('n3', 'Second member note')]));
      const view = render(<Component memberId="member-1" />);
      await act(async () => {});
      const first = fetchMock.mock.calls[0][1]?.signal;
      view.rerender(<NextIntlClientProvider locale="en" messages={messages}><Component memberId="member-2" /></NextIntlClientProvider>);
      expect(await screen.findByText('Second member note')).toBeInTheDocument();
      expect(first?.aborted).toBe(true);
      expect(String(fetchMock.mock.calls[1][0])).toBe(path.replace('member-1', 'member-2'));
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
}
