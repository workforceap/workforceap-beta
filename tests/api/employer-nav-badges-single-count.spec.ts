import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WAP-211: each waiting item lights exactly one employer rail row.
 *  - A pending job badges Jobs (`jobs_pending`) and no longer also inflates
 *    Work queue's "review today" (which the bell labels "Candidates to review today").
 *  - A pending application badges Work queue only; Applicants carries no badge.
 */
const db = vi.hoisted(() => ({
  appFindMany: vi.fn(),
  jobFindMany: vi.fn(),
  jobCount: vi.fn(),
  appCount: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    jobPostingApplication: { findMany: db.appFindMany, count: db.appCount },
    job: { findMany: db.jobFindMany, count: db.jobCount },
    employer: { findUnique: vi.fn(async () => ({ userId: 'employer-user-1' })) },
    messageThread: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(async () => false),
  getEmployerForUser: vi.fn(async () => ({ employerId: 'emp-1' })),
  getCounselorForUser: vi.fn(async () => null),
  getPartnerForUser: vi.fn(async () => null),
}));

import { countEmployerQueueBadges } from '@/lib/employer/workQueue';
import { getNavBadgeCountsForUser } from '@/lib/portal/navBadges';
import { EMPLOYER_PORTAL_NAV_ITEMS, badgeTotalForItem } from '@/lib/nav/portalNav';

const now = Date.now();
const app = (id: string, hoursAgo: number, status = 'pending') => ({
  id,
  status,
  appliedAt: new Date(now - hoursAgo * 3_600_000),
  statusUpdatedAt: null,
  job: { id: 'job-1', title: 'Role' },
  student: { id: `s-${id}`, fullName: 'Candidate', email: 'c@example.test' },
});

/** One pending application from just now; one job awaiting publish. */
function oneOfEach() {
  db.appFindMany.mockImplementation(async ({ where }: { where: { status: unknown; appliedAt?: unknown } }) => {
    if (where.status === 'pending' && where.appliedAt) return [app('a-today', 0)]; // review today
    if (where.status === 'interview') return [];
    return [app('a-today', 0)]; // stale scan: filtered out (< 48h)
  });
  db.jobFindMany.mockResolvedValue([{ id: 'job-2', title: 'Draft role', status: 'pending', updatedAt: new Date() }]);
  db.jobCount.mockImplementation(async ({ where }: { where: { status: unknown } }) =>
    where.status === 'draft' ? 0 : 1,
  );
  db.appCount.mockResolvedValue(1);
}

const row = (href: string) => {
  const item = EMPLOYER_PORTAL_NAV_ITEMS.find((entry) => entry.href === href);
  if (!item) throw new Error(`missing employer rail row ${href}`);
  return item;
};

describe('employer rail badges count each item once (WAP-211)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    oneOfEach();
  });

  it('review today counts applications, not jobs awaiting publish', async () => {
    const counts = await countEmployerQueueBadges('emp-1');
    expect(counts).toEqual({
      employer_queue_review_today: 1,
      employer_queue_stale_48h: 0,
      employer_queue_interview: 0,
    });
  });

  it('one application lights Work queue only; one pending job lights Jobs only', async () => {
    const counts = await getNavBadgeCountsForUser('employer', 'employer-user-1');
    const lit = EMPLOYER_PORTAL_NAV_ITEMS.filter((item) => badgeTotalForItem(counts, item) > 0).map((item) => [
      item.href,
      badgeTotalForItem(counts, item),
    ]);
    expect(lit).toEqual([
      ['/employer/work-queue', 1],
      ['/employer/jobs', 1],
    ]);
    expect(badgeTotalForItem(counts, row('/employer/applications'))).toBe(0);
  });

  it('still serves applications_new for the notification bell, and no unused jobs_live', async () => {
    const counts = await getNavBadgeCountsForUser('employer', 'employer-user-1');
    expect(counts.applications_new).toBe(1);
    expect('jobs_live' in counts).toBe(false);
  });
});
