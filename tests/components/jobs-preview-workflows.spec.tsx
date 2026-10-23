import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobsListingClient from '@/app/(portal)/dashboard/jobs/JobsListingClient';
import MobileApplyFunnel from '@/app/(portal)/dashboard/jobs/[id]/MobileApplyFunnel';
import LogExternalApplicationButton from '@/components/portal/jobs/LogExternalApplicationButton';
import { MemberJobDetail } from '@/components/portal/kit/pages/member/MemberJobDetail';
import en from '@/messages/en.json';

const nav = vi.hoisted(() => ({ query: 'state=listing', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  usePathname: () => '/dev/member/jobs',
  useSearchParams: () => new URLSearchParams(nav.query),
}));

let phone = false;
const fetchMock = vi.fn();
const jobs = [
  { id: 'cloud', title: 'Cloud support', location: 'Austin', locationType: 'onsite', jobType: 'fulltime', salaryMin: 60000, salaryMax: 70000, employer: { companyName: 'Sample A', logoUrl: null }, programSlugs: ['aws-cloud-technology-amazon'] },
  { id: 'it', title: 'IT support', location: 'Remote', locationType: 'remote', jobType: 'contract', salaryMin: 40000, salaryMax: 50000, employer: { companyName: 'Sample B', logoUrl: null }, programSlugs: ['comptia-a-professional-certificate'] },
];

beforeEach(() => {
  phone = false;
  nav.query = 'state=listing';
  nav.push.mockReset();
  fetchMock.mockReset();
  window.history.replaceState(null, '', '/dev/member/jobs?state=listing');
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width') ? phone : !phone, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function listing(initialJobs = jobs) {
  return render(<NextIntlClientProvider locale="en" messages={en}><JobsListingClient preview initialJobs={initialJobs} /></NextIntlClientProvider>);
}

describe('credential-free Jobs review flows', () => {
  it('lets a phone user search directly without opening filters or loading recommendations first', () => {
    phone = true;
    vi.useFakeTimers();
    render(<NextIntlClientProvider locale="en" messages={en}><JobsListingClient preview initialJobs={jobs} initialMatchedJobs={[{ id: 'cloud', title: 'Cloud support', company: 'Sample A', location: 'Austin', locationType: 'onsite', matchPct: 92 }]} /></NextIntlClientProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    const search = screen.getByRole('searchbox', { name: 'Search jobs' });
    const recommendations = screen.getByText('Best matches for you').closest('details');
    expect(recommendations).not.toHaveAttribute('open');
    expect(search.compareDocumentPosition(recommendations!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    fireEvent.change(search, { target: { value: 'Cloud' } });
    act(() => vi.advanceTimersByTime(450));
    expect(screen.getByText('1 job found')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Cloud support/ }).filter((link) => !recommendations!.contains(link))).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /IT support/ })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the server-rendered phone Apply trigger disabled until its handler hydrates', async () => {
    phone = true;
    const ui = <MobileApplyFunnel preview jobId="cloud" jobTitle="Cloud support" />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);
    let root: Root | undefined;
    try {
      const loading = within(container).getByRole('button', { name: 'Application controls are loading' });
      expect(loading).toBeDisabled();
      expect(loading).toHaveAttribute('aria-busy', 'true');
      expect(loading).toHaveTextContent('Loading…');
      await act(async () => { root = hydrateRoot(container, ui); });
      const ready = within(container).getByRole('button', { name: 'Apply to Cloud support' });
      expect(ready).toBeEnabled();
      expect(ready).toHaveAttribute('aria-busy', 'false');
      fireEvent.click(ready);
      expect(within(container).getByRole('dialog', { name: 'Review & Submit' })).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it('renders the empty fixture immediately with local recovery destinations', () => {
    listing([]);
    expect(screen.getByRole('heading', { name: en.empty.openings.title })).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByRole('link', { name: en.empty.openings.action })).toHaveAttribute('href', '/dev/member/profile');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters/sorts the sample inventory locally and clears only filters, keeping the scenario', () => {
    listing();
    fireEvent.change(screen.getByLabelText('Location type'), { target: { value: 'remote' } });
    expect(screen.queryByRole('link', { name: /Cloud support/ })).toBeNull();
    expect(screen.getByRole('link', { name: /IT support/ })).toHaveAttribute('href', '/dev/member/jobs?state=detail&job=it');
    fireEvent.click(screen.getByRole('button', { name: en.jobs.clearAllFilters }));
    expect(window.location.search).toBe('?state=listing');
    expect(screen.getByText('2 jobs found')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'salary-asc' } });
    expect(screen.getAllByRole('link').filter((link) => link.classList.contains('wa-job-listing-row')).map((link) => link.querySelector('h3')?.textContent)).toEqual(['IT support', 'Cloud support']);
    fireEvent.change(screen.getByLabelText('Program'), { target: { value: 'aws-cloud-technology-amazon' } });
    expect(screen.getByText('1 job found')).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps saves local and restores filters on browser history changes', () => {
    listing();
    const row = screen.getByRole('link', { name: /Cloud support/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Save job' }));
    expect(within(row).getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true');
    act(() => {
      window.history.replaceState(null, '', '/dev/member/jobs?state=listing&locationType=remote');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('link', { name: /Cloud support/ })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a useful zero-result state after a typed search and clears without leaving the fixture', () => {
    vi.useFakeTimers();
    listing();
    fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'does-not-exist' } });
    act(() => vi.advanceTimersByTime(450));
    const empty = screen.getByRole('heading', { name: en.empty.jobsFiltered.title }).closest('.wa-kit-empty') as HTMLElement;
    fireEvent.click(within(empty).getByRole('button', { name: en.empty.jobsFiltered.action }));
    expect(screen.getByText('2 jobs found')).toBeInTheDocument();
    expect(window.location.search).toBe('?state=listing');
  });

  it('merges a debounced keyword with newer filters and cancels it when history changes', () => {
    vi.useFakeTimers();
    listing();
    fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'support' } });
    fireEvent.change(screen.getByLabelText('Location type'), { target: { value: 'remote' } });
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'salary-asc' } });
    act(() => vi.advanceTimersByTime(450));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('state')).toBe('listing');
    expect(params.get('locationType')).toBe('remote');
    expect(params.get('sort')).toBe('salary-asc');
    expect(params.get('q')).toBe('support');
    expect(screen.getByText('1 job found')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'pending' } });
    act(() => {
      window.history.replaceState(null, '', '/dev/member/jobs?state=listing');
      window.dispatchEvent(new PopStateEvent('popstate'));
      vi.advanceTimersByTime(450);
    });
    expect(window.location.search).toBe('?state=listing');
    expect(screen.getByText('2 jobs found')).toBeInTheDocument();
    expect(screen.getByLabelText('Search jobs')).toHaveValue('');
  });

  it('clears uncommitted keyword text on Back even when both history entries have no keyword', () => {
    vi.useFakeTimers();
    listing();
    fireEvent.change(screen.getByLabelText('Location type'), { target: { value: 'remote' } });
    fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'pending' } });
    act(() => {
      window.history.replaceState(null, '', '/dev/member/jobs?state=listing');
      window.dispatchEvent(new PopStateEvent('popstate'));
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByLabelText('Search jobs')).toHaveValue('');
    expect(screen.getByText('2 jobs found')).toBeInTheDocument();
    expect(window.location.search).toBe('?state=listing');
  });

  it('desktop consent shows inline confirmation and focuses it without mounting a hidden modal', () => {
    render(<><button>Outside control</button><MobileApplyFunnel preview jobId="cloud" /></>);
    const submit = screen.getByRole('button', { name: 'Submit application' });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I consent to share my profile/));
    fireEvent.click(submit);
    const result = screen.getByRole('status', { name: 'Application result' });
    expect(result).toHaveFocus();
    expect(result).toHaveTextContent('Application preview complete');
    expect(result).toHaveTextContent('Nothing was sent');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(result).getByRole('link')).toHaveAttribute('href', '/dev/member/jobs');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('phone consent uses a visible modal with Escape focus restoration and simulated confirmation', async () => {
    phone = true;
    render(<MobileApplyFunnel preview jobId="cloud" jobTitle="Cloud support" />);
    const trigger = screen.getByRole('button', { name: 'Apply to Cloud support' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Review & Submit' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    const restoredTrigger = screen.getByRole('button', { name: 'Apply to Cloud support' });
    expect(restoredTrigger).toHaveFocus();
    fireEvent.click(restoredTrigger);
    const reopened = screen.getByRole('dialog', { name: 'Review & Submit' });
    fireEvent.click(within(reopened).getByLabelText(/I consent to share my profile/));
    fireEvent.click(within(reopened).getByRole('button', { name: 'Submit Application' }));
    expect(screen.getByRole('dialog', { name: 'Application preview complete' })).toHaveTextContent('Nothing was sent to an employer');
    const resultDialog = screen.getByRole('dialog', { name: 'Application preview complete' });
    const back = within(resultDialog).getByRole('button', { name: 'Go back' });
    expect(back).toHaveFocus();
    const returnLink = within(resultDialog).getByRole('link', { name: 'Return to sample job board' });
    fireEvent.keyDown(back, { key: 'Tab', shiftKey: true });
    expect(returnLink).toHaveFocus();
    fireEvent.keyDown(returnLink, { key: 'Tab' });
    expect(back).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps requirements and application outside optional preparation disclosures', () => {
    render(<MemberJobDetail title="Sample role" company="Sample" location="Remote" jobType="Full-time" requirements={['Required credential']} applySlot={<input aria-label="Required application field" />} preparationSlot={<input aria-label="Optional draft" defaultValue="Retained" />} screening={{ packTitle: 'Sample screen', employerLabel: 'Sample', questions: [{ prompt: 'Prepare this answer' }] }} />);
    expect(screen.getByLabelText('Required application field').closest('details')).toBeNull();
    expect(screen.getByText('Required credential').closest('details')).toBeNull();
    const optional = screen.getByLabelText('Optional draft');
    expect(optional.closest('details')).not.toHaveAttribute('open');
    const details = optional.closest('details')!;
    fireEvent.click(details.querySelector('summary')!);
    fireEvent.change(optional, { target: { value: 'Edited draft' } });
    fireEvent.click(details.querySelector('summary')!);
    expect(optional).toHaveValue('Edited draft');
    expect(screen.getByRole('link', { name: 'Review application' })).toHaveAttribute('href', '#job-application');
  });

  it('never claims a counselor notification when logging an outside application in preview', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    try {
      render(<LogExternalApplicationButton preview />);
      fireEvent.click(screen.getByRole('button', { name: 'Log an outside application' }));
      fireEvent.change(screen.getByLabelText(/Company/), { target: { value: 'Sample employer' } });
      fireEvent.change(screen.getByLabelText(/Role/), { target: { value: 'Sample role' } });
      fireEvent.click(screen.getByRole('button', { name: 'Log application' }));
      expect(screen.getByRole('heading', { name: 'Application log preview complete' })).toBeInTheDocument();
      expect(screen.getByText(/Nothing was saved and no counselor was notified/)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', original);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    }
  });
});
