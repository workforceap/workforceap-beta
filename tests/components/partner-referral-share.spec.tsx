import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PartnerReferralShare from '@/components/partner/PartnerReferralShare';
import PartnerReferralResourcesSection from '@/components/partner/PartnerReferralResourcesSection';
import { buildPartnerReferralLink } from '@/lib/partner/referralLink';

const clipboard = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://training.example.invalid');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } });
  clipboard.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('partner attributed sharing', () => {
  it('shows the referral URL inline and copies without sending a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const link = buildPartnerReferralLink({ referralCode: ' community&1 ', slug: 'community' });
    render(<PartnerReferralShare url={link.url} referralCode={link.referralCode} />);
    const input = screen.getByLabelText('Referral link') as HTMLInputElement;
    expect(input).toBeVisible();
    expect(input.value).toBe(link.url);
    expect(new URL(input.value).searchParams.get('ref')).toBe('community&1');
    expect(screen.getByText('Referral code: community&1')).toBeVisible();
    expect(clipboard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(input.value));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('keeps the visible link available for manual copying when clipboard permission fails', async () => {
    clipboard.mockRejectedValue(new Error('Clipboard denied'));
    const link = buildPartnerReferralLink({ referralCode: '', slug: 'community-slug' });
    render(<PartnerReferralShare url={link.url} referralCode={link.referralCode} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copy failed. Select the link above and copy it manually.')).toBeVisible();
    expect(screen.getByLabelText('Referral link')).toHaveValue('https://training.example.invalid/apply?ref=community-slug');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
  });

  it('keeps attribution in both editable outreach templates and states funding is confirmed by WorkforceAP', async () => {
    const url = 'https://training.example.invalid/apply?ref=community';
    render(<PartnerReferralResourcesSection partnerName="Synthetic Community" referralApplyUrl={url} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy email text' }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(expect.stringContaining(url)));
    expect(clipboard.mock.calls[0][0]).toContain('any required funding are confirmed by WorkforceAP');
    fireEvent.click(screen.getByRole('button', { name: 'Copy caption' }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledTimes(2));
    expect(clipboard.mock.calls[1][0]).toContain(url);
    expect(clipboard.mock.calls[1][0]).not.toContain('at no cost');
  });
});
