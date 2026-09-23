import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PWA start_url (app/pwa-start/page.tsx): admin wins over counselor, the
 * precedence sign-in uses (lib/auth/postLoginRedirect.ts), so an admin who
 * also holds a counselor row opens the installed app on the admin Today
 * (WAP-190). Employer and partner order is unchanged.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  getCounselorForUser: vi.fn(),
  isAdmin: vi.fn(),
  isEmployer: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { partnerUser: { findUnique: vi.fn() } } }));

import PwaStartPage from '@/app/pwa-start/page';
import { getUser } from '@/lib/auth/server';
import { getCounselorForUser, isAdmin, isEmployer } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

function roles({ counselor = false, admin = false, employer = false, partner = false }) {
  vi.mocked(getCounselorForUser).mockResolvedValue(counselor ? ({ counselorId: 'c-1' } as never) : null);
  vi.mocked(isAdmin).mockResolvedValue(admin);
  vi.mocked(isEmployer).mockResolvedValue(employer);
  vi.mocked(prisma.partnerUser.findUnique).mockResolvedValue(partner ? ({ userId: 'u-1' } as never) : null);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'u-1' } as never);
});

describe('/pwa-start', () => {
  it('sends an admin who is also a counselor to the admin Today', async () => {
    roles({ counselor: true, admin: true });
    await expect(PwaStartPage()).rejects.toThrow('REDIRECT:/admin');
  });

  it('sends a counselor who is not an admin to the counselor portal', async () => {
    roles({ counselor: true });
    await expect(PwaStartPage()).rejects.toThrow('REDIRECT:/counselor');
  });

  it('keeps counselor ahead of employer and partner, and members on the dashboard', async () => {
    roles({ counselor: true, employer: true, partner: true });
    await expect(PwaStartPage()).rejects.toThrow('REDIRECT:/counselor');
    roles({ employer: true, partner: true });
    await expect(PwaStartPage()).rejects.toThrow('REDIRECT:/employer');
    roles({ partner: true });
    await expect(PwaStartPage()).rejects.toThrow('REDIRECT:/partner');
    roles({});
    await expect(PwaStartPage()).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('sends a signed-out visitor to login and back', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(null as never);
    await expect(PwaStartPage()).rejects.toThrow('REDIRECT:/login?redirectTo=/pwa-start');
  });
});
