import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import MemberApprovalStatusCard from '@/components/portal/MemberApprovalStatusCard';
import MemberFirstCertProgressBar from '@/components/portal/MemberFirstCertProgressBar';
import { buildMemberApprovalStatus } from '@/lib/member/memberApprovalStatus';
import { formatPortalDate } from '@/lib/formatDate';

describe('truthful member status surfaces', () => {
  it('shows saved staff facts, actual portal dates and unconfirmed provider acceptance', () => {
    const submitted = new Date('2026-09-19T01:00:00Z');
    render(<NextIntlClientProvider locale="en" messages={messages}>
      <MemberApprovalStatusCard status={buildMemberApprovalStatus({ applications: [{ status: 'APPROVED', submittedAt: submitted }], wioaReviewStatus: 'verified', courseraEnrollmentApproved: true })} />
    </NextIntlClientProvider>);
    expect(screen.getByRole('heading', { name: 'Your approval status' })).toBeInTheDocument();
    expect(screen.getByText('Application approved')).toBeInTheDocument();
    expect(screen.getByText('Intake verified by staff')).toBeInTheDocument();
    expect(screen.getByText(`Submitted ${formatPortalDate(submitted)}`)).toBeInTheDocument();
    expect(screen.getByText(/invitation and acceptance are not confirmed here/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact your team' })).toHaveAttribute('href', '/dashboard/messages');
    expect(screen.queryByText(/^Approved \w/)).not.toBeInTheDocument();
  });

  it('labels recorded course progress without claiming a certificate', () => {
    render(<NextIntlClientProvider locale="en" messages={messages}>
      <MemberFirstCertProgressBar progress={{ percent: 50, stageLabel: 'Recorded course progress', isComplete: false, stepsComplete: 1, stepsTotal: 2 }} />
    </NextIntlClientProvider>);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('1 of 2 courses complete')).toBeInTheDocument();
    expect(screen.queryByText(/certification earned/i)).not.toBeInTheDocument();
  });
});
