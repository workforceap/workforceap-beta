import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import MemberDoThisNextCard from '@/components/portal/MemberDoThisNextCard';
import type { NextBestAction } from '@/lib/member/nextBestActions';
import { postMemberEvent } from '@/lib/events/client';
import { trackFunnelEvent } from '@/lib/analytics/events';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/link', () => ({ default: (props: ComponentProps<'a'>) => <a {...props} /> }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));
vi.mock('@/lib/events/client', () => ({ postMemberEvent: vi.fn() }));

const action: NextBestAction = {
  id: '22222222-2222-4222-8222-222222222222', title: 'Finish your profile', body: 'Two fields left.',
  href: '/dashboard/profile', cta: 'Open profile', variant: 'default', weight: 10,
};

describe('next-step clicks are not completion evidence', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it.each([action.id, 'resume_training'])('records a click without completing action %s', (id) => {
    render(<MemberDoThisNextCard action={{ ...action, id }} />);
    const link = screen.getByRole('link', { name: 'Open profile' });
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    expect(link).toHaveAttribute('href', '/dashboard/profile');
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Finish your profile')).toBeInTheDocument();
    expect(trackFunnelEvent).toHaveBeenCalledWith('member_dashboard', 'dashboard_primary_cta_clicked', expect.objectContaining({ action_id: id }));
    expect(postMemberEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'member_dashboard_action_clicked',
      entityId: id === action.id ? id : undefined,
    }));
  });

  it('allows ordinary link navigation without waiting for a persistence request', () => {
    render(<MemberDoThisNextCard action={action} />);
    let preventedByCard = true;
    document.addEventListener('click', (event) => {
      preventedByCard = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    fireEvent.click(screen.getByRole('link', { name: 'Open profile' }), { ctrlKey: true });
    expect(preventedByCard).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retires a persisted suggestion only through explicit dismissal and keeps keyboard focus', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    render(<MemberDoThisNextCard action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'dismissSuggestion' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
    expect(fetch).toHaveBeenCalledWith(`/api/member/nba/${action.id}`, expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ status: 'DISMISSED' }),
    }));
    expect(screen.queryByRole('link', { name: 'Open profile' })).not.toBeInTheDocument();
    expect(postMemberEvent).not.toHaveBeenCalled();
  });

  it.each(['http', 'network'])('keeps the suggestion available if dismissal fails: %s', async (failure) => {
    if (failure === 'http') vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    else vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    render(<MemberDoThisNextCard action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'dismissSuggestion' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('dismissSuggestionError'));
    expect(screen.getByRole('link', { name: 'Open profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dismissSuggestion' })).toBeEnabled();
  });
});
