import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(),
  withAdminPageScope: vi.fn(async (_scope: unknown, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
  inheritUserOrg: vi.fn(() => ({})),
  inheritMemberOrg: vi.fn(() => ({})),
  inheritLeaderOrg: vi.fn(() => ({})),
  inheritInvitedByOrg: vi.fn(() => ({})),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    courseEnrollment: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: vi.fn(() => false) }));
vi.mock('@/components/admin/AdminProgramCatalogClient', () => ({ default: () => null }));
vi.mock('@/components/portal/kit', () => ({
  DesignSurface: ({ children }: { children: React.ReactNode }) => <div data-surface>{children}</div>,
}));
const kit = vi.hoisted(() => ({ catalog: vi.fn(() => null) }));
vi.mock('@/components/portal/kit/pages/admin-subviews/ProgramsCatalogKit', () => ({
  ProgramsCatalogKit: kit.catalog,
}));

import AdminProgramsPage from '@/app/admin/programs/page';
import { PROGRAMS } from '@/lib/content/programs';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';

const firstProgram = PROGRAMS[0];

function enrollment(userId: string, programSlug: string, assessmentScorePct: number | null) {
  return {
    programSlug,
    curriculumVersion: 'legacy-v1',
    user: { id: userId, assessmentScorePct, memberProgramProgress: [] },
  };
}

async function renderLegacy() {
  const ui = await AdminProgramsPage({ searchParams: Promise.resolve({ ui: 'legacy' }) });
  return render(ui as React.ReactElement);
}

describe('admin programs page enrollment stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: true, orgId: 'org-1', superAdmin: false });
  });

  it('renders one responsive stats tree with one card per catalog program and the three metrics each', async () => {
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([
      enrollment('u1', firstProgram.slug, 80),
      enrollment('u2', firstProgram.slug, 90),
    ] as any);

    const { container } = await renderLegacy();

    const trees = container.querySelectorAll('[data-program-stats-tree]');
    expect(trees).toHaveLength(1);
    expect(trees[0].getAttribute('data-program-stats-tree')).toBe('single-responsive-tree');

    const section = container.querySelector('section[aria-labelledby="program-enrollment-stats-heading"]');
    expect(section).not.toBeNull();
    expect(section!.querySelector('#program-enrollment-stats-heading')).not.toBeNull();
    expect(section!.contains(trees[0])).toBe(true);

    const cards = Array.from(trees[0].querySelectorAll('[data-program-stats-card]'));
    expect(cards).toHaveLength(PROGRAMS.length);
    const slugs = cards.map((card) => card.getAttribute('data-program-slug'));
    expect(new Set(slugs).size).toBe(PROGRAMS.length);
    expect(slugs.sort()).toEqual(PROGRAMS.map((program) => program.slug).sort());
    for (const card of cards) {
      for (const metric of ['enrolled', 'avg-score', 'courses-completed']) {
        expect(card.querySelectorAll(`[data-program-metric="${metric}"]`)).toHaveLength(1);
      }
    }

    // The enrolled program shows its own counts; others show zero.
    const enrolledCard = cards.find((card) => card.getAttribute('data-program-slug') === firstProgram.slug)!;
    expect(enrolledCard.querySelector('[data-program-metric="enrolled"]')!.textContent).toContain('2');
    expect(enrolledCard.querySelector('[data-program-metric="avg-score"]')!.textContent).toContain('85%');
    expect(enrolledCard.querySelector('[data-program-action="cohort-csv"]')).not.toBeNull();
    const idleCard = cards.find((card) => card.getAttribute('data-program-slug') !== firstProgram.slug)!;
    expect(idleCard.querySelector('[data-program-metric="enrolled"]')!.textContent).toContain('0');
    expect(idleCard.querySelector('[data-program-metric="avg-score"]')!.textContent).toContain('—');
  });

  it('shows the empty state instead of the tree when nobody is enrolled', async () => {
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([] as any);

    const { container } = await renderLegacy();
    expect(container.querySelector('[data-program-stats-tree]')).toBeNull();
    expect(container.querySelector('.admin-empty-state')).not.toBeNull();
  });

  it('feeds the kit catalog only the programs with learners by default', async () => {
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValue([enrollment('u1', firstProgram.slug, null)] as any);

    render((await AdminProgramsPage({})) as React.ReactElement);

    expect(kit.catalog).toHaveBeenCalledTimes(1);
    const props = (kit.catalog.mock.calls[0] as unknown[])[0] as { programs: Array<{ slug: string; enrolled: number }>; totalEnrolled: number };
    expect(props.programs.map((p) => p.slug)).toEqual([firstProgram.slug]);
    expect(props.programs[0].enrolled).toBe(1);
    expect(props.totalEnrolled).toBe(1);
  });

  it('redirects non-admins before loading enrollments', async () => {
    vi.mocked(resolveAdminPageTenant).mockResolvedValue({ ok: false });
    await expect(AdminProgramsPage({})).rejects.toThrow('REDIRECT:/dashboard');
    expect(prisma.courseEnrollment.findMany).not.toHaveBeenCalled();
  });
});
