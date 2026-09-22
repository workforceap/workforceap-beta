import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import MemberOnboardingWizard, { type MemberOnboardingWizardProps } from './MemberOnboardingWizard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Owner call 2026-09-22 (Slack ts 1790092663.833649): the closing step of the
 * member wizard names the assigned counselor (or says none is assigned yet)
 * and quotes a measured wait only when one exists. The unmeasured "1 to 2
 * business days" promise is gone from every rendered state.
 */
const CATALOGS: Record<string, AbstractIntlMessages> = { en, es, fr, pt };
const RETIRED_COPY = /1 to 2 business days|business days|follow up with your next step/i;
/** Index of the "You're all set" step. */
const LAST_STEP = 5;

const base: MemberOnboardingWizardProps = {
  initialFullName: 'Sam Rivera',
  initialPhone: '',
  initialAddress: '',
  initialCity: '',
  initialState: '',
  initialZip: '',
  initialProgramInterest: '',
  initialReferralSource: '',
  initialStep: LAST_STEP,
  onComplete: () => {},
};

function renderWizard(props: Partial<MemberOnboardingWizardProps>, locale = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={CATALOGS[locale]}>
      <MemberOnboardingWizard {...base} {...props} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe('MemberOnboardingWizard closing step', () => {
  it('names the assigned counselor, links their thread and quotes the measured wait', () => {
    renderWizard({
      counselor: { firstName: 'Dana', messagingHref: '/dashboard/messages' },
      waitEstimate: { medianDays: 40, sampleSize: 12 },
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: "You're all set" })).toBeTruthy();
    expect(dialog.textContent).toContain('Your counselor, Dana, will review your application.');
    expect(within(dialog).getByRole('link', { name: 'Message Dana' }).getAttribute('href')).toBe('/dashboard/messages');
    expect(dialog.querySelector('[data-onboarding-wait-estimate]')?.textContent).toBe(
      'Recent applications were reviewed in about 40 days (based on 12 decisions in the last 30 days).',
    );
    expect(dialog.querySelector('[data-onboarding-reviewer]')?.getAttribute('data-onboarding-reviewer')).toBe('assigned');
    expect(dialog.textContent).not.toMatch(RETIRED_COPY);
  });

  it('says no counselor is assigned yet and shows no timing when the estimate is suppressed', () => {
    renderWizard({ counselor: null, waitEstimate: null });
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain("A counselor will be assigned to you; you'll see their name here.");
    expect(dialog.querySelector('[data-onboarding-reviewer]')?.getAttribute('data-onboarding-reviewer')).toBe('unassigned');
    expect(dialog.querySelector('[data-onboarding-wait-estimate]')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Message / })).toBeNull();
    // The decision itself is still described from what actually happens (email + dashboard).
    expect(dialog.textContent).toContain("We review your application; you'll hear by email and see the decision here.");
    expect(dialog.textContent).not.toMatch(RETIRED_COPY);
  });

  it('omits the counselor and wait props entirely without breaking (legacy callers)', () => {
    renderWizard({});
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('[data-onboarding-reviewer]')?.getAttribute('data-onboarding-reviewer')).toBe('unassigned');
    expect(dialog.textContent).not.toMatch(RETIRED_COPY);
  });

  it.each(['es', 'fr', 'pt'])('%s: the closing step resolves to translated copy (no raw keys)', (locale) => {
    renderWizard(
      {
        counselor: { firstName: 'Dana', messagingHref: '/dashboard/messages' },
        waitEstimate: { medianDays: 40, sampleSize: 12 },
      },
      locale,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Dana');
    expect(dialog.textContent).not.toMatch(/reviewer\.|memberApproval\./);
    expect(dialog.querySelector('[data-onboarding-wait-estimate]')!.textContent).toMatch(/40/);
    expect(dialog.textContent).not.toMatch(RETIRED_COPY);
  });
});
