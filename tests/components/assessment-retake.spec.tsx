import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
import AllowAssessmentRetakeButton from '@/components/admin/AllowAssessmentRetakeButton';

// Keep the actual shared Astryx dialog; jsdom only needs native method shims.
const methods = ['showModal', 'close'] as const;
const originals = methods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterAll(() => methods.forEach((name, i) => {
  if (originals[i]) Object.defineProperty(HTMLDialogElement.prototype, name, originals[i]!);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
}));
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset(); nav.refresh.mockReset(); vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const props = { memberId: 'student-1', memberName: 'Student Example' };

describe('staff final assessment retake control', () => {
  it('confirms, requests the portal prompt, and stays disabled while refresh is delayed', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, message: 'Final retake requested.' }));
    render(<AllowAssessmentRetakeButton {...props} attemptCount={1} />);
    fireEvent.click(screen.getByTestId('allow-assessment-retake'));
    const dialog = screen.getByRole('dialog', { name: 'Request final retake for Student Example?' });
    expect(within(dialog).getByText(/2 preassessment chances total/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request final retake' }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/counselor/assessment-retake', expect.objectContaining({ method: 'POST', body: JSON.stringify({ memberId: 'student-1' }) }));
    expect(screen.getByTestId('allow-assessment-retake')).toBeDisabled();
    expect(screen.getByTestId('allow-assessment-retake')).toHaveTextContent('Retake requested');
    expect(screen.getByRole('status')).toHaveTextContent('Final retake requested.');
  });
  it('cancels without issuing a request', () => {
    render(<AllowAssessmentRetakeButton {...props} />);
    fireEvent.click(screen.getByTestId('allow-assessment-retake'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('shows a refused save and allows retry', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Both attempts used.' }, { status: 409 }));
    render(<AllowAssessmentRetakeButton {...props} />);
    fireEvent.click(screen.getByTestId('allow-assessment-retake'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Request final retake' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Both attempts used.');
    expect(screen.getByTestId('allow-assessment-retake')).toBeEnabled();
    expect(nav.refresh).not.toHaveBeenCalled();
  });
  it.each([{ attemptCount: 0, pending: false }, { attemptCount: 2, pending: false }, { attemptCount: 3, pending: true }, { attemptCount: 1, pending: true }])('prevents an unavailable grant in state %j', state => {
    render(<AllowAssessmentRetakeButton {...props} {...state} />);
    expect(screen.getByTestId('allow-assessment-retake')).toBeDisabled();
    if (state.attemptCount > 2) expect(screen.getByText(/2 of 2 available attempts used/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
