import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * The /apply partner disclosure sits inside the crimson hero on the organic
 * page. With `color: inherit` it took the hero's white text onto its pale
 * box, so the partner line was unreadable. The organic page must render the
 * on-hero tone; the paid variant (light form section) keeps the surface tone.
 */
const h = vi.hoisted(() => ({
  organic: vi.fn(),
  paid: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock('@/lib/apply/resolveSchoolApply', () => ({ resolveSchoolApply: async () => null }));
vi.mock('@/lib/apply/partnerReferralDisclosure', () => ({
  resolvePartnerReferralDisclosure: async (ref: string | null) =>
    ref ? { ref, partnerName: 'Ace Digital Media Group', tier: 'restricted' } : null,
}));
vi.mock('@/lib/apply/partnerDisclosureCopy', () => ({
  getPartnerDisclosureCopy: async () => ({
    label: 'Your referral partner',
    restricted: 'You were referred by {partner}.',
    full: 'You were referred by {partner} (full).',
  }),
}));
vi.mock('@/lib/apply/applyProgramPage', () => ({ buildApplyPageMetadata: async () => ({}) }));
vi.mock('@/components/apply/ApplyMobileStepNav', () => ({ default: () => null }));
vi.mock('@/components/apply/ApplyMobileTrustBar', () => ({ default: () => null }));
vi.mock('@/components/apply/PaidApplyProofBlock', () => ({ default: () => null }));
vi.mock('@/components/marketing/TrustStrip', () => ({ default: () => null }));
vi.mock('@/app/apply/OrganicApplyPage', () => ({
  default: (props: { partnerDisclosure?: ReactNode }) => {
    h.organic(props);
    return <section data-testid="organic-hero">{props.partnerDisclosure}</section>;
  },
}));
vi.mock('@/app/apply/PaidApplyVariant', () => ({
  default: (props: { partnerDisclosure?: ReactNode }) => {
    h.paid(props);
    return <section data-testid="paid-form">{props.partnerDisclosure}</section>;
  },
}));

import ApplyPage from '@/app/apply/page';
import PartnerReferralDisclosure from '@/components/apply/PartnerReferralDisclosure';

afterEach(() => {
  cleanup();
  h.organic.mockClear();
  h.paid.mockClear();
});

describe('/apply partner disclosure tone', () => {
  it('renders the on-hero tone inside the organic crimson hero', async () => {
    render(await ApplyPage({ searchParams: Promise.resolve({ ref: 'ace-demo' }) }));
    expect(h.organic).toHaveBeenCalledTimes(1);
    const note = screen.getByRole('note');
    expect(screen.getByTestId('organic-hero')).toContainElement(note);
    expect(note).toHaveAttribute('data-disclosure-tone', 'onHero');
    expect(note).toHaveTextContent('You were referred by Ace Digital Media Group.');
  });

  it('keeps the surface tone in the paid variant, whose disclosure sits in the light form section', async () => {
    render(await ApplyPage({ searchParams: Promise.resolve({ ref: 'ace-demo', utm_source: 'google' }) }));
    expect(h.paid).toHaveBeenCalledTimes(1);
    const note = screen.getByRole('note');
    expect(screen.getByTestId('paid-form')).toContainElement(note);
    expect(note).toHaveAttribute('data-disclosure-tone', 'surface');
  });

  it('renders nothing for /apply without a valid partner ref', async () => {
    render(await ApplyPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('defaults to the surface tone for /signup, /apply/create-account and /join', () => {
    render(
      <PartnerReferralDisclosure
        initial={{ ref: 'ace-demo', partnerName: 'Ace', tier: 'full' }}
        copy={{ label: 'L', restricted: 'r {partner}', full: 'f {partner}' }}
        reconcileWithPersistedRef={false}
      />,
    );
    expect(screen.getByRole('note')).toHaveAttribute('data-disclosure-tone', 'surface');
    expect(screen.getByRole('note')).toHaveTextContent('f Ace');
  });
});
