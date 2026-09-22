import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

/**
 * Legacy member dashboard (`?ui=legacy`), application-status card, follow-up
 * to #2488: the fixed "1 to 2 business days" promise is gone. While the
 * application is under review the card quotes the same measured median as
 * MemberApprovalStatusCard (memberApproval.reviewer.waitEstimate) and shows
 * nothing at all when the estimate is null (fewer than 5 approvals in 30 days).
 */

vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));
vi.mock('@/lib/events/client', () => ({ postMemberEvent: vi.fn(async () => undefined) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/dashboard' }));
vi.mock('@/components/portal/MemberPreScreeningForm', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberInterviewRequestButton', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberDoThisNextCard', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberNextStepsStrip', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberFirstValuePanel', () => ({ default: () => null }));
vi.mock('@/components/portal/MemberStuckCounselorStrip', () => ({ default: () => null }));

import DashboardHomeClient, { type DashboardApplicationStatusProps } from '@/components/portal/DashboardHomeClient';

const RETIRED_COPY = /1 to 2 business days|business days|typically respond/i;

const underReview: DashboardApplicationStatusProps = {
  label: 'Under review',
  submittedAt: '2026-09-01T12:00:00.000Z',
  programInterest: 'it-support-professional-certificate-ibm',
  nextStep: 'Staff are reviewing your application.',
  showResponseEstimate: true,
  waitEstimate: { medianDays: 40, sampleSize: 12 },
  progressIndex: 2,
  stage: 'under_review',
};

function renderLegacy(applicationStatus: DashboardApplicationStatusProps) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DashboardHomeClient
        firstName="Ada"
        state="A"
        completedCount={0}
        totalCourses={0}
        recentActivity={[]}
        checklist={{ createAccount: true, chooseProgram: false, completeAssessment: false, startFirstCourse: false, completeFirstCourse: false }}
        checklistAllDone={false}
        recommendedActions={[]}
        applicationStatus={applicationStatus}
        homeOnly
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe('legacy dashboard application card wait copy', () => {
  it('quotes the measured median approval wait while the application is under review', () => {
    const { container } = renderLegacy(underReview);
    expect(container.textContent).toContain('Under review');
    expect(container.querySelector('[data-approval-wait-estimate]')?.textContent).toBe(
      'Recent applications were approved in about 40 days (based on 12 approvals in the last 30 days).',
    );
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });

  it('renders no wait line at all when the estimate is null', () => {
    const { container } = renderLegacy({ ...underReview, waitEstimate: null });
    expect(container.textContent).toContain('Under review');
    expect(container.querySelector('[data-approval-wait-estimate]')).toBeNull();
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });

  it('renders no wait line once the application is no longer pending, even with an estimate', () => {
    const { container } = renderLegacy({ ...underReview, label: 'Approved', stage: 'accepted', showResponseEstimate: false, progressIndex: 3 });
    expect(container.querySelector('[data-approval-wait-estimate]')).toBeNull();
    expect(container.textContent).not.toMatch(RETIRED_COPY);
  });
});
