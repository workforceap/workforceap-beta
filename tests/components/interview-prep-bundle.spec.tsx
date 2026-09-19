import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InterviewPrepBundle, { type PrepBundleItem } from '@/components/portal/InterviewPrepBundle';

vi.mock('@/components/portal/PortalInlineSpinner', () => ({ PortalInlineSpinner: () => <span aria-hidden="true" /> }));

const saved: PrepBundleItem = { toolType: 'resume', title: 'Saved resume', content: 'My experience', createdAt: '2026-09-19T12:00:00Z' };
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('interview prep materials', () => {
  it('labels available tools separately from saved materials and provides a real starting action', () => {
    render(<InterviewPrepBundle preview items={[]} />);
    expect(screen.getByText('No prep materials yet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tools that create prep materials' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a resume' })).toHaveAttribute('href', '/dashboard/ai-tools/resume-studio?view=rewrite');
    expect(screen.queryByRole('button', { name: 'Email me' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders selectable saved material without the empty assertion or tools menu', () => {
    render(<InterviewPrepBundle preview items={[saved]} />);
    expect(screen.getByText('My experience')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exclude Saved resume in bundle' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('No prep materials yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Tools that create prep materials')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deselect' }));
    expect(screen.getByRole('button', { name: 'Email me' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses saved item count even if the API empty flag is contradictory', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ items: [saved], empty: true }));
    render(<InterviewPrepBundle />);
    expect(await screen.findByText('My experience')).toBeInTheDocument();
    expect(screen.queryByText('No prep materials yet')).not.toBeInTheDocument();
  });

  it('uses an empty item array even when the API flag says nonempty', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ items: [], empty: false }));
    render(<InterviewPrepBundle />);
    expect(await screen.findByText('No prep materials yet')).toBeInTheDocument();
  });

  it.each(['http', 'network', 'malformed'])('keeps %s failures distinct from empty materials and supports retry', async (failure) => {
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'));
    else fetchMock.mockResolvedValueOnce(Response.json(failure === 'malformed' ? {} : { error: 'unavailable' }, { status: failure === 'http' ? 503 : 200 }));
    fetchMock.mockResolvedValueOnce(Response.json({ items: [saved], empty: false }));
    render(<InterviewPrepBundle />);
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load');
    expect(screen.queryByText('No prep materials yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('My experience')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
  });

  it('shows loading separately and aborts its request when unmounted', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { unmount } = render(<InterviewPrepBundle />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading bundle');
    expect(screen.queryByText('No prep materials yet')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
