import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import MemberApprovalStatusCard from '@/components/portal/MemberApprovalStatusCard';
import MemberFirstCertProgressBar from '@/components/portal/MemberFirstCertProgressBar';
import { buildMemberApprovalStatus } from '@/lib/member/memberApprovalStatus';
import { formatPortalDate } from '@/lib/formatDate';

function show(status: ReturnType<typeof buildMemberApprovalStatus>) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>
    <MemberApprovalStatusCard status={status} />
  </NextIntlClientProvider>);
}

const stage = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-stage="${key}"]`) as HTMLElement;

describe('truthful member status surfaces', () => {
  it('shows saved staff facts, actual portal dates and unconfirmed provider acceptance', () => {
    const submitted = new Date('2026-09-19T01:00:00Z');
    show(buildMemberApprovalStatus({ applications: [{ status: 'APPROVED', submittedAt: submitted }], wioaReviewStatus: 'verified', courseraEnrollmentApproved: true }));
    expect(screen.getByRole('heading', { name: 'Your approval status' })).toBeInTheDocument();
    expect(screen.getByText('Application approved')).toBeInTheDocument();
    expect(screen.getByText('Intake verified by staff')).toBeInTheDocument();
    expect(screen.getByText(`Submitted ${formatPortalDate(submitted)}`)).toBeInTheDocument();
    expect(screen.getByText(/invitation and acceptance are not confirmed here/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact your team' })).toHaveAttribute('href', '/dashboard/messages');
    expect(screen.queryByText(/^Approved \w/)).not.toBeInTheDocument();
    // Chain complete: no current step, and the member owns checking the invitation.
    expect(screen.queryByText('Current step')).not.toBeInTheDocument();
    expect(screen.getByText("Who's on it: You")).toBeInTheDocument();
    expect(screen.getByText(/Next: Check your email for the Coursera invitation/)).toBeInTheDocument();
  });

  it('marks the pending application as the current step, dates it, and names the staff owner', () => {
    const submitted = new Date('2026-09-10T15:00:00Z');
    const { container } = show(buildMemberApprovalStatus({
      applications: [{ status: 'PENDING', submittedAt: submitted }],
      wioaReviewStatus: null,
      courseraEnrollmentApproved: false,
    }));
    const application = stage(container, 'application');
    expect(application).toHaveAttribute('aria-current', 'step');
    expect(within(application).getByText('Current step')).toBeInTheDocument();
    expect(within(application).getByText(`Submitted ${formatPortalDate(submitted)}`)).toBeInTheDocument();
    expect(within(application).getByText("Who's on it: WorkforceAP staff")).toBeInTheDocument();
    expect(within(application).getByText(/Next: Staff review your application/)).toBeInTheDocument();

    const intake = stage(container, 'intake');
    expect(intake).not.toHaveAttribute('aria-current');
    expect(within(intake).getByText('Next: Begins after your application is approved.')).toBeInTheDocument();
    expect(within(intake).queryByText(/Who's on it/)).not.toBeInTheDocument();
    expect(within(stage(container, 'training')).getByText('Next: Begins after intake review is verified.')).toBeInTheDocument();
    expect(screen.getAllByText('Current step')).toHaveLength(1);
  });

  it('dates a staff-set intake review, names the assigned counselor, and never invents a training start', () => {
    const reviewed = new Date('2026-09-12T15:00:00Z');
    const { container } = show(buildMemberApprovalStatus({
      applications: [{ status: 'APPROVED', submittedAt: new Date('2026-09-01T15:00:00Z') }],
      wioaReviewStatus: 'in_review',
      wioaReviewedAt: reviewed,
      courseraEnrollmentApproved: false,
      counselorAssignments: [{ counselor: { user: { fullName: 'Jordan Lee' } } }],
    }));
    const intake = stage(container, 'intake');
    expect(intake).toHaveAttribute('aria-current', 'step');
    expect(within(intake).getByText(`In this step since ${formatPortalDate(reviewed)}`)).toBeInTheDocument();
    expect(within(intake).getByText("Who's on it: Your counselor, Jordan Lee")).toBeInTheDocument();
    expect(within(intake).queryByText(/^Reviewed /)).not.toBeInTheDocument();
    expect(within(stage(container, 'training')).queryByText(/In this step since/)).not.toBeInTheDocument();
  });

  it('says when a pending step has no saved start date instead of guessing one', () => {
    const { container } = show(buildMemberApprovalStatus({
      applications: [{ status: 'APPROVED', submittedAt: new Date('2026-09-01T15:00:00Z') }],
      wioaReviewStatus: 'verified',
      wioaReviewedAt: new Date('2026-09-03T15:00:00Z'),
      courseraEnrollmentApproved: false,
    }));
    const training = stage(container, 'training');
    expect(training).toHaveAttribute('aria-current', 'step');
    expect(within(training).getByText('No start date is saved for this step.')).toBeInTheDocument();
    expect(within(training).getByText("Who's on it: WorkforceAP staff")).toBeInTheDocument();
    expect(within(training).getByText(/Next: Staff approve your training enrollment/)).toBeInTheDocument();
    expect(within(stage(container, 'intake')).getByText(/^Reviewed /)).toBeInTheDocument();
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
