// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/admin/coursera/ignored-xapi-summary is tenant-scoped (WAP-276):
 * an org admin sees only their own org's ignored/unmatched xAPI events, and a
 * super admin keeps the all-tenant view, matching the health page loaders.
 *
 * The fake database holds events for two orgs and answers each raw query the
 * way Postgres would for the organization parameter the route binds (a
 * nullable `organization_id` filter), so the test checks what each actor
 * would read, not the SQL text.
 */

type Status = 'ignored' | 'unresolved_course' | 'unmatched';
type Event = { org: string; status: Status; slug: string; email: string };

const EVENTS: Event[] = [
  { org: 'org-1', status: 'unresolved_course', slug: 'course-a', email: 'a@one.test' },
  { org: 'org-1', status: 'unmatched', slug: 'course-a', email: 'b@one.test' },
  // Normal progress traffic: counted as context, never listed as stuck.
  { org: 'org-1', status: 'ignored', slug: 'healthy-course', email: 'f@one.test' },
  { org: 'org-2', status: 'unresolved_course', slug: 'other-tenant-course', email: 'c@two.test' },
  { org: 'org-2', status: 'unresolved_course', slug: 'other-tenant-course', email: 'd@two.test' },
  { org: 'org-2', status: 'unmatched', slug: 'other-tenant-course', email: 'e@two.test' },
];

const auth = vi.hoisted(() => ({ superAdmin: false }));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (req: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: async () => auth.superAdmin,
  isAdminInOrg: async () => true,
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      // The route binds the org as a nullable text param: NULL means "all orgs".
      const scoped = /organization_id\s*=/.test(sql);
      const orgParam = scoped ? values.find((v) => typeof v === 'string' || v === null) : undefined;
      // The statuses the query asks for, read from its IN (...) list.
      const statuses = new Set([...sql.matchAll(/'(ignored|unresolved_course|unmatched)'/g)].map((m) => m[1]));
      const visible = EVENTS.filter(
        (e) => statuses.has(e.status) && (!scoped || orgParam === null || e.org === orgParam),
      );
      if (/GROUP BY completion_status/.test(sql)) {
        const totals = new Map<string, number>();
        for (const e of visible) totals.set(e.status, (totals.get(e.status) ?? 0) + 1);
        return [...totals].map(([completion_status, total]) => ({ completion_status, total: BigInt(total) }));
      }
      const bySlug = new Map<string, Event[]>();
      for (const e of visible) bySlug.set(e.slug, [...(bySlug.get(e.slug) ?? []), e]);
      return [...bySlug].map(([course_slug, rows]) => ({
        course_slug,
        course_name: course_slug,
        event_count: BigInt(rows.length),
        distinct_learners: BigInt(new Set(rows.map((r) => r.email)).size),
        first_seen: new Date('2026-09-20T00:00:00Z'),
        last_seen: new Date('2026-09-21T00:00:00Z'),
      }));
    }),
  },
}));

import { GET } from '@/app/api/admin/coursera/ignored-xapi-summary/route';

async function read() {
  const res = await GET(new Request('http://localhost/api/admin/coursera/ignored-xapi-summary'));
  expect(res.status).toBe(200);
  return res.json() as Promise<{
    outstandingTotal: number;
    ignoredTotal: number;
    unresolvedTotal: number;
    unmatchedTotal: number;
    topSlugs: { courseSlug: string }[];
  }>;
}

describe('ignored-xapi-summary tenant scope', () => {
  beforeEach(() => {
    auth.superAdmin = false;
  });

  it("shows an org admin only their own org's events", async () => {
    const body = await read();
    expect(body.outstandingTotal).toBe(2);
    expect(body.unresolvedTotal).toBe(1);
    expect(body.unmatchedTotal).toBe(1);
    expect(body.ignoredTotal).toBe(1);
    expect(body.topSlugs.map((s) => s.courseSlug)).toEqual(['course-a']);
  });

  it('lists only events that lost progress, not normal ignored traffic (WAP-276)', async () => {
    const body = await read();
    expect(body.topSlugs.map((s) => s.courseSlug)).not.toContain('healthy-course');
  });

  it('keeps the all-tenant view for a super admin', async () => {
    auth.superAdmin = true;
    const body = await read();
    expect(body.outstandingTotal).toBe(5);
    expect(body.ignoredTotal).toBe(1);
    expect(body.topSlugs.map((s) => s.courseSlug).sort()).toEqual(['course-a', 'other-tenant-course']);
  });
});
