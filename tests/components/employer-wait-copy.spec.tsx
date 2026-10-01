import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Employer surfaces after #2488's follow-up sweep: the public intake form
 * (/employers) and the signed-in guide (/employer/guide) say a review happens
 * and an email follows; neither names a number of business days.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/analytics/events', () => ({ trackLeadFormEvent: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'emp-user-1' }) }));
vi.mock('@/lib/auth/roles', () => ({ getEmployerForUser: async () => ({ employer: { id: 'emp-1' } }) }));
vi.mock('@/lib/auth/portalGuards', () => ({ unlinkedEmployerHref: async () => '/employer/link' }));
vi.mock('@/components/employer/EmployerPageOpener', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import EmployerContactForm from '@/app/employers/EmployerContactForm';
import EmployerGuidePage from '@/app/(portal)/employer/guide/page';

const RETIRED_COPY = /business days|within 24 hours|within 48 hours/i;

afterEach(cleanup);

describe('employer intake form', () => {
  it('describes the review and the email follow-up without a fixed wait', () => {
    const { container } = render(<EmployerContactForm />);
    expect(container.textContent).toContain(
      'Share your hiring intent, role needs, expected volume, and timeline. Our team reviews every submission and emails you with the right partnership path.',
    );
    expect(container.textContent).toContain('We review every submission and follow up by email.');
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });
});

describe('employer guide FAQ', () => {
  it('answers "how long until I see candidates" with the review step, not a day count', async () => {
    const { container } = render(await EmployerGuidePage());
    const question = screen.getByRole('heading', { name: 'How long until I see candidates?' });
    const answer = question.parentElement?.querySelector('p');
    expect(answer?.textContent).toBe(
      'Our team reviews each new posting before matching begins, and you get an email when candidates are ready. Timing depends on your location and requirements.',
    );
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });
});
