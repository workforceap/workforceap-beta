import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WAP-240: signup awaits the applicant receipt before it responds, so the
 * confirmation page must not send a second copy. It mounts the receipt retry
 * only when signup reported that send failed (`?receipt=0`).
 */
const mocks = vi.hoisted(() => ({ user: vi.fn() }));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/components/LocalizedLink', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/Footer', () => ({ default: () => null }));
vi.mock('@/components/MobileBottomNav', () => ({ default: () => null }));
vi.mock('@/components/apply/ApplyConfirmationCta', () => ({ default: () => null }));
vi.mock('@/components/marketing/ThankYouViewTracker', () => ({ default: () => null }));
vi.mock('@/components/apply/ShareButtons', () => ({ default: () => null }));
vi.mock('@/components/portal/ProgramCommitmentPanel', () => ({ default: () => null }));
vi.mock('@/components/apply/ApplyConfirmationReceiptRetry', () => ({
  default: ({ email }: { email: string }) => <div data-testid="receipt-retry">{email}</div>,
}));

import ApplyConfirmationPage from '@/app/apply/confirmation/page';

async function render(searchParams: Record<string, string>) {
  return renderToStaticMarkup(await ApplyConfirmationPage({ searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  mocks.user.mockResolvedValue({ id: 'u1', email: 'applicant@example.test', user_metadata: { full_name: 'Avery Applicant' } });
});

describe('apply confirmation receipt (WAP-240)', () => {
  it('does not resend the receipt signup already sent', async () => {
    expect(await render({})).not.toContain('data-testid="receipt-retry"');
    expect(await render({ school: '1' })).not.toContain('data-testid="receipt-retry"');
  });

  it('retries the receipt when signup reported the send failed', async () => {
    const html = await render({ receipt: '0' });
    expect(html).toContain('data-testid="receipt-retry"');
    expect(html).toContain('applicant@example.test');
  });

  it('never retries for a signed-out visitor', async () => {
    mocks.user.mockResolvedValue(null);
    expect(await render({ receipt: '0' })).not.toContain('data-testid="receipt-retry"');
  });
});
