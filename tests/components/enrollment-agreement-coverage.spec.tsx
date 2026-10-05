import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import EnrollmentAgreementCoverageClient from '@/components/enrollment/EnrollmentAgreementCoverageClient';
import type { EnrollmentAgreementCoverage } from '@/lib/enrollmentAgreements/types';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => Response.json(body, { status });
const coverage = (overrides: Partial<EnrollmentAgreementCoverage> = {}): EnrollmentAgreementCoverage => ({
  rows: [{ memberId: 'fixture/one', fullName: 'Fixture Student', status: 'missing', uploadedAt: null }],
  page: 1, hasMore: false, total: 1,
  counts: { missing: 1, pending: 2, verified: 3, needs_correction: 4 }, ...overrides,
});
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}
const show = () => render(<NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}><EnrollmentAgreementCoverageClient /></NextIntlClientProvider>);
async function filter(label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Agreement status' }));
  fireEvent.click(await screen.findByRole('option', { name: label, hidden: true }));
}
const originalShowPopover = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
const originalHidePopover = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover');
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  for (const [method, state] of [['showPopover', 'open'], ['hidePopover', 'closed']] as const) {
    Object.defineProperty(HTMLElement.prototype, method, { configurable: true, value: vi.fn(function (this: HTMLElement) {
      if (state === 'open') this.setAttribute('data-test-popover-open', ''); else this.removeAttribute('data-test-popover-open');
      const event = new Event('toggle'); Object.defineProperty(event, 'newState', { value: state }); this.dispatchEvent(event);
    }) });
  }
  const matches = HTMLElement.prototype.matches;
  vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (this: HTMLElement, selector: string) {
    return selector === ':popover-open' ? this.hasAttribute('data-test-popover-open') : matches.call(this, selector);
  });
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  for (const [key, descriptor] of [['showPopover', originalShowPopover], ['hidePopover', originalHidePopover], ['scrollIntoView', originalScrollIntoView]] as const) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor); else Reflect.deleteProperty(HTMLElement.prototype, key);
  }
});

describe('EnrollmentAgreementCoverageClient', () => {
  it('starts with missing in this organization, never substituting a zero count for loading', async () => {
    const read = deferred(); fetchMock.mockReturnValueOnce(read.promise); show();
    expect(screen.getByRole('combobox', { name: 'Agreement status' })).toHaveTextContent('Missing');
    expect(screen.queryByText('No students match this status')).not.toBeInTheDocument();
    expect(screen.queryByText(/matching students/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/enrollment-agreements/coverage?status=missing&page=1');
    expect(fetchMock.mock.calls[0][1]?.cache).toBe('no-store');
    await act(async () => read.resolve(json(coverage())));
    expect(await screen.findByText('Page 1 · 1 matching students')).toBeInTheDocument();
    expect(screen.getByText(/Active students in your organization/)).toBeInTheDocument();
    expect(screen.getByText(/not funding approval, enrollment activation, or an electronic signature/)).toBeInTheDocument();
  });

  it('links desktop and mobile rows to the exact student Program tab and shows supplied counts', async () => {
    fetchMock.mockResolvedValueOnce(json(coverage())); const { container } = show();
    const links = await screen.findAllByRole('link', { name: 'Fixture Student' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/admin/members/fixture%2Fone?tab=program');
    const labels = ['Missing', 'Awaiting review', 'Verified', 'Needs correction'];
    const descriptions = Array.from(container.querySelectorAll('dl > div'));
    expect(descriptions.map((row) => row.querySelector('dt')?.textContent)).toEqual(labels);
    expect(descriptions.map((row) => row.querySelector('dd')?.textContent)).toEqual(['1', '2', '3', '4']);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('changes filters and resets pagination to the first page', async () => {
    fetchMock.mockResolvedValueOnce(json(coverage({ total: 51, hasMore: true }))).mockResolvedValueOnce(json(coverage({ page: 2, total: 51 })));
    show(); await screen.findByText('Page 1 · 51 matching students');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 2 · 51 matching students');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/enrollment-agreements/coverage?status=missing&page=2');
    fetchMock.mockResolvedValueOnce(json(coverage({ rows: [], total: 0 })));
    await filter('Awaiting review');
    await screen.findByText('Page 1 · 0 matching students');
    expect(fetchMock.mock.calls[2][0]).toBe('/api/enrollment-agreements/coverage?status=pending&page=1');
    expect(screen.getAllByRole('heading', { name: 'No students match this status' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('shows unavailable instead of an empty roster and retries without inventing coverage counts', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Failure</html>', { status: 503 }));
    const { container } = show();
    expect(await within(container).findByRole('alert')).toHaveTextContent('This service is temporarily unavailable. Try again in a minute.');
    expect(screen.queryByText('No students match this status')).not.toBeInTheDocument();
    expect(container.querySelector('dl')).toBeNull();
    fetchMock.mockResolvedValueOnce(json(coverage()));
    fireEvent.click(screen.getByRole('button', { name: 'Retry coverage' }));
    await screen.findByText('Page 1 · 1 matching students');
    expect(within(container).queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/enrollment-agreements/coverage?status=missing&page=1');
  });

  it('automatically returns to the prior page if the last page empties after a review', async () => {
    fetchMock.mockResolvedValueOnce(json(coverage({ total: 51, hasMore: true })))
      .mockResolvedValueOnce(json(coverage({ rows: [], page: 2, total: 50 })))
      .mockResolvedValueOnce(json(coverage({ total: 50 })));
    show(); await screen.findByText('Page 1 · 51 matching students');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Page 1 · 50 matching students')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/enrollment-agreements/coverage?status=missing&page=1',
      '/api/enrollment-agreements/coverage?status=missing&page=2',
      '/api/enrollment-agreements/coverage?status=missing&page=1',
    ]);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('aborts and ignores an old filter response that resolves after a newer selection', async () => {
    const old = deferred(); fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(json(coverage({
      rows: [{ memberId: 'verified-student', fullName: 'Verified Fixture', status: 'verified', uploadedAt: '2026-10-01T12:00:00Z' }],
    })));
    show(); const signal = fetchMock.mock.calls[0][1]?.signal;
    await filter('Verified');
    await screen.findAllByRole('link', { name: 'Verified Fixture' });
    expect(signal?.aborted).toBe(true);
    await act(async () => old.resolve(json(coverage())));
    expect(screen.queryByRole('link', { name: 'Fixture Student' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Verified Fixture' })).toHaveLength(2);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/enrollment-agreements/coverage?status=verified&page=1');
  });

  it('aborts an in-flight request when leaving coverage', async () => {
    const read = deferred(); fetchMock.mockReturnValueOnce(read.promise); const { unmount } = show();
    const signal = fetchMock.mock.calls[0][1]?.signal; unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => read.resolve(json(coverage())));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
