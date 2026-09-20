import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminMemberNotesPanel from '@/app/admin/members/[id]/AdminMemberNotesPanel';

/**
 * Admin member record — Notes tab (wave 16). The panel reuses the existing
 * admin notes route (`/api/admin/members/[id]/notes`: GET list, POST
 * { content }) and never offers a delete the route does not have.
 */
const NOTE = {
  id: 'note-1',
  content: 'Called about missing transcript.',
  createdAt: '2026-09-18T10:00:00Z',
  author: { fullName: 'Staff Person', email: 'staff@example.com' },
};

describe('AdminMemberNotesPanel', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('loads notes from the admin route on mount and lists them newest first', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [NOTE] });
    render(<AdminMemberNotesPanel memberId="member-1" />);

    await waitFor(() => expect(screen.getByText('Called about missing transcript.')).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/members/member-1/notes');
    expect(init.method ?? 'GET').toBe('GET');
    expect(screen.getByText(/Staff Person/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows the empty copy when the member has no notes', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    render(<AdminMemberNotesPanel memberId="member-1" />);
    await waitFor(() => expect(screen.getByText(/No staff notes yet/)).toBeInTheDocument());
  });

  it('POSTs { content } to the same route and prepends the saved note', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ ...NOTE, id: 'note-2', content: 'Follow up Friday.' }) });
    render(<AdminMemberNotesPanel memberId="member-1" />);
    await waitFor(() => expect(screen.getByText(/No staff notes yet/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '+ Add note' }));
    fireEvent.change(screen.getByLabelText('Staff note'), { target: { value: '  Follow up Friday.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/admin/members/member-1/notes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ content: 'Follow up Friday.' });
    await waitFor(() => expect(screen.getByText('Follow up Friday.')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Note saved.');
  });

  it('reports a failed save as one plain sentence and keeps the draft', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }), text: async () => '' });
    render(<AdminMemberNotesPanel memberId="member-1" />);
    await waitFor(() => expect(screen.getByText(/No staff notes yet/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '+ Add note' }));
    fireEvent.change(screen.getByLabelText('Staff note'), { target: { value: 'Keep me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByLabelText('Staff note')).toHaveValue('Keep me');
  });
});
