import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * WAP-188 Phase A: the self-report form now renders on the default (kit)
 * My Certificates view, not only on ?ui=legacy. WAP-20: a self-reported
 * certificate is a `pending` row for staff review, so the form must say so
 * before and after saving, follow the status the route returns (a re-added
 * certificate keeps its review state), and paint on kit tokens. After a save
 * focus lands on "Add another certificate" and the confirmation goes through
 * the kit announcer. "Date earned" defaults to the member's local today and a
 * missing date is a field error, not a "could not reach WorkforceAP".
 */

const { announceMock } = vi.hoisted(() => ({ announceMock: vi.fn() }));
vi.mock('@/components/portal/kit/hooks/useAnnounce', () => ({
  useAnnounce: () => announceMock,
  announce: announceMock,
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, prefetch: vi.fn() }),
}));

import CertificationAddForm, {
  EARNED_DATE_FUTURE,
  EARNED_DATE_REQUIRED,
  certificationAddedNotice,
  earnedDateError,
  localDateInputValue,
} from '@/components/portal/CertificationAddForm';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function openAndPick(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add a certificate' }));
  fireEvent.change(screen.getByRole('combobox', { name: /certificate name/i }), { target: { value: name } });
}

const notice = () => screen.findByTestId('certification-added-notice');

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  announceMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CertificationAddForm', () => {
  it('is a kit ghost pill that opens a kit form with the pending-review note, and no icon font', () => {
    const { container } = render(<CertificationAddForm />);
    const open = screen.getByRole('button', { name: 'Add a certificate' });
    expect(open.className).toContain('wa-kit-cta');
    expect(open.className).toContain('wa-kit-cta--ghost');
    fireEvent.click(open);
    expect(screen.getByText('It shows as pending until our staff check it. It counts as earned only after they verify it.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /certificate name/i }).className).toContain('wa-kit-control');
    expect(screen.getByLabelText(/date earned/i).className).toContain('wa-kit-control');
    expect(screen.getByRole('button', { name: 'Save certificate' }).className).toContain('wa-kit-cta');
    expect(container.querySelector('.material-symbols-outlined')).toBeNull();
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[style]'))) {
      const style = el.getAttribute('style') ?? '';
      expect(style).not.toMatch(/--surface-container|--outline-variant|--color-on-surface|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('saves a self-report as pending, confirms it in place and refreshes the server list', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, status: 'pending' }));
    render(<CertificationAddForm />);
    openAndPick('OSHA 10');
    fireEvent.change(screen.getByLabelText(/date earned/i), { target: { value: '2026-05-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save certificate' }));

    expect(await notice()).toHaveTextContent('OSHA 10 added. It shows as pending until our staff check it.');
    expect(announceMock).toHaveBeenCalledWith('OSHA 10 added. It shows as pending until our staff check it.');
    // Not a live region that mounts already filled (KIT_GUIDE §8.9).
    expect(screen.queryByRole('status')).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/member/certifications');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      certName: 'OSHA 10',
      earned: true,
      earnedAt: new Date('2026-05-04').toISOString(),
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    // The form (and its submit button) unmounted; focus lands on the next action, not <body>.
    expect(screen.getByRole('button', { name: 'Add another certificate' })).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no file chosen → no upload
  });

  it('a re-added certificate that staff already verified is not called pending', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, status: 'approved' }));
    render(<CertificationAddForm />);
    openAndPick('CompTIA A+');
    fireEvent.click(screen.getByRole('button', { name: 'Save certificate' }));

    expect(await notice()).toHaveTextContent('CompTIA A+ is already on your list and verified.');
    expect(await notice()).not.toHaveTextContent(/pending/i);
  });

  it('a failed save keeps the form open with a plain-language alert and no refresh', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>502</html>', { status: 502 }));
    render(<CertificationAddForm />);
    openAndPick('OSHA 10');
    fireEvent.click(screen.getByRole('button', { name: 'Save certificate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This service is temporarily unavailable. Try again in a minute.');
    expect(screen.getByRole('button', { name: 'Save certificate' })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('a saved certificate whose file did not attach says both things', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: true, status: 'pending' }))
      .mockResolvedValueOnce(json({ error: 'Only PDF and image files are accepted' }, 400));
    render(<CertificationAddForm />);
    openAndPick('OSHA 10');
    const file = new File(['%PDF-1.4'], 'osha.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/certificate file/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save certificate' }));

    const status = await notice();
    expect(status).toHaveTextContent('OSHA 10 added. It shows as pending until our staff check it.');
    expect(status).toHaveTextContent('The file was not attached: Only PDF and image files are accepted');
    expect(announceMock).toHaveBeenCalledWith(
      'OSHA 10 added. It shows as pending until our staff check it. The file was not attached: Only PDF and image files are accepted',
    );
    expect(fetchMock.mock.calls[1][0]).toBe('/api/member/certifications/upload');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('defaults "Date earned" and its max to the local today', () => {
    render(<CertificationAddForm />);
    openAndPick('OSHA 10');
    const date = screen.getByLabelText(/date earned/i);
    expect(date).toHaveValue(localDateInputValue());
    expect(date).toHaveAttribute('max', localDateInputValue());
  });

  it('a cleared date is a field error on the input, never a connection failure, and sends nothing', () => {
    render(<CertificationAddForm />);
    openAndPick('OSHA 10');
    const date = screen.getByLabelText(/date earned/i);
    fireEvent.change(date, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save certificate' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(EARNED_DATE_REQUIRED)).toBeInTheDocument();
    expect(date).toHaveAttribute('aria-invalid', 'true');
    expect(date).toHaveAccessibleDescription(EARNED_DATE_REQUIRED);
    expect(date).toHaveFocus();
    expect(screen.queryByText(/could not reach WorkforceAP/i)).toBeNull();

    // Fixing the date clears the error.
    fireEvent.change(date, { target: { value: '2026-05-04' } });
    expect(screen.queryByText(EARNED_DATE_REQUIRED)).toBeNull();
    expect(date).not.toHaveAttribute('aria-invalid');
  });
});

describe('localDateInputValue', () => {
  it('reads the local calendar date, not the UTC one', () => {
    // Local-time constructor: 11:30pm on Sep 22 wherever the test runs. A
    // `toISOString()` default is Sep 23 whenever the zone is behind UTC.
    expect(localDateInputValue(new Date(2026, 8, 22, 23, 30))).toBe('2026-09-22');
    expect(localDateInputValue(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05');
  });
});

describe('earnedDateError', () => {
  it('accepts a real past or current date and rejects empty, impossible and future ones', () => {
    expect(earnedDateError('2026-05-04', '2026-09-22')).toBeNull();
    expect(earnedDateError('2026-09-22', '2026-09-22')).toBeNull();
    expect(earnedDateError('', '2026-09-22')).toBe(EARNED_DATE_REQUIRED);
    expect(earnedDateError('2026-02-30', '2026-09-22')).toBe(EARNED_DATE_REQUIRED);
    expect(earnedDateError('2026-9-1', '2026-09-22')).toBe(EARNED_DATE_REQUIRED);
    expect(earnedDateError('2026-09-23', '2026-09-22')).toBe(EARNED_DATE_FUTURE);
  });
});

describe('certificationAddedNotice', () => {
  it('follows the review status the route returns', () => {
    expect(certificationAddedNotice('OSHA 10', 'pending')).toBe('OSHA 10 added. It shows as pending until our staff check it.');
    expect(certificationAddedNotice('OSHA 10', null)).toBe('OSHA 10 added. It shows as pending until our staff check it.');
    expect(certificationAddedNotice('OSHA 10', 'approved')).toBe('OSHA 10 is already on your list and verified.');
    expect(certificationAddedNotice('OSHA 10', 'rejected')).toMatch(/^OSHA 10 is already on your list\. Staff could not verify it\./);
  });
});
