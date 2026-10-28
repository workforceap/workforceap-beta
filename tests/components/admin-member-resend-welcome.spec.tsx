import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminMemberResendWelcome from '@/components/admin/AdminMemberResendWelcome';

afterEach(() => { vi.unstubAllGlobals(); });
describe('resend welcome letter', () => {
  it('blocks duplicate clicks while pending and reports provider acceptance', async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminMemberResendWelcome memberId="member/A" />);
    const button = screen.getByRole('button', { name: 'Resend welcome letter' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/members/member%2FA/resend-welcome', { method: 'POST' });
    resolve(new Response('{}', { status: 200 }));
    expect(await screen.findByRole('status')).toHaveTextContent('accepted by the email provider');
    expect(button).not.toBeDisabled();
  });
  it('shows an error and permits another attempt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Please try again later.' }), { status: 502 })));
    render(<AdminMemberResendWelcome memberId="m1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Resend welcome letter' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Please try again later.'));
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
