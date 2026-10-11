import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { pickRootClientMessages } from '@/lib/i18n/pickRootClientMessages';

/**
 * /find-your-path results: the two "follow up within 1–2 business days"
 * lines are replaced by what actually happens (a counselor reviews every
 * application; the decision arrives by email). The results view is reached
 * the way a returning visitor reaches it: stored quiz results in localStorage.
 */

vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/find-your-path' }));

import FindYourPathClient from '@/app/(decision-journey)/find-your-path/FindYourPathClient';

const RETIRED_COPY = /business days|follows up within|follow up within/i;
const STORED_RESULTS = {
  version: 1,
  programSlugs: [
    'it-support-professional-certificate-ibm',
    'it-support-and-entry-level-cyber-security-certificate',
    'ai-practitioner-professional-certificate-aws',
  ],
  careerMatch: null,
};

beforeEach(() => {
  localStorage.setItem('find_your_path_results', JSON.stringify(STORED_RESULTS));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('find-your-path results copy', () => {
  it.each([en.apply.applicationTimeEstimate, 'Updated total estimate'])('states the review and email with the shared estimate %s', async (applicationTimeEstimate) => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={pickRootClientMessages({ ...en, apply: { ...en.apply, applicationTimeEstimate } })}>
        <FindYourPathClient />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByText(/IT Support Professional Certificate/).length).toBeGreaterThan(0));
    expect(container.textContent).toContain(
      `${applicationTimeEstimate} to apply. A counselor reviews every application, and you’ll get an email when a decision is made.`,
    );
    expect(container.textContent).toContain(
      'Choose the track that fits you best, then apply. A counselor reviews every application and follows up by email.',
    );
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });
});
