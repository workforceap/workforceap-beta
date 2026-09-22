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
      'Recent applications were reviewed in about 40 days (based on 12 decisions in the last 30 days).',
    );
    expect(container.textContent).not.toMatch(RETIRED_COPY);
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
