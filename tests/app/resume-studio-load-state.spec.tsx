import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  headers: vi.fn(),
  profile: vi.fn(),
  admin: vi.fn(),
  download: vi.fn(),
  extract: vi.fn(),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.user }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { profile: { findUnique: mocks.profile } } }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: mocks.admin }));
vi.mock('@/lib/resume/extractTextFromResumeBuffer', () => ({ extractTextFromResumeBuffer: mocks.extract }));
vi.mock('@/components/portal/ToolHistoryPanel', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/VoiceStudioKit', () => ({
  VoiceStudioKit: ({ resumeStudio }: { resumeStudio: unknown }) => <output data-testid="studio-state">{JSON.stringify(resumeStudio)}</output>,
}));
vi.mock('@/components/portal/kit/pages/member/ResumeStudioKit', () => ({
  ResumeStudioKit: ({ hasResume, loadStatus }: { hasResume: boolean; loadStatus: string }) => <output data-testid="studio-state">{JSON.stringify({ hasResume, loadStatus })}</output>,
}));

import CareerStudioPage from '@/app/(portal)/dashboard/ai-tools/page';
import ResumeStudioPage from '@/app/(portal)/dashboard/ai-tools/resume-studio/page';

const USER = 'member-synthetic';
const TEXT = 'Synthetic Candidate\nExperience\nResolved 40 help desk cases per week. Documented service requests and trained colleagues on secure account recovery.';
const routes = [
  { name: 'hub', path: '/dashboard/ai-tools', page: () => CareerStudioPage({ searchParams: Promise.resolve({ tab: 'studio' }) }) },
  { name: 'dedicated Studio', path: '/dashboard/ai-tools/resume-studio', page: () => ResumeStudioPage() },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: USER });
  mocks.headers.mockResolvedValue(new Headers());
  mocks.profile.mockResolvedValue({ resumeOriginalPath: `${USER}/original.txt`, resumeEnhancedPath: null });
  mocks.admin.mockReturnValue({ storage: { from: () => ({ download: mocks.download }) } });
  mocks.download.mockResolvedValue({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null });
  mocks.extract.mockResolvedValue(TEXT);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function state() {
  return JSON.parse(screen.getByTestId('studio-state').textContent ?? '{}');
}

describe.each(routes)('$name resume load boundary', ({ path, page }) => {
  it('redirects an unauthenticated request before any resume read', async () => {
    mocks.user.mockResolvedValue(null);
    await expect(page()).rejects.toThrow(`redirect:/login?redirectTo=${path}`);
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('uses only the authenticated member identity and reports readable data', async () => {
    render(await page());
    expect(mocks.profile).toHaveBeenCalledWith({ where: { userId: USER } });
    expect(state()).toMatchObject({ hasResume: true, loadStatus: 'available' });
    expect(screen.getByTestId('studio-state')).not.toHaveTextContent(`${USER}/original.txt`);
    expect(screen.getByTestId('studio-state')).not.toHaveTextContent(TEXT);
  });

  it('reports confirmed absence without contacting storage', async () => {
    mocks.profile.mockResolvedValue({ resumeOriginalPath: null, resumeEnhancedPath: null });
    render(await page());
    expect(state()).toEqual({ hasResume: false, loadStatus: 'absent' });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(['database', 'storage', 'extraction', 'foreign reference'])(
    'reports %s failure as unavailable and exposes its existing audit error marker', async (failure) => {
      if (failure === 'database') mocks.profile.mockRejectedValue(new Error('synthetic query failure'));
      if (failure === 'storage') mocks.download.mockResolvedValue({ data: null, error: { message: 'synthetic download failure' } });
      if (failure === 'extraction') mocks.extract.mockResolvedValue('');
      if (failure === 'foreign reference') mocks.profile.mockResolvedValue({ resumeOriginalPath: 'another-member/private.pdf', resumeEnhancedPath: null });
      const { container } = render(await page());
      expect(state()).toEqual({ hasResume: false, loadStatus: 'unavailable' });
      expect(container.querySelector('[data-portal-error-state]')).toBeTruthy();
      if (failure === 'database' || failure === 'foreign reference') expect(mocks.download).not.toHaveBeenCalled();
    },
  );

  it('marks the audit as suppressed with zero metadata, storage, or extraction reads', async () => {
    mocks.headers.mockResolvedValue(new Headers({ 'x-workforceap-read-only-audit': '1' }));
    const { container } = render(await page());
    expect(state()).toEqual({ hasResume: false, loadStatus: 'audit-suppressed' });
    expect(container.querySelector('[data-portal-audit-suppressed]')).toBeTruthy();
    expect(container.querySelector('[data-portal-error-state]')).toBeNull();
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
  });
});

describe('hub loading and retry policy', () => {
  it('does not read a resume on the default Coaches tab or falsely confirm absence', async () => {
    render(await CareerStudioPage({ searchParams: Promise.resolve({}) }));
    expect(state()).toEqual({ hasResume: false, loadStatus: 'not-loaded' });
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('retains the existing transient database retry and produces the recovered score', async () => {
    mocks.profile.mockRejectedValueOnce(Object.assign(new Error('synthetic unavailable database'), { code: 'P1001' }));
    render(await CareerStudioPage({ searchParams: Promise.resolve({ tab: 'studio' }) }));
    expect(mocks.profile).toHaveBeenCalledTimes(2);
    expect(state()).toMatchObject({ hasResume: true, loadStatus: 'available', structuralScore: expect.any(Number) });
    expect(mocks.download).toHaveBeenCalledOnce();
  });
});
