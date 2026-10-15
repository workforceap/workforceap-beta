import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesWhere } from '../helpers/prismaWhereMatches';

const fixture = vi.hoisted(() => ({ rows: [] as Array<Record<string, any>>, superAdmin: false, fail: false }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: async () => ({}) }));
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/lib/admin/applicantTriageLoad', () => ({ loadApplicantTriageByUserIds: async () => new Map() }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-1', superAdmin: fixture.superAdmin }),
  withAdminPageScope: async (_scope: unknown, callback: (db: unknown) => unknown) => callback({ user: {
    findMany: async (args: any) => {
      if (fixture.fail) throw new Error('Fixture database unavailable');
      return fixture.rows.filter((row) => matchesPopulation(row, args.where)).slice(0, args.take);
    },
    count: async (args: any) => fixture.rows.filter((row) => matchesPopulation(row, args.where)).length,
    groupBy: async (args: any) => {
      const groups = new Map<string | null, number>();
      for (const row of fixture.rows.filter((candidate) => matchesPopulation(candidate, args.where))) {
        groups.set(row.wioaReviewStatus, (groups.get(row.wioaReviewStatus) ?? 0) + 1);
      }
      return [...groups].map(([wioaReviewStatus, count]) => ({ wioaReviewStatus, _count: { _all: count } }));
    },
  } }),
}));
vi.mock('@/components/portal/kit/pages/admin-subviews/WioaScreeningKit', () => ({
  WioaScreeningKit: ({ rows, total, verified, pendingReview, needDocs, notEligible, filterBar }: any) => (
    <main data-total={total} data-verified={verified} data-pending={pendingReview} data-needs-info={needDocs} data-not-eligible={notEligible}>
      {filterBar}
      {rows.map((row: any) => <article key={row.id} data-member={row.id} data-status={row.reviewStatus} data-wait={row.daysWaiting}>
        {row.name} · {row.source} · {row.category}
      </article>)}
    </main>
  ),
}));

import AdminWioaScreeningQueuePage from '@/app/admin/wioa-screening/page';

/** Extend the shared behavioral Prisma fixture matcher with JSON-path presence. */
function matchesPopulation(row: any, where: any): boolean {
  const { OR, AND, wioaQualificationJson, ...rest } = where;
  if (!matchesWhere(row, rest)) return false;
  if (AND && !(Array.isArray(AND) ? AND : [AND]).every((branch: unknown) => matchesPopulation(row, branch))) return false;
  if (OR && !OR.some((branch: unknown) => matchesPopulation(row, branch))) return false;
  if (wioaQualificationJson?.path) {
    const value = wioaQualificationJson.path.reduce((current: any, key: string) => current?.[key], row.wioaQualificationJson);
    if (value === undefined || value === null) return false;
    if ('equals' in wioaQualificationJson && value !== wioaQualificationJson.equals) return false;
  }
  return true;
}

const NOW = new Date('2026-10-15T12:00:00Z');
const snapshot = {
  version: 2, submittedAt: '2026-10-01T12:00:00Z', signal: 'review', reasons: [],
  answers: { ageBracket: 'under18', countyOrZip: '78701', primaryBarrier: 'none', dislocatedWorker: false,
    lowIncomeSelfReport: false, trainingInterest: true, completedIntakeSelfReport: false },
};
function apply(organizationId = 'org-1') {
  return {
    id: 'apply-screening', organizationId, createdAt: new Date('2026-09-01T12:00:00Z'),
    q1: null, q2: null, q3: null, qualifies: true, yesCount: 0,
    receivingUnemployment: 'yes', exhaustedUnemployment: null, layoffCompany: null,
    snapWic: 'yes', publicAssistancePrograms: ['wic'], publicAssistanceHelpRequested: 'yes',
  };
}
function member(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, fullName: `Member ${id}`, email: `${id}@mail.invalid`, organizationId: 'org-1', deletedAt: null,
    profile: { role: 'member' }, userRoles: [], wioaQualificationJson: null, applyEligibilityScreenings: [],
    wioaReviewStatus: 'pending', wioaReviewedAt: null, updatedAt: NOW, wioaReviewer: null,
    ...overrides,
  };
}
async function page(params: Record<string, string> = {}) {
  const html = renderToStaticMarkup(await AdminWioaScreeningQueuePage({ searchParams: Promise.resolve(params) }));
  const doc = document.implementation.createHTMLDocument('WIOA queue');
  doc.body.innerHTML = html;
  return doc;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  fixture.superAdmin = false; fixture.fail = false;
  fixture.rows = [
    member('portal', { wioaQualificationJson: snapshot }),
    member('apply', { applyEligibilityScreenings: [apply()] }),
    member('both', { wioaQualificationJson: snapshot, applyEligibilityScreenings: [apply()], wioaReviewStatus: 'verified' }),
    member('partial', { applyEligibilityScreenings: [apply()], wioaReviewStatus: 'needs_info' }),
    member('foreign', { organizationId: 'org-2', applyEligibilityScreenings: [apply('org-2')] }),
    member('wrong-screening-org', { applyEligibilityScreenings: [apply('org-2')] }),
    member('fixture', { email: 'member-test@workforceap.org', applyEligibilityScreenings: [apply()] }),
    member('staff', { profile: { role: 'counselor' }, userRoles: [{ role: { name: 'member' } }], applyEligibilityScreenings: [apply()] }),
    member('deleted', { deletedAt: NOW, applyEligibilityScreenings: [apply()] }),
    member('metadata-only', { wioaQualificationJson: { eligibilityForm: { county: 'Travis' } } }),
    member('none'),
  ];
});
afterEach(() => vi.useRealTimers());

describe('admin WIOA source-aware queue', () => {
  it('includes partial apply screenings once, keeps actual statuses and timestamps, and counts the same member population', async () => {
    const doc = await page();
    const rows = [...doc.querySelectorAll('[data-member]')];
    expect(rows.map((row) => row.getAttribute('data-member'))).toEqual(['apply', 'portal', 'both', 'partial']);
    expect(doc.querySelector('[data-member="apply"]')?.textContent).toContain('Application screening · Not recorded');
    expect(doc.querySelector('[data-member="apply"]')?.getAttribute('data-wait')).toBe('44');
    expect(doc.querySelector('[data-member="portal"]')?.textContent).toContain('Portal questionnaire · Youth');
    expect(doc.querySelector('[data-member="both"]')?.textContent).toContain('Portal + application');
    expect(doc.querySelector('[data-member="both"]')?.getAttribute('data-status')).toBe('verified');
    expect(doc.querySelector('main')?.dataset).toMatchObject({ total: '4', pending: '2', verified: '1', needsInfo: '1', notEligible: '0' });
  });

  it('honors filters in the default view while retaining global KPI counts', async () => {
    const doc = await page({ review: 'needs_info' });
    expect([...doc.querySelectorAll('[data-member]')].map((row) => row.getAttribute('data-member'))).toEqual(['partial']);
    expect(doc.querySelector('main')?.dataset).toMatchObject({ total: '1', pending: '2', verified: '1', needsInfo: '1' });
  });

  it('counts and displays historical null-status application evidence as not reviewed, while omitting null with no evidence', async () => {
    fixture.rows.push(member('legacy-apply', { applyEligibilityScreenings: [apply()], wioaReviewStatus: null }));
    fixture.rows.push(member('stray-date', { wioaQualificationJson: { submittedAt: snapshot.submittedAt }, wioaReviewStatus: null }));
    const doc = await page();
    expect(doc.querySelector('[data-member="legacy-apply"]')?.getAttribute('data-status')).toBe('not_reviewed');
    expect(doc.querySelector('[data-member="legacy-apply"]')?.getAttribute('data-wait')).toBe('44');
    expect(doc.querySelector('[data-member="none"]')).toBeNull();
    expect(doc.querySelector('[data-member="stray-date"]')).toBeNull();
    expect(doc.querySelector('main')?.dataset).toMatchObject({ total: '5', pending: '3' });
  });

  it('uses the existing staff requeue clock, without resetting the clock merely for in-review status', async () => {
    const reviewedAt = new Date('2026-10-10T12:00:00Z');
    fixture.rows = [
      member('requeued', { applyEligibilityScreenings: [apply()], wioaReviewStatus: 'pending', wioaReviewedAt: reviewedAt }),
      member('claimed', { applyEligibilityScreenings: [apply()], wioaReviewStatus: 'in_review', wioaReviewedAt: reviewedAt }),
    ];
    const doc = await page();
    expect(doc.querySelector('[data-member="requeued"]')?.getAttribute('data-wait')).toBe('5');
    expect(doc.querySelector('[data-member="claimed"]')?.getAttribute('data-wait')).toBe('44');
  });

  it('includes application evidence in the legacy filtered table and keeps links on the same view', async () => {
    const doc = await page({ ui: 'legacy', review: 'pending' });
    expect(doc.body.textContent).toContain('Member apply');
    expect(doc.body.textContent).toContain('Application screening');
    expect(doc.body.textContent).not.toContain('Member partial');
    expect(doc.querySelector('a[href="/admin/members/apply?tab=eligibility"]')).not.toBeNull();
    expect([...doc.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toContain('/admin/wioa-screening?ui=legacy&review=needs_info');
    expect(doc.querySelector('a[href="/admin/wioa-screening?ui=legacy"]')).not.toBeNull();
  });

  it('keeps intentional super-admin cross-organization visibility', async () => {
    fixture.superAdmin = true;
    const doc = await page();
    expect(doc.querySelector('[data-member="foreign"]')?.textContent).toContain('Application screening');
  });

  it('retains the selected status when falling back to legacy after a core query failure', async () => {
    fixture.fail = true;
    await expect(page({ review: 'pending' })).rejects.toThrow('REDIRECT:/admin/wioa-screening?ui=legacy&review=pending');
  });
});
