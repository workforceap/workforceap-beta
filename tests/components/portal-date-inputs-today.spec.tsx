process.env.TZ = 'UTC';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/LocalizedLink', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import ParentalConsentForm from '@/components/forms/ParentalConsentForm';

describe('client date inputs bound "today" to the portal timezone', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-20T02:00:00Z')); // 9:00 PM CDT on Sep 19
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // The legacy home's LogCertificationModal went with it (WAP-195). The live
  // self-report form (CertificationAddForm on My Certificates) pins its own
  // "Date earned" max and today-acceptance in certification-add-form.spec.tsx.

  it('ParentalConsentForm caps the student date of birth at the Central date', () => {
    render(<ParentalConsentForm onSubmit={vi.fn(async () => undefined)} studentName="Fixture Student" />);
    const input = screen.getByLabelText(/Student Date of Birth/) as HTMLInputElement;
    expect(input.max).toBe('2026-09-19');
  });
});
