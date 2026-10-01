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

import CourseraIntegrationPage from '@/app/(portal)/dashboard/coursera/page';
import { getUser } from '@/lib/auth/server';

const getUserMock = vi.mocked(getUser);

/** Run the page and return the URL it redirected to. */
async function redirectTarget(): Promise<string> {
  try {
    await CourseraIntegrationPage();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('REDIRECT:')) return message.slice('REDIRECT:'.length);
    throw err;
  }
  throw new Error('CourseraIntegrationPage did not redirect');
}

describe('/dashboard/coursera redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ id: 'member-1' } as Awaited<ReturnType<typeof getUser>>);
  });

  it('sends a signed-in member to My Program, where Coursera courses open', async () => {
    expect(await redirectTarget()).toBe('/dashboard/program');
  });

  it('does not carry member-home switches such as ?ui=legacy onto My Program', async () => {
    // The stub takes no searchParams at all, so a bookmarked
    // /dashboard/coursera?ui=legacy&tab=courses&program=x cannot leak through.
    expect(CourseraIntegrationPage.length).toBe(0);
    expect(await redirectTarget()).not.toContain('?');
  });

  it('sends a signed-out visitor to log in and back to My Program', async () => {
    getUserMock.mockResolvedValue(null as Awaited<ReturnType<typeof getUser>>);
    const url = new URL(await redirectTarget(), 'https://workforceap.test');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('redirectTo')).toBe('/dashboard/program');
  });
});
