import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import MemberApprovalStatusCard from '@/components/portal/MemberApprovalStatusCard';
import MemberFirstCertProgressBar from '@/components/portal/MemberFirstCertProgressBar';
import { buildMemberApprovalStatus } from '@/lib/member/memberApprovalStatus';
import { formatPortalDate } from '@/lib/formatDate';
import { pickPortalClientMessages } from '@/lib/i18n/pickRootClientMessages';
import es from '@/messages/es.json';

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

  // Regression: /dashboard showed "MEMBERAPPROVAL.TITLE", "memberApproval.intro",
  // "memberApproval.applicationStatus.unknown" and "memberApproval.contact" because the
  // portal layout's client payload (pickPortalClientMessages) omitted the namespace.
  it.each([['en', messages], ['es', es]] as const)('renders from the sliced %s portal payload without leaking memberApproval.* keys', (locale, catalog) => {
    const text = catalog.memberApproval;
    const view = render(<NextIntlClientProvider locale={locale} messages={pickPortalClientMessages(catalog)}>
      <MemberApprovalStatusCard status={buildMemberApprovalStatus({ applications: [], wioaReviewStatus: null })} />
    </NextIntlClientProvider>);
    expect(screen.getByRole('heading', { name: text.title })).toBeInTheDocument();
    expect(screen.getByText(text.intro)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: text.contact })).toBeInTheDocument();
    expect(view.container.textContent).not.toMatch(/memberApproval\./i);
    view.unmount();
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
