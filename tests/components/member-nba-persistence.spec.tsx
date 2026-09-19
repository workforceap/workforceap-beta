import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MemberDoThisNextCard from '@/components/portal/MemberDoThisNextCard';
import MemberNextStepsStrip from '@/components/portal/MemberNextStepsStrip';
import type { NextBestAction } from '@/lib/member/nextBestActions';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));
vi.mock('@/lib/events/client', () => ({ postMemberEvent: vi.fn() }));
const action: NextBestAction = {
  id: '22222222-2222-4222-8222-222222222222', title: 'Finish your profile', body: 'Two fields left.',
  href: '/dashboard/profile', cta: 'Open profile', variant: 'default', weight: 10,
};
describe.each(['today', 'strip'])('%s completion persistence', (variant) => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const show = () => render(variant === 'today'
    ? <MemberDoThisNextCard action={action} variant="kit" />
    : <MemberNextStepsStrip actions={[action]} />);
  it.each(['http', 'network'])('restores an unsaved card after %s failure and still navigates', async (failure) => {
    if (failure === 'http') vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    else vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    show();
    fireEvent.click(screen.getByRole('link', { name: 'Open profile' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/profile'));
    expect(screen.getByText('Finish your profile')).toBeInTheDocument();
  });
  it('keeps a durably completed card hidden', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    show();
    fireEvent.click(screen.getByRole('link', { name: 'Open profile' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/profile'));
    expect(screen.queryByText('Finish your profile')).toBeNull();
  });
});
