import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth/server';
import { getScoreBreakdownSafeResult } from '@/lib/readiness/score';
import { getMemberReadinessSections } from '@/lib/readiness/memberReadinessSections';
import { SCREENSHOT_MEMBER_BREAKDOWN } from '@/lib/readiness/progressView.fixtures';
import DashboardReadinessPage from '@/app/(portal)/dashboard/readiness/page';

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
}));

vi.mock('@/lib/readiness/score', () => ({
  getScoreBreakdownSafeResult: vi.fn(),
}));

vi.mock('@/lib/readiness/memberReadinessSections', () => ({
  getMemberReadinessSections: vi.fn(),
}));

vi.mock('@/components/portal/kit/pages/member/MemberProgressKit', () => ({
  MemberProgressKit: ({ summary }: { summary: React.ReactNode }) => <div>{summary}</div>,
}));

describe('/dashboard/readiness recap generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'member-1' } as Awaited<ReturnType<typeof getUser>>);
    vi.mocked(getScoreBreakdownSafeResult).mockResolvedValue({
      breakdown: SCREENSHOT_MEMBER_BREAKDOWN,
      loadFailed: false,
    });
    vi.mocked(getMemberReadinessSections).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the factual recap without a POST in a read-only portal audit', async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ 'x-workforceap-read-only-audit': '1' }) as Awaited<ReturnType<typeof headers>>);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    render(await DashboardReadinessPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText('From your numbers')).toBeInTheDocument();
    expect(screen.getByTestId('readiness-progress-summary-text')).toHaveTextContent('Training & Certs is your lowest area');
    expect(document.querySelector('[data-portal-audit-suppressed="member-readiness-summary-generation"]')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('still requests a generated recap for a normal member visit', async () => {
    vi.mocked(headers).mockResolvedValue(new Headers() as Awaited<ReturnType<typeof headers>>);
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ source: 'factual', summary: 'Updated recap from current scores.' }),
    });
    vi.stubGlobal('fetch', fetch);

    render(await DashboardReadinessPage({ searchParams: Promise.resolve({}) }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/member/readiness/summary',
      expect.objectContaining({ method: 'POST' }),
    ));
  });
});
