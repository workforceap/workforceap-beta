import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import PartnerShareToolkit from '@/components/partner/PartnerShareToolkit';
import { buildPartnerShareLinks } from '@/lib/partner/shareLinks';

/**
 * The share toolkit offers a copyable "About WorkforceAP" blurb next to the
 * channel links: the full mission statement from `mission.statement`, the
 * same key the /join page and the invitation email use.
 */
const clipboard = vi.fn();
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } });
  clipboard.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('partner share toolkit: About WorkforceAP blurb', () => {
  it('shows the mission statement verbatim after the channel links and copies it without sending anything', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const links = buildPartnerShareLinks({ referralCode: 'ace-demo', slug: 'ace-demo', name: 'Ace' }, 'https://www.workforceap.org');
    const { container } = render(
      <PartnerShareToolkit
        links={links}
        about={{ heading: messages.mission.aboutHeading, statement: messages.mission.statement }}
      />,
    );

    const about = container.querySelector<HTMLElement>('[data-share-about]')!;
    expect(within(about).getByRole('heading', { name: 'About WorkforceAP' })).toBeVisible();
    expect(within(about).getByText(messages.mission.statement)).toBeVisible();

    // Placed right after the "Links by channel" rows.
    const channels = screen.getByRole('heading', { name: 'Links by channel' }).parentElement!;
    expect(channels.nextElementSibling).toBe(about);

    fireEvent.click(within(about).getByRole('button', { name: 'Copy about blurb' }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(messages.mission.statement));
    expect(await within(about).findByRole('button', { name: 'Blurb copied' })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
