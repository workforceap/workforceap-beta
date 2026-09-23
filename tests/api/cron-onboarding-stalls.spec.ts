import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn(async () => []) },
    counselorAssignment: { findMany: vi.fn(async () => []) },
    profile: { findMany: vi.fn(async () => []) },
    userRole: { findMany: vi.fn(async () => []) },
    // Shared ledger (lib/cron/nudgeThrottle.ts + per-bucket suppression).
    memberNudgeLog: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendOnboardingStallsDigestEmail: vi.fn(async () => ({ ok: true })),
  sendMemberStuckEmail: vi.fn(async () => ({ ok: true })),
  sendMemberCheckInEmail: vi.fn(async () => ({ ok: true })),
}));

// The route drops fixture-looking admin addresses before the digest; the
// example.com fixtures here must still reach the (mocked) sender.
vi.mock('@/lib/email/send', () => ({
  isFixtureEmailRecipient: vi.fn(() => false),
  isRecipientSkipReason: (value: unknown) => value === 'fixture_recipient' || value === 'suppressed_recipient',
}));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => ({})) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(async () => undefined) }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(async () => undefined) }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: vi.fn((_key: string, handler: (req: Request) => Promise<Response>) => handler),
}));

// ─── Imports after mocks ───
import { GET } from '@/app/api/cron/onboarding-stalls/route';
import {
  MEMBER_STALL_NUDGES_FLAG,
  STALL_BUCKET_TEMPLATE,
  STALL_CHECK_IN_CTA_TEXT,
  STALL_CHECK_IN_LEAD_TEXT,
  STALL_CHECK_IN_PATH,
  STALL_NUDGE_TIER,
  emptyMemberStallNudgeResult,
  memberStallNudgesEnabled,
  planMemberStallNudges,
  sendMemberStallNudges,
  stallNudgeKind,
  type StallNudgeBuckets,
} from '@/lib/cron/onboardingStallNudges';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_CHECK_IN_DEFAULT_CTA_TEXT, memberCheckInHtml } from '@/emails/member-check-in';
import { MEMBER_ONLY_EXCLUDED_EMAILS, MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import {
  sendMemberCheckInEmail,
  sendMemberStuckEmail,
  sendOnboardingStallsDigestEmail,
} from '@/lib/email';

const prismaMock = prisma as unknown as {
  user: { findMany: ReturnType<typeof vi.fn> };
  counselorAssignment: { findMany: ReturnType<typeof vi.fn> };
  profile: { findMany: ReturnType<typeof vi.fn> };
  userRole: { findMany: ReturnType<typeof vi.fn> };
  memberNudgeLog: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

const passthroughPacer = { run: <T,>(op: () => Promise<T>) => op() };

/**
 * The module re-reads every candidate through the member-only, opted-in
 * filter (`prisma.user.findMany`). By default the filter returns the
 * candidates unchanged, so the other suites test one thing at a time; the
 * population suite overrides it.
 */
function memberFilterReturns(rows: Array<{ id: string; fullName: string | null; email: string | null }> | 'all') {
  prismaMock.user.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => {
    const ids = new Set(args.where.id.in);
    const pool = rows === 'all' ? [alice, bob, carol, noEmail] : rows;
    return pool.filter((r) => ids.has(r.id)).map((r) => ({ id: r.id, fullName: r.fullName, email: r.email }));
  });
}

const alice = { id: 'u-alice', fullName: 'Alice Smith', email: 'alice@example.com' };
const bob = { id: 'u-bob', fullName: 'Bob Jones', email: 'bob@example.com' };
const carol = { id: 'u-carol', fullName: 'Carol White', email: 'carol@example.com' };
const noEmail = { id: 'u-noemail', fullName: 'No Email', email: null };

function buckets(over: Partial<StallNudgeBuckets> = {}): StallNudgeBuckets {
  return { interview: [], no_program: [], wioa: [], ...over };
}

/**
 * `memberNudgeLog.findMany` serves two reads: the shared 7-day cooldown
 * (`where.sentAt`) and the per-bucket ledger (`where.kind`). Answer each from
 * the given fixtures so a test can exercise them independently.
 */
function ledger(opts: { recentlyNudged?: string[]; alreadyByKind?: Record<string, string[]> }) {
  prismaMock.memberNudgeLog.findMany.mockImplementation(async (args: { where: { sentAt?: unknown; kind?: string; userId: { in: string[] } } }) => {
    const ids = new Set(args.where.userId.in);
    if (args.where.sentAt) {
      return (opts.recentlyNudged ?? []).filter((id) => ids.has(id)).map((userId) => ({ userId }));
    }
    if (args.where.kind) {
      return (opts.alreadyByKind?.[args.where.kind] ?? []).filter((id) => ids.has(id)).map((userId) => ({ userId }));
    }
    return [];
  });
}

const originalFlag = process.env[MEMBER_STALL_NUDGES_FLAG];
let infoSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[MEMBER_STALL_NUDGES_FLAG];
  ledger({});
  memberFilterReturns('all');
  prismaMock.counselorAssignment.findMany.mockResolvedValue([]);
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  infoSpy.mockRestore();
  if (originalFlag === undefined) delete process.env[MEMBER_STALL_NUDGES_FLAG];
  else process.env[MEMBER_STALL_NUDGES_FLAG] = originalFlag;
});

describe('MEMBER_STALL_NUDGES_ENABLED flag', () => {
  it('is off by default and only accepts true/1', () => {
    expect(memberStallNudgesEnabled({})).toBe(false);
    expect(memberStallNudgesEnabled({ MEMBER_STALL_NUDGES_ENABLED: '' })).toBe(false);
    expect(memberStallNudgesEnabled({ MEMBER_STALL_NUDGES_ENABLED: 'false' })).toBe(false);
    expect(memberStallNudgesEnabled({ MEMBER_STALL_NUDGES_ENABLED: '0' })).toBe(false);
    expect(memberStallNudgesEnabled({ MEMBER_STALL_NUDGES_ENABLED: 'yes' })).toBe(false);
    expect(memberStallNudgesEnabled({ MEMBER_STALL_NUDGES_ENABLED: 'true' })).toBe(true);
    expect(memberStallNudgesEnabled({ MEMBER_STALL_NUDGES_ENABLED: ' TRUE ' })).toBe(true);
    expect(memberStallNudgesEnabled({ MEMBER_STALL_NUDGES_ENABLED: '1' })).toBe(true);
  });

  it('sends nothing and reads no ledger when off', async () => {
    const result = await sendMemberStallNudges(
      buckets({ interview: [alice], no_program: [bob], wioa: [carol] }),
      passthroughPacer,
    );
    expect(result).toEqual(emptyMemberStallNudgeResult(false));
    expect(sendMemberStuckEmail).not.toHaveBeenCalled();
    expect(sendMemberCheckInEmail).not.toHaveBeenCalled();
    expect(prismaMock.memberNudgeLog.findMany).not.toHaveBeenCalled();
    expect(prismaMock.memberNudgeLog.create).not.toHaveBeenCalled();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });
});

describe('population: only opted-in members are ever emailed', () => {
  const staff = { id: 'u-admin', fullName: 'Ada Admin', email: 'ada@example.com' };
  const counselor = { id: 'u-counselor', fullName: 'Cal Counselor', email: 'cal@example.com' };
  const employer = { id: 'u-employer', fullName: 'Emma Employer', email: 'emma@example.com' };
  const partner = { id: 'u-partner', fullName: 'Pat Partner', email: 'pat@example.com' };
  const roleless = { id: 'u-roleless', fullName: 'Rae Roleless', email: 'rae@example.com' };
  const unsubscribed = { id: 'u-unsub', fullName: 'Uma Unsub', email: 'uma@example.com' };
  const dogfood = { id: 'u-dogfood', fullName: 'Dog Food', email: 'member.success@workforceap.org' };
  const everyone = [alice, staff, counselor, employer, partner, roleless, unsubscribed, dogfood];

  beforeEach(() => {
    process.env[MEMBER_STALL_NUDGES_FLAG] = 'true';
  });

  it('re-reads the route candidates with the member-only, opted-in, non-deleted filter', async () => {
    memberFilterReturns([alice]);
    await sendMemberStallNudges(buckets({ no_program: everyone }), passthroughPacer);
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
    const args = prismaMock.user.findMany.mock.calls[0][0];
    expect(args.where.id).toEqual({ in: everyone.map((m) => m.id) });
    expect(args.where.deletedAt).toBeNull();
    expect(args.where.notificationsReminders).toBe(true);
    expect(args.where).toEqual(expect.objectContaining(MEMBER_ONLY_WHERE));
    expect(args.where.email.notIn).toEqual(expect.arrayContaining([...MEMBER_ONLY_EXCLUDED_EMAILS]));
    expect(args.take).toBe(everyone.length);
  });

  it('staff, counselor, employer, partner, role-less, unsubscribed and dogfood accounts are never emailed; a plain member is', async () => {
    memberFilterReturns([alice]);
    const result = await sendMemberStallNudges(
      buckets({ interview: [staff, counselor], no_program: everyone, wioa: [dogfood] }),
      passthroughPacer,
    );
    expect(sendMemberCheckInEmail).toHaveBeenCalledTimes(1);
    expect(sendMemberCheckInEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@example.com' }));
    expect(sendMemberStuckEmail).not.toHaveBeenCalled();
    const sentTo = [...vi.mocked(sendMemberCheckInEmail).mock.calls, ...vi.mocked(sendMemberStuckEmail).mock.calls].map((c) => c[0].to);
    for (const m of everyone.slice(1)) expect(sentTo).not.toContain(m.email);
    expect(result.candidates).toBe(everyone.length);
    expect(result.excluded).toBe(everyone.length - 1);
    expect(result.sentTotal).toBe(1);
    expect(prismaMock.memberNudgeLog.create).toHaveBeenCalledTimes(1);
  });

  it('emails the address the member filter returns, not the one the route carried', async () => {
    memberFilterReturns([{ ...alice, email: 'alice.new@example.com' }]);
    await sendMemberStallNudges(buckets({ interview: [alice] }), passthroughPacer);
    expect(sendMemberStuckEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice.new@example.com' }));
  });

  it('sends nothing when the member filter read fails', async () => {
    prismaMock.user.findMany.mockRejectedValue(new Error('db down'));
    const result = await sendMemberStallNudges(buckets({ interview: [alice] }), passthroughPacer);
    expect(sendMemberStuckEmail).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(result.sentTotal).toBe(0);
  });
});

describe('bucket → template mapping', () => {
  it('interview → stuck, no_program → check_in, wioa → staff-only', () => {
    expect(STALL_BUCKET_TEMPLATE).toEqual({ interview: 'stuck', no_program: 'check_in', wioa: null });
    expect(stallNudgeKind('interview')).toBe('stall_interview');
    expect(stallNudgeKind('no_program')).toBe('stall_no_program');
    expect(stallNudgeKind('wioa')).toBe('stall_wioa');
  });

  it('plans one email per member, highest-priority bucket first, and drops no-email / staff-only rows', () => {
    const result = emptyMemberStallNudgeResult(true);
    const plan = planMemberStallNudges(
      buckets({
        interview: [alice, noEmail],
        no_program: [alice, bob], // alice again: interview wins
        wioa: [carol, bob], // carol: wioa-only → no member template; bob already planned
      }),
      result,
    );
    expect(plan.map((p) => [p.member.id, p.bucket, p.template])).toEqual([
      ['u-alice', 'interview', 'stuck'],
      ['u-bob', 'no_program', 'check_in'],
    ]);
    expect(result.candidates).toBe(4);
    expect(result.skippedDuplicateBucket).toBe(2);
    expect(result.skippedNoTemplate).toBe(1);
    expect(result.skippedNoEmail).toBe(1);
  });

  it('sends the right template per bucket and records a stall_<bucket> ledger row', async () => {
    process.env[MEMBER_STALL_NUDGES_FLAG] = 'true';
    prismaMock.counselorAssignment.findMany.mockResolvedValue([
      { memberId: 'u-alice', counselor: { user: { fullName: 'Counselor One' } } },
    ]);

    const result = await sendMemberStallNudges(
      buckets({ interview: [alice], no_program: [bob], wioa: [carol] }),
      passthroughPacer,
    );

    expect(sendMemberStuckEmail).toHaveBeenCalledTimes(1);
    expect(sendMemberStuckEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      firstName: 'Alice',
      counselorName: 'Counselor One',
    });
    expect(sendMemberCheckInEmail).toHaveBeenCalledTimes(1);
    expect(sendMemberCheckInEmail).toHaveBeenCalledWith(
      // no_program members land on My Program, where the program picker lives,
      // and the button says so instead of the default "Open my dashboard".
      expect.objectContaining({
        to: 'bob@example.com',
        firstName: 'Bob',
        dashboardUrl: expect.stringMatching(/\/dashboard\/program$/),
        ctaText: STALL_CHECK_IN_CTA_TEXT,
        leadText: STALL_CHECK_IN_LEAD_TEXT,
      }),
    );

    expect(prismaMock.memberNudgeLog.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.memberNudgeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u-alice', tier: STALL_NUDGE_TIER, kind: 'stall_interview' }),
    });
    expect(prismaMock.memberNudgeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u-bob', tier: STALL_NUDGE_TIER, kind: 'stall_no_program' }),
    });

    expect(result.enabled).toBe(true);
    expect(result.sent).toEqual({ interview: 1, no_program: 1, wioa: 0 });
    expect(result.sentTotal).toBe(2);
    expect(result.skippedNoTemplate).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('the no_program check-in names My Program on its button, not the dashboard', () => {
    const programUrl = `https://www.workforceap.org${STALL_CHECK_IN_PATH}`;
    const html = memberCheckInHtml({
      firstName: 'Bob',
      dashboardUrl: programUrl,
      ctaText: STALL_CHECK_IN_CTA_TEXT,
      leadText: STALL_CHECK_IN_LEAD_TEXT,
    });
    const button = html.match(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    expect(button?.[1]).toBe(programUrl);
    expect(button?.[2]).toBe('Choose my program');
    expect(html).toContain('Pick your program in My Program when you are ready:');
    expect(html).not.toContain(MEMBER_CHECK_IN_DEFAULT_CTA_TEXT);
    expect(html).not.toMatch(/your dashboard is ready/i);

    // The at-risk check-in still links /dashboard and keeps the default copy.
    const atRisk = memberCheckInHtml({ firstName: 'Bob', dashboardUrl: 'https://www.workforceap.org/dashboard' });
    expect(atRisk).toContain('>Open my dashboard</a>');
    expect(atRisk).toContain('Your dashboard is ready when you are:');
  });

  it('falls back to a generic counselor name when the member has no active counselor', async () => {
    process.env[MEMBER_STALL_NUDGES_FLAG] = '1';
    await sendMemberStallNudges(buckets({ interview: [alice] }), passthroughPacer);
    expect(sendMemberStuckEmail).toHaveBeenCalledWith(
      expect.objectContaining({ counselorName: 'Your WorkforceAP counselor' }),
    );
  });
});

describe('suppression', () => {
  beforeEach(() => {
    process.env[MEMBER_STALL_NUDGES_FLAG] = 'true';
  });

  it('never sends the same bucket twice to a member (per-(member, bucket) ledger)', async () => {
    ledger({ alreadyByKind: { stall_interview: ['u-alice'] } });
    const result = await sendMemberStallNudges(
      buckets({ interview: [alice, bob] }),
      passthroughPacer,
    );
    expect(sendMemberStuckEmail).toHaveBeenCalledTimes(1);
    expect(sendMemberStuckEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'bob@example.com' }));
    expect(result.skippedAlreadyNudged).toBe(1);
    expect(result.sentTotal).toBe(1);
    expect(prismaMock.memberNudgeLog.create).toHaveBeenCalledTimes(1);
  });

  it('a stall_interview row does not block the same member from the no_program bucket', async () => {
    ledger({ alreadyByKind: { stall_interview: ['u-alice'] } });
    const result = await sendMemberStallNudges(buckets({ no_program: [alice] }), passthroughPacer);
    expect(sendMemberCheckInEmail).toHaveBeenCalledTimes(1);
    expect(result.skippedAlreadyNudged).toBe(0);
    expect(result.sent.no_program).toBe(1);
  });

  it('honours the shared 7-day cross-cron nudge cooldown', async () => {
    ledger({ recentlyNudged: ['u-bob'] });
    const result = await sendMemberStallNudges(
      buckets({ interview: [alice], no_program: [bob] }),
      passthroughPacer,
    );
    expect(sendMemberStuckEmail).toHaveBeenCalledTimes(1);
    expect(sendMemberCheckInEmail).not.toHaveBeenCalled();
    expect(result.skippedCooldown).toBe(1);
    expect(result.sentTotal).toBe(1);
  });

  it('counts provider-suppressed / fixture recipients as skipped and writes no ledger row', async () => {
    vi.mocked(sendMemberStuckEmail).mockResolvedValueOnce({ ok: false, skipped: true, error: 'suppressed_recipient' });
    vi.mocked(sendMemberCheckInEmail).mockResolvedValueOnce({ ok: false, skipped: true, error: 'fixture_recipient' });
    const result = await sendMemberStallNudges(
      buckets({ interview: [alice], no_program: [bob] }),
      passthroughPacer,
    );
    expect(result.skippedRecipient).toBe(2);
    expect(result.sentTotal).toBe(0);
    expect(prismaMock.memberNudgeLog.create).not.toHaveBeenCalled();
  });

  it('counts pacing-budget skips separately and keeps the run alive', async () => {
    const exhaustedPacer = {
      run: async <T,>(_op: () => Promise<T>) => ({ ok: false as const, skipped: true as const, error: 'pacing_budget_exhausted' as const }),
    };
    const result = await sendMemberStallNudges(buckets({ interview: [alice] }), exhaustedPacer);
    expect(sendMemberStuckEmail).not.toHaveBeenCalled();
    expect(result.skippedPacing).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('a failed send is counted and leaves no ledger row (so the next run retries)', async () => {
    vi.mocked(sendMemberStuckEmail).mockResolvedValueOnce({ ok: false, error: 'Send failed' });
    const result = await sendMemberStallNudges(buckets({ interview: [alice] }), passthroughPacer);
    expect(result.failed).toBe(1);
    expect(prismaMock.memberNudgeLog.create).not.toHaveBeenCalled();
  });

  it('sends nothing when the ledger read fails (cannot prove at-most-once)', async () => {
    prismaMock.memberNudgeLog.findMany.mockRejectedValue(new Error('db down'));
    const result = await sendMemberStallNudges(buckets({ interview: [alice] }), passthroughPacer);
    expect(sendMemberStuckEmail).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it('logs a counted event only — no member id, name or address', async () => {
    await sendMemberStallNudges(buckets({ interview: [alice] }), passthroughPacer);
    const logged = infoSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(logged).toContain('member_stall_nudges');
    expect(logged).toContain('"sentTotal":1');
    expect(logged).not.toContain('alice');
    expect(logged).not.toContain('u-alice');
    expect(logged).not.toContain('example.com');
  });
});

describe('GET /api/cron/onboarding-stalls wiring', () => {
  function seedBuckets() {
    // Promise.all order in the route: interview, wioa, no-program candidates,
    // then every WIOA screening awaiting review (WAP-166 queue-age line).
    prismaMock.user.findMany.mockReset();
    prismaMock.user.findMany
      .mockResolvedValueOnce([{ ...alice, interviewRequestedAt: new Date('2026-09-01') }])
      .mockResolvedValueOnce([{ ...carol, updatedAt: new Date('2026-09-01') }])
      .mockResolvedValueOnce([{ ...bob, createdAt: new Date('2026-09-01') }])
      .mockResolvedValueOnce([
        { wioaQualificationJson: { submittedAt: '2026-09-01T00:00:00.000Z' }, updatedAt: new Date('2026-09-01') },
      ])
      // admin users lookup
      .mockResolvedValueOnce([{ id: 'admin-1', email: 'admin@example.com' }])
      // member-only filter in lib/cron/onboardingStallNudges.ts: carol (wioa) is
      // a member too but her bucket has no member template.
      .mockResolvedValueOnce([alice, bob, carol]);
    prismaMock.profile.findMany.mockResolvedValue([{ userId: 'admin-1' }]);
    prismaMock.userRole.findMany.mockResolvedValue([]);
    // First counselorAssignment read = "no program" exclusion; second = counselor names.
    prismaMock.counselorAssignment.findMany.mockResolvedValue([]);
  }

  it('flag off: staff digest still goes out, no member email, memberNudges reports disabled', async () => {
    seedBuckets();
    const res = await GET(new Request('http://localhost/api/cron/onboarding-stalls'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(sendOnboardingStallsDigestEmail).toHaveBeenCalledTimes(1);
    expect(sendMemberStuckEmail).not.toHaveBeenCalled();
    expect(sendMemberCheckInEmail).not.toHaveBeenCalled();
    expect(body.totalStalled).toBe(3);
    expect(body.memberNudges).toEqual(emptyMemberStallNudgeResult(false));
  });

  it('flag on: each bucket feeds its member template and the run reports the counts', async () => {
    process.env[MEMBER_STALL_NUDGES_FLAG] = 'true';
    seedBuckets();
    const res = await GET(new Request('http://localhost/api/cron/onboarding-stalls'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(sendOnboardingStallsDigestEmail).toHaveBeenCalledTimes(1);
    expect(sendMemberStuckEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@example.com' }));
    expect(sendMemberCheckInEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'bob@example.com' }));
    expect(body.memberNudges.enabled).toBe(true);
    expect(body.memberNudges.sent).toEqual({ interview: 1, no_program: 1, wioa: 0 });
    expect(body.memberNudges.skippedNoTemplate).toBe(1);
  });
});
