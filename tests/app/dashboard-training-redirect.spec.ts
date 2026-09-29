import { beforeEach, describe, expect, it, vi } from 'vitest';

// The page is a server component whose only job is to redirect. Mock
// `redirect` the way the other portal page specs do: throw a taggable error
// so the assertion sees the real URL the page asked Next.js to navigate to.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));

import TrainingPage from '@/app/(portal)/dashboard/training/page';
import { getUser } from '@/lib/auth/server';

const getUserMock = vi.mocked(getUser);

/** Run the page and return the URL it redirected to. */
async function redirectTargetOf(
  params?: Record<string, string | string[] | undefined>
): Promise<string> {
  try {
    await TrainingPage({ searchParams: params ? Promise.resolve(params) : undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('REDIRECT:')) return message.slice('REDIRECT:'.length);
    throw err;
  }
  throw new Error('TrainingPage did not redirect');
}

describe('/dashboard/training redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ id: 'member-1' } as Awaited<ReturnType<typeof getUser>>);
  });

  it('sends a signed-in member to My Program, not back to the dashboard', async () => {
    const target = await redirectTargetOf();
    // The do-loop: every "Resume module" / "Continue training" CTA that points
    // here used to land the member back on the page they clicked from.
    expect(target).not.toBe('/dashboard');
    expect(target.split('?')[0]).toBe('/dashboard/program');
  });

  it('carries the Coursera launch ?error= params through to My Program', async () => {
    // lib/coursera/launchRouteCore.ts redirects failed launches here with
    // ?error=curriculum_track_pending | course_not_assigned | launch_failed.
    const target = await redirectTargetOf({ error: 'curriculum_track_pending' });
    const url = new URL(target, 'https://workforceap.test');
    expect(url.pathname).toBe('/dashboard/program');
    expect(url.searchParams.get('error')).toBe('curriculum_track_pending');
  });

  it('preserves an existing ?program= tab selection', async () => {
    const target = await redirectTargetOf({ program: 'google-it-support' });
    const url = new URL(target, 'https://workforceap.test');
    expect(url.pathname).toBe('/dashboard/program');
    expect(url.searchParams.get('program')).toBe('google-it-support');
  });

  it('sends a signed-out visitor to log in and back to My Program', async () => {
    getUserMock.mockResolvedValue(null as Awaited<ReturnType<typeof getUser>>);
    const target = await redirectTargetOf();
    const url = new URL(target, 'https://workforceap.test');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('redirectTo')).toBe('/dashboard/program');
  });

  it('keeps ?program= and ?course= inside redirectTo for a signed-out visitor', async () => {
    // Pre-fix the query was appended as extra /login params, so login dropped
    // the program and course context and the member landed on the default.
    getUserMock.mockResolvedValue(null as Awaited<ReturnType<typeof getUser>>);
    const target = await redirectTargetOf({ program: 'a', course: 'x' });
    const url = new URL(target, 'https://workforceap.test');
    expect(url.pathname).toBe('/login');
    expect([...url.searchParams.keys()]).toEqual(['redirectTo']);
    const back = new URL(url.searchParams.get('redirectTo') ?? '', 'https://workforceap.test');
    expect(back.pathname).toBe('/dashboard/program');
    expect(back.searchParams.get('program')).toBe('a');
    expect(back.searchParams.get('course')).toBe('x');
  });
});
