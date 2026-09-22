import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import MemberApprovalStatusCard from '@/components/portal/MemberApprovalStatusCard';
import MemberFirstCertProgressBar from '@/components/portal/MemberFirstCertProgressBar';
import { buildMemberApprovalStatus } from '@/lib/member/memberApprovalStatus';
import {
  approvalDismissStorageKey,
  approvalStatusSignature,
  memberApprovalCardPlacement,
} from '@/lib/member/memberApprovalCardPlacement';
import { formatPortalDate } from '@/lib/formatDate';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

const MEMBER_ID = 'member-1';

function show(
  status: ReturnType<typeof buildMemberApprovalStatus>,
  placement: 'primary' | 'demoted' = 'primary',
) {
  return render(<NextIntlClientProvider locale="en" messages={messages}>
    <MemberApprovalStatusCard status={status} storageUserId={MEMBER_ID} placement={placement} />
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
    expect(within(intake).getByText("Who's on it: Your counselor, Jordan")).toBeInTheDocument();
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

  // Regression: /dashboard showed "MEMBERAPPROVAL.TITLE", "memberApproval.intro",
  // "memberApproval.applicationStatus.unknown" and "memberApproval.contact" because the
  // portal layout's client payload (pickPortalClientMessages) omitted the namespace.
  // The application / intake words now come from the shared `status` vocabulary
  // (`status.application.member.*`, `status.intake.member.*`), which the same
  // payload has to carry, in every shipped locale.
  it.each([['en', messages], ['es', es], ['fr', fr], ['pt', pt]] as const)('renders from the sliced %s portal payload without leaking memberApproval.* or status.* keys', (locale, catalog) => {
    const text = catalog.memberApproval;
    const { container } = render(<NextIntlClientProvider locale={locale} messages={pickPortalClientMessages(catalog)}>
      <MemberApprovalStatusCard
        status={buildMemberApprovalStatus({ applications: [], wioaReviewStatus: null })}
        storageUserId={MEMBER_ID}
      />
    </NextIntlClientProvider>);
    expect(screen.getByRole('heading', { name: text.title })).toBeInTheDocument();
    expect(screen.getByText(text.intro)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: text.contact })).toBeInTheDocument();
    expect(within(stage(container, 'application')).getByText(catalog.status.application.member.not_submitted)).toBeInTheDocument();
    expect(within(stage(container, 'intake')).getByText(catalog.status.intake.member.unknown)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/memberApproval\./i);
    expect(container.textContent).not.toMatch(/status\.(application|intake)\./i);
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

// Presentation follow-up: the card fills the first screen of /dashboard even
// when the pathway is closed and there is nothing for the member to do.
describe('approval card placement and dismissal', () => {
  const closed = buildMemberApprovalStatus({
    applications: [{ status: 'DENIED', submittedAt: new Date('2026-09-01T12:00:00Z') }],
    wioaReviewStatus: 'verified',
    wioaReviewedAt: new Date('2026-09-03T12:00:00Z'),
    courseraEnrollmentApproved: true,
    courseraEnrollmentApprovedAt: new Date('2026-09-05T12:00:00Z'),
  });
  const live = buildMemberApprovalStatus({
    applications: [{ status: 'PENDING', submittedAt: new Date('2026-09-01T12:00:00Z') }],
    wioaReviewStatus: null,
    courseraEnrollmentApproved: false,
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('collapses a closed pathway to one summary line and keeps the steps reachable', () => {
    expect(memberApprovalCardPlacement(closed)).toBe('demoted');
    const { container } = show(closed, 'demoted');
    expect(container.querySelector('[data-approval-card]')).toHaveAttribute('data-approval-card', 'demoted');
    expect(screen.getByRole('heading', { name: messages.memberApproval.title })).toBeInTheDocument();
    expect(container.querySelector('[data-approval-summary]')?.textContent)
      .toBe(messages.status.application.member.denied);
    // Collapsed, not gone: the three saved steps sit inside the disclosure.
    const disclosure = container.querySelector('details') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(within(stage(container, 'application')).getByText(messages.status.application.member.denied)).toBeInTheDocument();
    expect(within(stage(container, 'training')).getByText(messages.memberApproval.trainingStatus.approved)).toBeInTheDocument();
    expect(disclosure.contains(stage(container, 'application'))).toBe(true);
  });

  // The demote must not hide what the member still has to do: two of the three
  // demoted shapes leave the next move with the member.
  it('names the member-owned next step on the collapsed line', () => {
    const { container: closedLine } = show(closed, 'demoted');
    expect(closedLine.querySelector('[data-approval-summary]')?.textContent)
      .toBe(messages.status.application.member.denied);
    expect(closedLine.querySelector('[data-approval-summary-action]')?.textContent)
      .toBe(`Next: ${messages.memberApproval.next.application.denied}`);
    // Visible without expanding the disclosure.
    expect((closedLine.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    expect(closedLine.querySelector('summary')?.textContent)
      .toContain(messages.memberApproval.next.application.denied);

    const allApproved = buildMemberApprovalStatus({
      applications: [{ status: 'APPROVED', submittedAt: new Date('2026-09-01T12:00:00Z') }],
      wioaReviewStatus: 'verified',
      wioaReviewedAt: new Date('2026-09-03T12:00:00Z'),
      courseraEnrollmentApproved: true,
      courseraEnrollmentApprovedAt: new Date('2026-09-05T12:00:00Z'),
    });
    expect(memberApprovalCardPlacement(allApproved)).toBe('demoted');
    const { container: doneLine } = show(allApproved, 'demoted');
    // The status half does not claim the member is finished…
    expect(doneLine.querySelector('[data-approval-summary]')?.textContent)
      .toBe(messages.memberApproval.summaryAllApproved);
    expect(messages.memberApproval.summaryAllApproved).toMatch(/not confirmed here/i);
    // …and the outstanding invitation step is on the line.
    expect(doneLine.querySelector('[data-approval-summary-action]')?.textContent)
      .toBe(`Next: ${messages.memberApproval.next.training.approved}`);
  });

  it('adds no action line when a demoted step is owned by staff', () => {
    const notEligible = buildMemberApprovalStatus({
      applications: [{ status: 'APPROVED', submittedAt: new Date('2026-09-01T12:00:00Z') }],
      wioaReviewStatus: 'not_eligible',
      wioaReviewedAt: new Date('2026-09-03T12:00:00Z'),
      courseraEnrollmentApproved: false,
    });
    expect(memberApprovalCardPlacement(notEligible)).toBe('demoted');
    const { container } = show(notEligible, 'demoted');
    expect(container.querySelector('[data-approval-summary]')?.textContent)
      .toBe(messages.status.intake.member.not_eligible);
    expect(container.querySelector('[data-approval-summary-action]')).toBeNull();
  });

  it('leaves an actionable card at full prominence', () => {
    expect(memberApprovalCardPlacement(live)).toBe('primary');
    const { container } = show(live, 'primary');
    expect(container.querySelector('[data-approval-card]')).toHaveAttribute('data-approval-card', 'primary');
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByText('Current step')).toBeInTheDocument();
  });

  it('persists a dismissal against the member and the status it was dismissed at', async () => {
    const user = userEvent.setup();
    const key = approvalDismissStorageKey(MEMBER_ID);
    const view = show(closed, 'demoted');

    await user.click(screen.getByRole('button', { name: messages.memberApproval.dismissLabel }));
    expect(window.localStorage.getItem(key)).toBe(approvalStatusSignature(closed));
    expect(screen.queryByRole('heading', { name: messages.memberApproval.title })).not.toBeInTheDocument();
    // Still reachable: a quiet link puts the member's own status back.
    expect(screen.getByRole('button', { name: messages.memberApproval.restore })).toBeInTheDocument();
    view.unmount();

    // Same member, same status, new page load: it stays dismissed.
    const reload = show(closed, 'demoted');
    expect(reload.container.querySelector('[data-approval-card]'))
      .toHaveAttribute('data-approval-card', 'dismissed');
    expect(screen.queryByRole('heading', { name: messages.memberApproval.title })).not.toBeInTheDocument();
    reload.unmount();

    // Another member on the same device is unaffected.
    const other = render(<NextIntlClientProvider locale="en" messages={messages}>
      <MemberApprovalStatusCard status={closed} storageUserId="member-2" placement="demoted" />
    </NextIntlClientProvider>);
    expect(screen.getByRole('heading', { name: messages.memberApproval.title })).toBeInTheDocument();
    other.unmount();

    // The status moves: the dismissal no longer matches, so the card returns.
    const moved = show(live, 'primary');
    expect(window.localStorage.getItem(key)).toBe(approvalStatusSignature(closed));
    expect(screen.getByRole('heading', { name: messages.memberApproval.title })).toBeInTheDocument();
    moved.unmount();
  });

  it('restores the card and clears the stored dismissal', async () => {
    const user = userEvent.setup();
    const key = approvalDismissStorageKey(MEMBER_ID);
    window.localStorage.setItem(key, approvalStatusSignature(closed));
    show(closed, 'demoted');

    await user.click(screen.getByRole('button', { name: messages.memberApproval.restore }));
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(screen.getByRole('heading', { name: messages.memberApproval.title })).toBeInTheDocument();
  });
});
