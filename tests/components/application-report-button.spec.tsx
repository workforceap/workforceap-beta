import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ApplicationReportButton from '@/components/admin/ApplicationReportButton';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('application report download', () => {
  it('downloads the saved report and explains how to print it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('%PDF', { headers: { 'Content-Type': 'application/pdf' } }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:report'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ApplicationReportButton memberId="member-A" applicationId="app-A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download application report' }));
    await screen.findByText(/Open the PDF to print one page/);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/members/member-A/applications/app-A/report', { method: 'POST' });
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
  it('shows a recoverable error and re-enables download', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Please try again.' }), { status: 500 })));
    render(<ApplicationReportButton memberId="member-A" applicationId="app-A" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download application report' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Please try again.'));
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
