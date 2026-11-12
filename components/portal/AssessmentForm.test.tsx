import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AssessmentForm from './AssessmentForm';
import { assessmentConfirmMessage } from '@/lib/member/assessmentConfirmMessage';
import { computeWapat } from '@/lib/assessment/wapat';

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

describe('AssessmentForm readiness wording vs WAPAT score', () => {
  it('headline shows the WAPAT total (74.3%) and the readiness line names the legacy 69% points score', () => {
    const rows = Array.from({ length: 35 }, (_, i) => ({ id: i + 1, answer: 'A', correct: i < 26 }));
    render(
      <AssessmentForm
        {...baseProps}
        previewOutcome={{ pct: 69, message: assessmentConfirmMessage(69), wapat: computeWapat(rows) }}
      />,
    );
    expect(screen.getByTestId('wapat-total')).toHaveTextContent('74.3%');
    const copy = screen.getByText(/points score of 69%/);
    expect(copy).toHaveTextContent('legacy, weighted; not the WAPAT total');
    expect(copy).not.toHaveTextContent('74.3');
  });
});
