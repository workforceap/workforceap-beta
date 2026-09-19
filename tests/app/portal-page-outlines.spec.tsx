import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import type { BoardOutcomes } from '@/lib/admin/boardOutcomes';

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'es', read: vi.fn(), outcomes: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'fixture-admin' }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async () => true, isCounselor: async () => true, isSuperAdmin: async () => false }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: mocks.read }, counselor: { findFirst: async () => null } } }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: async () => ({ ok: true }), withAdminPageScope: vi.fn(), inheritUserOrg: vi.fn(), inheritMemberOrg: vi.fn(), inheritLeaderOrg: vi.fn(), inheritInvitedByOrg: vi.fn() }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'fixture-org' }));
vi.mock('@/lib/admin/boardOutcomes', () => ({ getBoardOutcomes: mocks.outcomes }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: async (value: unknown) => value }));
vi.mock('next-intl/server', () => ({ getTranslations: async (namespace: 'wioa' | 'counselor') => createTranslator({ locale: mocks.locale, messages: mocks.locale === 'es' ? es : en, namespace }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('unexpected redirect'); }, usePathname: () => '/dashboard/learning/wioa-qualification' }));
vi.mock('@/components/portal/counselor/CounselorNotificationCenter', () => ({ default: () => <div>Notification body</div> }));

import CounselorNotificationsPage from '@/app/(portal)/counselor/notifications/page';
import FunderReportPrintPage from '@/app/admin/board/print/page';
import WioaQualificationPage, { generateMetadata as memberMetadata } from '@/app/(portal)/dashboard/learning/wioa-qualification/page';
import { generateMetadata as publicMetadata } from '@/app/wioa-qualification/page';

const emptyOutcomes: BoardOutcomes = {
  period: { label: 'All time', startDate: null, endDate: new Date('2026-09-19T12:00:00Z') },
  totals: { membersServed: 0, membersEnrolled: 0, membersInTraining: 0, membersCertified: 0, membersPlaced: 0, placementRate: 0, medianAnnualSalary: null, totalAnnualSalaryValue: 0, averageWeeksToPlacement: null },
  funnel: [], programs: [], placements: [],
  demographics: { veteranBreakdown: [], employmentEnteringBreakdown: [], incomeBreakdown: [], educationBreakdown: [], ethnicityBreakdown: [] },
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { vi.clearAllMocks(); mocks.locale = 'en'; mocks.outcomes.mockResolvedValue(emptyOutcomes); });

describe('rendered route heading ownership', () => {
  it('counselor notifications has a single h1 from its page opener', async () => {
    render(await CounselorNotificationsPage());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.counselor.notificationCenter);
  });

  it('print report has a page title while its outcomes view remains a subsection', async () => {
    render(await FunderReportPrintPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Funder outcomes report' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Outcomes — All time' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to dashboard/ })).toHaveAttribute('href', '/admin/board');
  });

  it.each(['en', 'es'] as const)('WIOA storage fallback and both metadata wrappers use %s copy', async (locale) => {
    mocks.locale = locale;
    mocks.read.mockRejectedValueOnce(new Error('column wioa_qualification_json does not exist'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const messages = locale === 'es' ? es : en;
    render(<NextIntlClientProvider locale={locale} messages={messages}>{await WioaQualificationPage()}</NextIntlClientProvider>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(messages.wioa.unavailableTitle);
    expect(screen.getByRole('link', { name: messages.wioa.messageCounselor })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Employer portal' })).not.toBeInTheDocument();
    expect(await memberMetadata()).toMatchObject({ title: messages.wioa.title, description: messages.wioa.memberIntro });
    expect(await publicMetadata()).toMatchObject({ title: messages.wioa.title, description: messages.wioa.publicIntro });
  });
});
