import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

/**
 * Mike ops ask: the layoff / last-employer question is asked on every adult
 * eligibility surface (organic apply, member portal, token link) with the
 * same wording, and it is not gated behind the unemployment answers.
 * Formerly asserted by reading the three component sources in
 * lib/apply/layoffCompanyUi.test.ts.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/apply',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/analytics/events', () => ({ trackApplyFunnel: vi.fn(), trackFunnelEvent: vi.fn() }));

import ApplyEligibilityClient from '@/app/apply/ApplyEligibilityClient';
import EligibilityForm from '@/app/(portal)/dashboard/eligibility/EligibilityForm';
import PublicEligibilityForm from '@/app/q/[token]/PublicEligibilityForm';

const LABEL = 'What company did you get laid off from, or last work for?';

function show(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('layoff / last employer question', () => {
  it('apply eligibility renders the field on the first (funding) panel before any answer is given', () => {
    show(<ApplyEligibilityClient />);
    const input = screen.getByLabelText(en.apply.eligibilityLayoffCompanyLabel);
    expect(en.apply.eligibilityLayoffCompanyLabel).toBe(LABEL);
    expect(input).toHaveAttribute('name', 'layoffCompany');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('member portal eligibility form asks with the same wording', () => {
    show(
      <EligibilityForm
        initial={{ ageGroup: '' as never, city: '', state: '', zip: '', county: '', primaryBarriers: [] }}
      />,
    );
    expect(screen.getByLabelText(LABEL)).toBeInTheDocument();
  });

  it('token-link eligibility form asks with the same wording', () => {
    show(
      <PublicEligibilityForm
        token="tok_test"
        prefill={{ firstName: '', lastName: '', phone: '', email: '', ageGroup: '', city: '', state: '', zip: '', county: '', primaryBarriers: [] }}
      />,
    );
    expect(screen.getByLabelText(LABEL)).toBeInTheDocument();
  });
});
