import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';

/**
 * /dashboard/job-applications renders inside the warm DesignSurface with the
 * i18n PageHeader title and kit tokens only. Formerly asserted by reading the
 * page source in the retired lib/member/jobApplicationsEmptyState.test.ts
 * (its copy rules now live in tests/lib/empty-copy.spec.ts).
 */
const mocks = vi.hoisted(() => ({ tracker: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/dynamic', () => ({
  default: () => (props: { userId: string }) => {
    mocks.tracker(props);
    return <div>Tracker fixture</div>;
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: 'dashboard') => createTranslator({ locale: 'en', messages: en, namespace }),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async (input: unknown) => input) }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));

import JobApplicationsPage, { generateMetadata } from '@/app/(portal)/dashboard/job-applications/page';
import { getUser } from '@/lib/auth/server';

describe('/dashboard/job-applications page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as never);
  });

  it('renders the i18n PageHeader inside the warm kit surface and mounts the tracker for the member', async () => {
    const { container } = render(await JobApplicationsPage());

    expect(container.querySelector('[data-surface="warm"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.dashboard.jobApplicationsMetaTitle);
    expect(screen.getByText(en.dashboard.jobApplicationsSubtitle)).toBeInTheDocument();
    expect(mocks.tracker).toHaveBeenCalledWith({ userId: 'user-1' });
    // Kit tokens only: the page styles with --wa-* and never the legacy MD3 --color-on-surface.
    expect(container.innerHTML).toMatch(/--wa-/);
    expect(container.innerHTML).not.toMatch(/--color-on-surface/);
  });

  it('uses the i18n title for the document metadata', async () => {
    const meta = (await generateMetadata()) as { title: string; path: string };
    expect(meta.title).toBe(en.dashboard.jobApplicationsMetaTitle);
    expect(meta.path).toBe('/dashboard/job-applications');
  });

  it('redirects signed-out visitors to login', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    await expect(JobApplicationsPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard/job-applications');
  });
});
