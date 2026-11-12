import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AssessmentForm from './AssessmentForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const baseProps = {
  defaultFirstName: 'Ada',
  defaultLastName: 'Member',
  defaultPhone: '512-555-0100',
};

describe('AssessmentForm completion delivery status', () => {
  it('distinguishes saved results from an unconfirmed staff email', () => {
    render(
      <AssessmentForm
        {...baseProps}
        previewOutcome={{
          message: 'Your assessment is complete.',
          pct: 88,
          staffNotificationSent: false,
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'WAPAT complete' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(/results were saved/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/email delivery could not be confirmed/i);
  });

  it('confirms staff notification only when the API reported delivery', () => {
    render(
      <AssessmentForm
        {...baseProps}
        previewOutcome={{
          message: 'Your assessment is complete.',
          pct: 88,
          staffNotificationSent: true,
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/team was notified/i);
  });
});
