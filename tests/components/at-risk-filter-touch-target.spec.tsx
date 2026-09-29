import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { pickClientMessageSlice } from '@/lib/i18n/pickRootClientMessages';
import AtRiskDashboard from '@/components/portal/counselor/AtRiskDashboard';
import type { AtRiskMember } from '@/lib/member/atRiskRow';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/portal/counselor/AtRiskDetailModal', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalInlineSpinner', () => ({ PortalInlineSpinner: () => <span aria-hidden="true" /> }));

// WAP-271: phone QA measured the severity/status filter pills at 40px tall.
const member: AtRiskMember = {
  userId: 'a', alertId: 'alert-a', name: 'Member a', email: 'a@example.invalid', phone: null,
  score: 75, riskLevel: 'CRITICAL', status: 'open', factors: [], enrolledProgram: null,
  enrolledAt: null, memberSince: '2026-01-01T00:00:00Z', profile: null,
  alertCreatedAt: '2026-09-01T00:00:00Z', alertUpdatedAt: '2026-09-01T00:00:00Z', lastActivityAt: null,
};

afterEach(cleanup);

describe('at-risk filter pills', () => {
  it('are at least 44px tall', () => {
    render(
      <NextIntlClientProvider locale="en" messages={pickClientMessageSlice(en, 'portal')}>
        <AtRiskDashboard initialMembers={[member]} />
      </NextIntlClientProvider>,
    );
    const pills = screen.getAllByRole('button', { name: / · \d+$/ });
    expect(pills.length).toBeGreaterThan(1);
    for (const pill of pills) expect(parseFloat(pill.style.minHeight)).toBeGreaterThanOrEqual(44);
  });
});
