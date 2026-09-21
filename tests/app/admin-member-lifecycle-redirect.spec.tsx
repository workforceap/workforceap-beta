import { describe, expect, it, vi } from 'vitest';

/**
 * Admin audit gap map (wave 16 follow-up): `/admin/members/[id]/lifecycle` is
 * a redirect alias of the member record's Activity tab, so old links and
 * bookmarks land on `/admin/members/[id]?tab=activity` instead of a second
 * lifecycle page.
 */

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));

import { redirect } from 'next/navigation';
import AdminMemberLifecyclePage from '@/app/admin/members/[id]/lifecycle/page';

describe('/admin/members/[id]/lifecycle', () => {
  it('redirects to the member record Activity tab', async () => {
    await expect(AdminMemberLifecyclePage({ params: Promise.resolve({ id: 'member-1' }) }))
      .rejects.toThrow('REDIRECT:/admin/members/member-1?tab=activity');
    expect(redirect).toHaveBeenCalledWith('/admin/members/member-1?tab=activity');
  });

  it('keeps the member id URL-safe in the redirect target', async () => {
    await expect(AdminMemberLifecyclePage({ params: Promise.resolve({ id: 'a b/c' }) }))
      .rejects.toThrow('REDIRECT:/admin/members/a%20b%2Fc?tab=activity');
  });
});
