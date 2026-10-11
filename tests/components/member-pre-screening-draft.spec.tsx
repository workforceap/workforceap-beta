import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_REQUEST_TIMEOUT_MS } from '@/lib/portal/memberRequestFailure';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import MemberPreScreeningForm from '@/components/portal/MemberPreScreeningForm';

const savedDraft = {
  employmentStatus: 'Student', primaryGoal: 'Certification', weeklyHours: '10-20 hrs',
  barrier: 'Travel to training', hearAbout: 'Workforce Solutions', hearAboutOther: '',
  workforceAssistance: false, phone: '5125550100', address: '100 Example Street, Austin, TX',
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetch.mockReset();
  mocks.refresh.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => { render(<MemberPreScreeningForm />); });
}

async function flushAutosave() {
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
}

describe('pre-screening draft recovery', () => {
  it('waits for saved answers before allowing edits or submission', async () => {
    let complete!: (response: Response) => void;
    mocks.fetch.mockImplementation(() => new Promise<Response>((resolve) => { complete = resolve; }));
    await mount();
    const barrier = screen.getByRole('textbox', { name: /Biggest barrier/ });
    expect(barrier).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit pre-screening' })).toBeDisabled();
    fireEvent.change(barrier, { target: { value: 'An edit before the saved draft arrives' } });
    await act(async () => { complete(Response.json({ draft: savedDraft })); });
    expect(barrier).toHaveValue(savedDraft.barrier);
    expect(barrier).toBeEnabled();
    await flushAutosave();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps saved answers intact after a failed read, then restores them on retry and refresh', async () => {
    let stored: Record<string, unknown> = { ...savedDraft };
    let reads = 0;
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const payload = JSON.parse(String(init.body));
        stored = { ...stored, ...payload, workforceAssistance: payload.workforceAssistance === 'yes' };
        return Response.json({ ok: true });
      }
      reads += 1;
      return reads === 1 ? Response.json({ error: 'Unavailable' }, { status: 503 }) : Response.json({ draft: stored });
    });
    await mount();
    fireEvent.change(screen.getByRole('textbox', { name: /Biggest barrier/ }), { target: { value: 'New edit' } });
    await flushAutosave();
    expect(stored).toEqual(savedDraft);
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your saved draft/);
    expect(screen.getByRole('textbox', { name: /Biggest barrier/ })).toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry loading draft' })); });
    expect(screen.getByRole('textbox', { name: /Biggest barrier/ })).toHaveValue(savedDraft.barrier);
    expect(screen.getByRole('textbox', { name: 'Phone number' })).toHaveValue(savedDraft.phone);
    expect(screen.getByRole('combobox', { name: 'Current employment status' })).toHaveValue(savedDraft.employmentStatus);
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked();
    const barrier = screen.getByRole('textbox', { name: /Biggest barrier/ });
    fireEvent.change(barrier, { target: { value: 'Childcare' } });
    await flushAutosave();
    expect(stored).toMatchObject({ ...savedDraft, barrier: 'Childcare' });
    cleanup();
    await mount();
    expect(screen.getByRole('textbox', { name: /Biggest barrier/ })).toHaveValue('Childcare');
    expect(screen.getByRole('textbox', { name: 'Phone number' })).toHaveValue(savedDraft.phone);
  });

  it.each([
    ['malformed JSON', () => new Response('not-json')],
    ['a missing draft payload', () => Response.json({ ok: true })],
  ])('keeps editing disabled after %s instead of assuming there is no saved draft', async (_name, response) => {
    mocks.fetch.mockResolvedValue(response());
    await mount();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your saved draft/);
    expect(screen.getByRole('textbox', { name: /Biggest barrier/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry loading draft' })).toBeEnabled();
  });

  it('recovers from a draft read that never returns and cancels it on unmount', async () => {
    mocks.fetch.mockImplementation((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
    await mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(MEMBER_REQUEST_TIMEOUT_MS + 1); });
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your saved draft/);
    expect(screen.getByRole('button', { name: 'Retry loading draft' })).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry loading draft' })); });
    const signal = mocks.fetch.mock.calls[1][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    cleanup();
    expect(signal.aborted).toBe(true);
  });
});
