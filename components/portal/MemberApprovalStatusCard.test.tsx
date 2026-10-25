import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import MemberApprovalStatusCard from './MemberApprovalStatusCard';
import { buildMemberApprovalStatus } from '@/lib/member/memberApprovalStatus';
import type { MemberCounselorContext } from '@/lib/member/counselorContext';

/**
 * Owner call 2026-09-22 (Slack ts 1790092663.833649): the card names the
 * assigned counselor and quotes a measured wait, or says plainly that nobody
 * is assigned yet. It never repeats the unmeasured "1 to 2 business days"
 * promise and never tells the member to chase staff for a status.
 */
const CATALOGS: Record<string, AbstractIntlMessages> = { en, es, fr, pt };
const RETIRED_COPY = /1 to 2 business days|Ask your team|business days/i;

const submitted = new Date('2026-09-01T12:00:00Z');
const pendingApplication = buildMemberApprovalStatus({
  applications: [{ status: 'PENDING', submittedAt: submitted }],
  wioaReviewStatus: null,
  courseraEnrollmentApproved: false,
  counselorAssignments: [{ counselor: { user: { fullName: 'Dana Whitfield' } } }],
});
const pendingUnassigned = buildMemberApprovalStatus({
  applications: [{ status: 'PENDING', submittedAt: submitted }],
  wioaReviewStatus: null,
  courseraEnrollmentApproved: false,
});

const assigned: MemberCounselorContext = {
  counselor: { name: 'Dana Whitfield', firstName: 'Dana', messagingHref: '/dashboard/messages' },
  waitEstimate: { medianDays: 40, sampleSize: 12 },
  awaiting: 'approval',
};
const unassigned: MemberCounselorContext = { counselor: null, waitEstimate: null, awaiting: 'approval' };

function renderCard(ui: React.ReactElement, locale = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={CATALOGS[locale]}>{ui}</NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe('MemberApprovalStatusCard reviewer line', () => {
  it('names the assigned counselor, links their thread and quotes the measured wait', () => {
    const { container } = renderCard(
      <MemberApprovalStatusCard status={pendingApplication} storageUserId="m1" counselorContext={assigned} />,
    );
    const reviewer = container.querySelector<HTMLElement>('[data-approval-reviewer="assigned"]');
    expect(reviewer).not.toBeNull();
    expect(reviewer!.textContent).toContain('Your counselor, Dana, will review your application.');
    const link = within(reviewer!).getByRole('link', { name: 'Message Dana' });
    expect(link.getAttribute('href')).toBe('/dashboard/messages');
    expect(container.querySelector('[data-approval-wait-estimate]')?.textContent).toBe(
      'Recent applications were approved in about 40 days (based on 12 approvals in the last 30 days).',
    );
    // The owner line under the stage uses the same first name: one person, one name form.
    expect(container.textContent).toContain("Who's on it: Your counselor, Dana");
    expect(container.textContent).not.toContain('Whitfield');
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });

  it('while the member owes information, the counselor line says the review resumes after they send it', () => {
    const needsInfo = buildMemberApprovalStatus({
      applications: [{ status: 'NEEDS_INFO', submittedAt: submitted }],
      wioaReviewStatus: null,
      courseraEnrollmentApproved: false,
      counselorAssignments: [{ counselor: { user: { fullName: 'Dana Whitfield' } } }],
    });
    const { container } = renderCard(
      <MemberApprovalStatusCard
        status={needsInfo}
        storageUserId="m1"
        counselorContext={{ ...assigned, awaiting: 'info', waitEstimate: null }}
      />,
    );
    expect(container.textContent).toContain(
      'Your counselor, Dana, will continue the review once you send the information requested.',
    );
    expect(container.textContent).not.toContain('will review your application');
    expect(container.querySelector('[data-approval-wait-estimate]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Message Dana' })).toBeTruthy();
  });

  it('says a counselor is not assigned yet and shows no timing when the estimate is suppressed', () => {
    const { container } = renderCard(
      <MemberApprovalStatusCard status={pendingUnassigned} storageUserId="m1" counselorContext={unassigned} />,
    );
    const reviewer = container.querySelector<HTMLElement>('[data-approval-reviewer="unassigned"]');
    expect(reviewer!.textContent).toBe("A counselor will be assigned to you; you'll see their name here.");
    expect(container.querySelector('[data-approval-wait-estimate]')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Message / })).toBeNull();
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });

  it('names the counselor on the intake step once the application is approved', () => {
    const intake = buildMemberApprovalStatus({
      applications: [{ status: 'APPROVED', submittedAt: submitted }],
      wioaReviewStatus: 'pending',
      courseraEnrollmentApproved: false,
      counselorAssignments: [{ counselor: { user: { fullName: 'Dana Whitfield' } } }],
    });
    const { container } = renderCard(
      <MemberApprovalStatusCard
        status={intake}
        storageUserId="m1"
        counselorContext={{ ...assigned, awaiting: 'intake', waitEstimate: null }}
      />,
    );
    expect(container.textContent).toContain('Your counselor, Dana, will complete your intake review.');
    expect(container.querySelector('[data-approval-wait-estimate]')).toBeNull();
  });

  it('renders no reviewer block without context or once nothing is pending', () => {
    const { container: bare } = renderCard(<MemberApprovalStatusCard status={pendingApplication} storageUserId="m1" />);
    expect(bare.querySelector('[data-approval-reviewer]')).toBeNull();
    const { container: done } = renderCard(
      <MemberApprovalStatusCard
        status={pendingApplication}
        storageUserId="m1"
        counselorContext={{ counselor: null, waitEstimate: null, awaiting: null }}
      />,
    );
    expect(done.querySelector('[data-approval-reviewer]')).toBeNull();
  });

  it('an unrecorded intake status is stated as a fact, not as an errand for the member', () => {
    const unrecorded = buildMemberApprovalStatus({
      applications: [{ status: 'APPROVED', submittedAt: submitted }],
      wioaReviewStatus: null,
      courseraEnrollmentApproved: false,
    });
    const { container } = renderCard(<MemberApprovalStatusCard status={unrecorded} storageUserId="m1" />);
    const intakeStage = container.querySelector<HTMLElement>('[data-stage="intake"]');
    expect(intakeStage!.textContent).toContain('No intake review is recorded yet. Staff update this step when the review begins.');
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });

  it.each(['es', 'fr', 'pt'])('%s: the reviewer and wait lines resolve to translated copy (no raw keys)', (locale) => {
    const { container } = renderCard(
      <MemberApprovalStatusCard status={pendingApplication} storageUserId="m1" counselorContext={assigned} />,
      locale,
    );
    const reviewer = container.querySelector<HTMLElement>('[data-approval-reviewer="assigned"]');
    expect(reviewer!.textContent).toContain('Dana');
    expect(reviewer!.textContent).not.toMatch(/reviewer\.|memberApproval\./);
    expect(container.querySelector('[data-approval-wait-estimate]')!.textContent).toMatch(/40/);
    expect(container.querySelector('[data-approval-wait-estimate]')!.textContent).toMatch(/12/);
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });
});

/**
 * Round 3: the header strip shows the real state and hides the empty steps.
 * "Application / Submitted Sep 10, under review" plus only the next step by
 * name, not two "Not started" cells; a finished pathway is one cell; a closed
 * one stops at the step that closed it.
 */
describe('MemberApprovalStatusCard header strip', () => {
  const steps = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('[data-approval-strip] [data-strip-step]'));
  const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, ' ').trim();

  it('live application: the dated step, then only the next step by name', () => {
    const live = buildMemberApprovalStatus({
      applications: [{ status: 'PENDING', submittedAt: new Date('2026-09-10T15:00:00Z') }],
      wioaReviewStatus: null,
      courseraEnrollmentApproved: false,
    });
    const { container } = renderCard(<MemberApprovalStatusCard status={live} storageUserId="m1" />);
    const cells = steps(container);
    expect(cells.map((c) => c.getAttribute('data-strip-step'))).toEqual(['application', 'next']);
    expect(text(cells[0]!)).toContain('Application');
    expect(text(cells[0]!)).toContain('Submitted Sep 10, under review');
    expect(text(cells[1]!)).toBe('2Next: intake review');
    expect(cells[0]!.getAttribute('aria-current')).toBe('step');
    expect(container.querySelector('[data-approval-strip]')!.textContent).not.toMatch(/Not started/);
    expect(container.querySelector('[data-approval-chip]')?.textContent).toBe('Pending review');
  });

  it('application approved, intake pending: done step, dated current step, then training as next', () => {
    const intake = buildMemberApprovalStatus({
      applications: [{ status: 'APPROVED', submittedAt: new Date('2026-08-14T15:00:00Z') }],
      wioaReviewStatus: 'pending',
      wioaReviewedAt: new Date('2026-08-28T15:00:00Z'),
      courseraEnrollmentApproved: false,
    });
    const { container } = renderCard(<MemberApprovalStatusCard status={intake} storageUserId="m1" />);
    const cells = steps(container);
    expect(cells.map((c) => c.getAttribute('data-strip-step'))).toEqual(['application', 'intake', 'next']);
    expect(text(cells[0]!)).toContain('Submitted Aug 14, approved');
    expect(text(cells[1]!)).toContain('Review pending since Aug 28');
    expect(text(cells[2]!)).toContain('Next: training approval');
  });

  it('complete: one cell reading "Cleared to train" with the saved approval date, and no state chip', () => {
    const done = buildMemberApprovalStatus({
      applications: [{ status: 'APPROVED', submittedAt: new Date('2026-08-14T15:00:00Z') }],
      wioaReviewStatus: 'verified',
      wioaReviewedAt: new Date('2026-08-28T15:00:00Z'),
      courseraEnrollmentApproved: true,
      courseraEnrollmentApprovedAt: new Date('2026-09-02T15:00:00Z'),
    });
    const { container } = renderCard(<MemberApprovalStatusCard status={done} storageUserId="m1" placement="demoted" />);
    const cells = steps(container);
    expect(cells).toHaveLength(1);
    expect(text(cells[0]!)).toBe('Cleared to trainApproved Sep 2');
    expect(container.querySelector('[data-approval-chip]')).toBeNull();
  });

  it('complete without a saved approval date says "Approved" and invents no date', () => {
    const done = buildMemberApprovalStatus({
      applications: [{ status: 'APPROVED', submittedAt: submitted }],
      wioaReviewStatus: 'verified',
      courseraEnrollmentApproved: true,
    });
    const { container } = renderCard(<MemberApprovalStatusCard status={done} storageUserId="m1" placement="demoted" />);
    expect(text(steps(container)[0]!)).toBe('Cleared to trainApproved');
  });

  it('closed pathway: stops at the step that closed it, with the "Pathway closed" chip and no next step', () => {
    const closed = buildMemberApprovalStatus({
      applications: [{ status: 'DENIED', submittedAt: new Date('2026-08-14T15:00:00Z') }],
      wioaReviewStatus: null,
      courseraEnrollmentApproved: false,
    });
    const { container } = renderCard(<MemberApprovalStatusCard status={closed} storageUserId="m1" placement="demoted" />);
    expect(steps(container).map((c) => c.getAttribute('data-strip-step'))).toEqual(['application']);
    expect(text(steps(container)[0]!)).toContain('Closed');
    expect(container.querySelector('[data-approval-chip]')?.textContent).toBe('Pathway closed');
  });

  it('needs your input: the crimson chip and the dated line say so', () => {
    const needs = buildMemberApprovalStatus({
      applications: [{ status: 'NEEDS_INFO', submittedAt: new Date('2026-09-10T15:00:00Z') }],
      wioaReviewStatus: null,
      courseraEnrollmentApproved: false,
    });
    const { container } = renderCard(<MemberApprovalStatusCard status={needs} storageUserId="m1" />);
    expect(text(steps(container)[0]!)).toContain('Submitted Sep 10, needs your input');
    expect(container.querySelector('[data-approval-chip]')?.textContent).toBe('Needs your input');
  });

  it.each(['es', 'fr', 'pt'])('%s: the strip lines resolve to translated copy (no raw keys)', (locale) => {
    const { container } = renderCard(<MemberApprovalStatusCard status={pendingApplication} storageUserId="m1" />, locale);
    const strip = container.querySelector('[data-approval-strip]')!.textContent ?? '';
    expect(strip).not.toMatch(/strip\.|memberApproval\./);
    expect(steps(container)).toHaveLength(2);
    expect(strip).toMatch(/\d/); // the saved date
  });
});
