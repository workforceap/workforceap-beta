import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav, useSearchParams: () => new URLSearchParams() }));
import AllowAssessmentRetakeButton from '@/components/admin/AllowAssessmentRetakeButton';
import AssessmentsTable from '@/components/admin/AssessmentsTable';

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
  fetchMock.mockReset(); nav.refresh.mockReset(); nav.push.mockReset(); vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const result = {
  id: 'student-1', fullName: 'Student Example', email: 'student@example.test', phone: null,
  programInterest: null, assessmentScore: 27, assessmentScorePct: 77,
  assessmentCompletedAt: new Date('2026-10-15T10:00:00Z'), assessmentAnswers: {},
  assessmentAttemptCount: 1, assessmentRetakeRequestedAt: null as Date | null,
};

describe('admin assessment results retakes', () => {
  function renderResults(state: Partial<typeof result> = {}) {
    return render(<AssessmentsTable users={[{ ...result, ...state }]} correctnessByUserId={{}}
      totalCount={51} currentPage={1} pageSize={50} />);
  }

  it.each(['mobile', 'desktop'])('offers the final retake directly in the %s results', async (view) => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, message: 'Final retake requested.' }));
    renderResults();
    const buttons = screen.getAllByTestId('allow-assessment-retake');
    expect(buttons).toHaveLength(2);
    fireEvent.click(view === 'desktop' ? within(screen.getByRole('table')).getByTestId('allow-assessment-retake') : buttons[0]);
    const dialog = screen.getByRole('dialog', { name: 'Request final retake for Student Example?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request final retake' }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/admin/members/student-1/reset-assessment', expect.objectContaining({ method: 'POST' }));
  });

  it.each([
    { assessmentAttemptCount: 2, assessmentRetakeRequestedAt: null },
    { assessmentAttemptCount: 1, assessmentRetakeRequestedAt: new Date('2026-10-15T11:00:00Z') },
  ])('keeps both result controls unavailable for %j', (state) => {
    renderResults(state);
    for (const button of screen.getAllByTestId('allow-assessment-retake')) expect(button).toBeDisabled();
  });

  it('preserves the student results view when filtering or paging', () => {
    renderResults();
    fireEvent.change(screen.getByLabelText('Program:'), { target: { value: 'IT Support' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(nav.push).toHaveBeenCalledWith('/admin/assessments?program=IT+Support&ui=legacy');
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    expect(nav.push).toHaveBeenCalledWith('/admin/assessments?page=2&ui=legacy', { scroll: false });
  });
});
const props = { memberId: 'student-1', memberName: 'Student Example' };

describe('staff final assessment retake control', () => {
  it('confirms, requests the portal prompt, and stays disabled while refresh is delayed', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, message: 'Final retake requested.' }));
    const { container } = render(<AllowAssessmentRetakeButton {...props} attemptCount={1} />);
    fireEvent.click(screen.getByTestId('allow-assessment-retake'));
    const dialog = screen.getByRole('dialog', { name: 'Request final retake for Student Example?' });
    expect(within(dialog).getByText(/2 preassessment chances total/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request final retake' }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/counselor/assessment-retake', expect.objectContaining({ method: 'POST', body: JSON.stringify({ memberId: 'student-1' }) }));
    expect(screen.getByTestId('allow-assessment-retake')).toBeDisabled();
    expect(screen.getByTestId('allow-assessment-retake')).toHaveTextContent('Retake requested');
    expect(within(container).getByRole('status')).toHaveTextContent('Final retake requested.');
  });
  it('cancels without issuing a request', () => {
    render(<AllowAssessmentRetakeButton {...props} />);
    fireEvent.click(screen.getByTestId('allow-assessment-retake'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    ['missing acknowledgement', () => Response.json({ message: 'Done' })],
    ['negative acknowledgement', () => Response.json({ ok: false })],
    ['unreadable acknowledgement', () => new Response('<html>Temporary response</html>', { status: 200 })],
    ['null acknowledgement', () => Response.json(null)],
  ])('does not claim authorization after a successful HTTP response with %s', async (_label, response) => {
    fetchMock.mockResolvedValue(response());
    const { container, rerender } = render(<AllowAssessmentRetakeButton {...props} attemptCount={1} />);
    fireEvent.click(screen.getByTestId('allow-assessment-retake'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Request final retake' }));
    expect(await within(container).findByRole('alert')).toHaveTextContent('Retake authorization could not be confirmed');
    expect(screen.getByTestId('allow-assessment-retake')).toHaveTextContent('Request final retake');
    expect(screen.getByTestId('allow-assessment-retake')).toBeEnabled();
    expect(within(container).getByText(/Final retake is not yet authorized/)).toBeInTheDocument();
    expect(nav.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();

    // Only refreshed, server-owned permission can resolve an uncertain response.
    rerender(<AllowAssessmentRetakeButton {...props} attemptCount={1} pending />);
    expect(screen.getByTestId('allow-assessment-retake')).toBeDisabled();
    expect(within(container).getByText(/Final retake authorized/)).toBeInTheDocument();
    expect(within(container).queryByRole('alert')).toBeNull();
  });
  it('uses a safe confirmation when the acknowledged response has a non-text message', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, message: { unexpected: true } }));
    const { container } = render(<AllowAssessmentRetakeButton {...props} attemptCount={1} />);
    fireEvent.click(screen.getByTestId('allow-assessment-retake'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Request final retake' }));
    expect(await within(container).findByRole('status')).toHaveTextContent('Final retake authorized.');
    expect(screen.getByTestId('allow-assessment-retake')).toBeDisabled();
  });
  it('shows a refused save and allows retry', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Both attempts used.' }, { status: 409 }));
    const { container } = render(<AllowAssessmentRetakeButton {...props} />);
    fireEvent.click(screen.getByTestId('allow-assessment-retake'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Request final retake' }));
    expect(await within(container).findByRole('alert')).toHaveTextContent('Both attempts used.');
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
