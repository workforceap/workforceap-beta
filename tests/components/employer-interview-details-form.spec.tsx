/**
 * Vision B2 (V09): the employer's interview time / place form on the
 * application detail page. Time-zone independent: the stored instant is shown
 * in the device's zone and sent back as the same instant.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

import InterviewDetailsForm, { isoToLocalInput } from '@/components/employer/InterviewDetailsForm';

const fetchMock = vi.fn();
const ISO = '2026-10-02T19:30:00.000Z';

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const timeInput = () => screen.getByLabelText('Date and time') as HTMLInputElement;
const placeInput = () => screen.getByLabelText('Where / format') as HTMLInputElement;
const sentBody = () => JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

describe('isoToLocalInput', () => {
  it('round-trips an instant through the datetime-local format in the device zone', () => {
    const local = isoToLocalInput(ISO);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(local).toISOString()).toBe(ISO);
  });

  it('is empty for null or an unparseable value', () => {
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('not a date')).toBe('');
  });
});

describe('InterviewDetailsForm', () => {
  it('prefills the stored time (in local time) and place', () => {
    render(<InterviewDetailsForm applicationId="a1" scheduledAt={ISO} location="Zoom" />);
    expect(timeInput().value).toBe(isoToLocalInput(ISO));
    expect(placeInput().value).toBe('Zoom');
    expect(placeInput().maxLength).toBe(500);
  });

  it('saves status interview, the same instant as ISO and the place, then refreshes and shows Saved', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    render(<InterviewDetailsForm applicationId="a1" scheduledAt={null} location={null} />);
    fireEvent.change(timeInput(), { target: { value: isoToLocalInput(ISO) } });
    fireEvent.change(placeInput(), { target: { value: 'Phone call' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save interview details' }));

    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/employer/applications/a1');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
    expect(sentBody()).toEqual({ status: 'interview', interviewScheduledAt: ISO, interviewLocation: 'Phone call' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('an emptied time is sent as null (clear)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    render(<InterviewDetailsForm applicationId="a1" scheduledAt={ISO} location="Zoom" />);
    fireEvent.change(timeInput(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save interview details' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ status: 'interview', interviewScheduledAt: null, interviewLocation: 'Zoom' });
  });

  it("shows the server's error inline and does not refresh", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { code: 'stale', error: 'This application was updated by someone else. Reload to see the latest.' }),
    );
    render(<InterviewDetailsForm applicationId="a1" scheduledAt={ISO} location={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save interview details' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'This application was updated by someone else. Reload to see the latest.',
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
