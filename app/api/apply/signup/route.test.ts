vi.mock('@/lib/tenant/withTenantScope', () => ({ crossTenantOK: (fn: () => Promise<unknown>) => fn() }));
// @vitest-environment node
/**
 * Colocated route test for POST /api/apply/signup.
 *
 * Focus: the zod schema's ageGroup enum (Concordia HS launch adds 'under_18')
 * and that an accepted ageGroup lands in the created application's notes;
 * plus partner-sponsored enrollment stamping (Phase B2) — funding provenance
 * on CourseEnrollment, the soft seat cap, cookie-only partner refs, and the
 * school fields written for high-school partners.
 * All heavy dependencies (Supabase, Prisma, Resend email, rate limiting)
 * are mocked so the test exercises validation + the handler's data mapping.
 *
 * NOTE: collected by the default `pnpm test` run — this file is explicitly
 * included in vitest.config.ts alongside the tests/, lib/, components/ globs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PARTNER_REF_COOKIE } from '@/lib/apply/applyReferralCapture';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    // Match production: schedule side effects after the response. In tests,
    // run on the next microtask so awaits that flush the queue still see emails.
    after: (fn: () => unknown) => {
      void Promise.resolve().then(fn);
    },
  };
});

type PartnerRow = {
  id: string;
  name: string;
  partnerType: string;
  contactEmail: string | null;
  notifyOnEnrollment: boolean;
  sponsoredEnrollment: boolean;
  sponsorshipFundingSource: string | null;
  sponsorshipTermLabel: string | null;
  sponsorshipStartsAt: Date | null;
  sponsorshipEndsAt: Date | null;
  sponsorshipSeatCap: number | null;
  schoolDistrict: string | null;
};

type UpsertArgs = { create: Record<string, unknown>; update: Record<string, unknown> };

const state = vi.hoisted(() => ({
  applicationCreates: [] as { data: { notes?: string | null } }[],
  /** Row returned by `partner.findFirst`; null means "no such partner". */
  partner: null as Record<string, unknown> | null,
  partnerLookups: [] as { where: { OR?: { referralCode?: string; slug?: string }[] } }[],
  /** Value `courseEnrollment.count` reports for already-sponsored seats. */
  sponsoredSeatCount: 0,
  enrollmentUpserts: [] as UpsertArgs[],
  enrollmentUpdateManys: [] as {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }[],
  /** `where` args passed to `courseEnrollment.count` (seat-cap denominator). */
  enrollmentCounts: [] as Record<string, unknown>[],
  profileUpserts: [] as UpsertArgs[],
  /** Request cookies visible to the route via `next/headers`. */
  cookies: {} as Record<string, string>,
  /** Cookies the route wrote back via `cookieStore.set`. */
  cookieSets: [] as { name: string; value: string; options: Record<string, unknown> }[],
  /** Args passed to `partnerReferral.upsert`. */
  partnerReferralUpserts: [] as {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }[],
  /** Args passed to the admin new-application alert email. */
  adminEmails: [] as { applicationNotes?: string }[],

  existingAccount: null as { id: string; email?: string } | null,
  /** Raw ILIKE candidate rows, for exercising wildcard-pattern matches verbatim. */
  emailCandidates: null as { id: string; email: string }[] | null,
  emailLookups: [] as unknown[],
  resolvedOrgId: 'org-test-1',
  provisionCalls: [] as Array<{ headers?: unknown; programSlug?: string | null }>,
  userUpserts: [] as Array<{ create: Record<string, unknown>; update: Record<string, unknown> }>,
  screeningUpserts: [] as UpsertArgs[],
  userUpsertError: null as unknown,
  authAdminUser: null as { id: string; email?: string | null } | null,
  authAdminLookupError: null as unknown,
  authDeleteError: null as unknown,
  authAdminLookups: [] as string[],
  authDeletes: [] as string[],
}));

vi.mock('@/lib/rate-limit', () => ({
  checkApplySignupRateLimit: vi.fn(async () => ({ success: true })),
  checkSignupEmailRateLimit: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileResponse: vi.fn(async () => true),
}));

vi.mock('@/lib/db/prisma', () => {
  const tx = {
    user: {
      upsert: vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        state.userUpserts.push(args);
        if (state.userUpsertError) throw state.userUpsertError;
        return {};
      }),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async (args: unknown) => { state.emailLookups.push(args); return state.existingAccount; }),
      // The route uses findMany + an exact-email filter because
      // `mode: 'insensitive'` is ILIKE and the caller's address is the pattern.
      // Echo the queried address onto the row so an "existing account" fixture
      // still represents a genuine exact match.
      findMany: vi.fn(async (args: { where?: { email?: { equals?: string } } }) => {
        state.emailLookups.push(args);
        if (state.emailCandidates) return state.emailCandidates;
        if (!state.existingAccount) return [];
        return [{ email: args?.where?.email?.equals, ...state.existingAccount }];
      }),
    },
    courseEnrollment: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        state.enrollmentUpserts.push(args);
        return {};
      }),
      count: vi.fn(async (args: { where: Record<string, unknown> }) => {
        state.enrollmentCounts.push(args.where);
        return state.sponsoredSeatCount;
      }),
      updateMany: vi.fn(
        async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          state.enrollmentUpdateManys.push(args);
          return { count: 1 };
        }
      ),
    },
    profile: {
      upsert: vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        state.profileUpserts.push(args);
        return {};
      }),
    },
    application: {
      create: vi.fn(async (args: { data: { notes?: string | null } }) => {
        state.applicationCreates.push(args);
        return { id: 'app-test-1' };
      }),
    },
    applyEligibilityScreening: {
      upsert: vi.fn(async (args: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        state.screeningUpserts.push(args);
        return {};
      }),
    },
    partnerReferral: {
      // A bare `create` against `@@unique([partnerId, memberId])` throws
      // P2002 the second time a returning applicant re-submits — which the
      // durable ref cookie makes routine — rolling the whole transaction back
      // into a generic 500. Throwing here makes any regression to `create`
      // fail loudly instead of only under a real database.
      create: vi.fn(async () => {
        throw new Error(
          'partnerReferral.create must not be used: a re-submit would violate ' +
            '@@unique([partnerId, memberId]) and 500 the whole signup'
        );
      }),
      upsert: vi.fn(
        async (args: {
          where: Record<string, unknown>;
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          state.partnerReferralUpserts.push(args);
          return {};
        }
      ),
    },
    partner: {
      findFirst: vi.fn(async (args: { where: { OR?: { referralCode?: string; slug?: string }[] } }) => {
        state.partnerLookups.push(args);
        return state.partner;
      }),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: vi.fn((slug: string) =>
    slug === 'it-support-professional-certificate-ibm'
      ? { slug, title: 'IT Support Professional Certificate (IBM)' }
      : null
  ),
}));

vi.mock('@prisma/client', () => ({
  ApplicationStatus: { PENDING: 'PENDING' },
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/analytics/conversionValue', () => ({
  getConversionValuePayload: vi.fn(() => ({})),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getDefaultOrganizationId: vi.fn(async () => 'org-test-1'),
}));

vi.mock('@/lib/tenant/resolveProvisionOrg', () => ({

  resolveProvisionOrganizationId: vi.fn(async () => 'org-test-1'),
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: vi.fn(),
}));

vi.mock('@/lib/observability/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
  withSystemGuc: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/lib/db/withDbRetry', () => ({
  withDbRetry: vi.fn(async (fn: () => unknown) => fn()),
  isConnectionAcquisitionError: vi.fn(() => false),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn(async (userId: string) => {
          state.authAdminLookups.push(userId);
          return {
            data: { user: state.authAdminUser },
            error: state.authAdminLookupError,
          };
        }),
        deleteUser: vi.fn(async (userId: string) => {
          state.authDeletes.push(userId);
          return { error: state.authDeleteError };
        }),
      },
    },
  })),
}));

vi.mock('@/lib/email', () => ({
  sendApplicationConfirmationEmail: vi.fn(async () => undefined),
  sendNewApplicationAdminEmail: vi.fn(async (args: { applicationNotes?: string }) => {
    state.adminEmails.push(args);
    return undefined;
  }),
  sendSchoolEnrollmentParentAckEmail: vi.fn(async () => undefined),
  sendSchoolEnrollmentPartnerAckEmail: vi.fn(async () => undefined),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => Object.entries(state.cookies).map(([name, value]) => ({ name, value })),
    get: (name: string) =>
      name in state.cookies ? { name, value: state.cookies[name] } : undefined,
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      state.cookieSets.push({ name, value, options });
    },
  })),
}));

vi.mock('@/lib/supabaseCookieOptions', () => ({
  getSupabaseCookieOptions: vi.fn(() => ({})),
}));

const supabaseGetUser = vi.fn(async () => ({ data: { user: null }, error: null }));
const supabaseSignUp = vi.fn(async () => ({
  data: {
    user: {
      id: 'user-test-1',
      email: 'applicant@example.com',
      identities: [{ id: 'identity-test-1', user_id: 'user-test-1' }],
    },
    session: null,
  },
  error: null,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      // The route refuses to overwrite an existing browser session (9/2/26).
      getUser: supabaseGetUser,
      signUp: supabaseSignUp,
    },
  })),
}));

import { POST } from './route';
import {
  sendApplicationConfirmationEmail,
  sendNewApplicationAdminEmail,
  sendSchoolEnrollmentParentAckEmail,
  sendSchoolEnrollmentPartnerAckEmail,
} from '@/lib/email';
import { captureApiError } from '@/lib/observability/captureApiError';

function makeRequest(overrides: Record<string, unknown> = {}) {
  const body = {
    firstName: 'Concordia',
    lastName: 'Student',
    email: 'applicant@example.com',
    phone: '5125550199',
    password: 'Password123!',
    programRankedSlugs: ['it-support-professional-certificate-ibm'],
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    county: 'Travis',
    eligibilityQ1: 'yes',
    eligibilityQ2: 'yes',
    eligibilityQualifies: true,
    eligibilityYesCount: 2,
    ...overrides,
  };
  return new NextRequest('http://localhost:3000/api/apply/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function resetState() {
  state.existingAccount = null;
  state.emailCandidates = null;
  state.emailLookups.length = 0;
  state.applicationCreates.length = 0;
  state.partnerLookups.length = 0;
  state.enrollmentUpserts.length = 0;
  state.enrollmentUpdateManys.length = 0;
  state.enrollmentCounts.length = 0;
  state.profileUpserts.length = 0;
  state.cookieSets.length = 0;
  state.partnerReferralUpserts.length = 0;
  state.adminEmails.length = 0;
  state.screeningUpserts.length = 0;
  state.userUpsertError = null;
  state.authAdminUser = null;
  state.authAdminLookupError = null;
  state.authDeleteError = null;
  state.authAdminLookups.length = 0;
  state.authDeletes.length = 0;

  state.provisionCalls.length = 0;
  state.userUpserts.length = 0;
  state.resolvedOrgId = 'org-test-1';
  state.partner = null;
  state.sponsoredSeatCount = 0;
  state.cookies = {};
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.NEXT_PUBLIC_CAPTCHA_ENABLED;
  vi.clearAllMocks();
}

describe('POST /api/apply/signup ageGroup validation', () => {
  beforeEach(resetState);

  it('accepts ageGroup "under_18" and records it in application notes', async () => {
    const res = await POST(makeRequest({ ageGroup: 'under_18' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success?: boolean };
    expect(json.success).toBe(true);

    expect(state.applicationCreates).toHaveLength(1);
    expect(state.applicationCreates[0].data.notes).toContain('Age group: under_18');
  });

  it('still accepts the existing ageGroup values', async () => {
    for (const ageGroup of ['18_24', '25_50', '50_plus']) {
      state.applicationCreates.length = 0;
      const res = await POST(makeRequest({ ageGroup }));
      expect(res.status).toBe(200);
      expect(state.applicationCreates[0].data.notes).toContain(`Age group: ${ageGroup}`);
    }
  });

  it('rejects an invalid ageGroup like "under_13" with a 400', async () => {
    const res = await POST(makeRequest({ ageGroup: 'under_13' }));
    expect(res.status).toBe(400);
    expect(state.applicationCreates).toHaveLength(0);
  });

  it('accepts a missing ageGroup (optional field)', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(state.applicationCreates[0].data.notes ?? '').not.toContain('Age group:');
  });
});

/**
 * Phase B2: a partner with an active sponsorship stamps funding provenance
 * onto the enrollment it creates. Every assertion here also pins the negative
 * case — no ref, an inactive window, or a full seat cap must leave the
 * enrollment payload exactly as it was before this feature.
 */
describe('POST /api/apply/signup sponsored enrollment', () => {
  beforeEach(resetState);

  function sponsoringPartner(overrides: Partial<PartnerRow> = {}): PartnerRow {
    return {
      id: 'partner-concordia',
      name: 'Concordia High School',
      partnerType: 'community',
      contactEmail: 'marianne.rader@chsaustin.org',
      notifyOnEnrollment: true,
      sponsoredEnrollment: true,
      sponsorshipFundingSource: null,
      sponsorshipTermLabel: 'Fall 2026',
      sponsorshipStartsAt: null,
      sponsorshipEndsAt: null,
      sponsorshipSeatCap: null,
      schoolDistrict: null,
      ...overrides,
    };
  }

  function enrollmentCreate(): Record<string, unknown> {
    expect(state.enrollmentUpserts).toHaveLength(1);
    return state.enrollmentUpserts[0].create;
  }

  it('stamps funding source, notes, and sponsoring partner on the enrollment', async () => {
    state.partner = sponsoringPartner();

    const res = await POST(makeRequest({ referralRef: 'concordia-hs' }));
    expect(res.status).toBe(200);

    expect(enrollmentCreate()).toMatchObject({
      fundingSource: 'PARTNER_ORG',
      fundingNotes: 'Sponsored by Concordia High School (Fall 2026)',
      sponsoredByPartnerId: 'partner-concordia',
    });
  });

  it('never clobbers an admin-set funding source on an existing enrollment', async () => {
    state.partner = sponsoringPartner();

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    // The update branch deliberately omits fundingSource/fundingNotes; the
    // stamp lands via a null-scoped updateMany instead.
    expect(state.enrollmentUpserts[0].update).not.toHaveProperty('fundingSource');
    expect(state.enrollmentUpdateManys).toHaveLength(1);
    expect(state.enrollmentUpdateManys[0].where).toMatchObject({ fundingSource: null });
    expect(state.enrollmentUpdateManys[0].data).toMatchObject({
      fundingSource: 'PARTNER_ORG',
      fundingNotes: 'Sponsored by Concordia High School (Fall 2026)',
    });
  });

  it('moves all three provenance fields together, never the sponsor id alone', async () => {
    // A returning applicant whose enrollment already has funding must keep
    // school A's fundingNotes AND school A's sponsor id. Stamping
    // sponsoredByPartnerId on the upsert's update branch (as this used to)
    // was unguarded: it produced mismatched provenance, and because the
    // seat-cap denominator counts sponsoredByPartnerId, a self-funded student
    // silently consumed a school's seat.
    state.partner = sponsoringPartner();

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(state.enrollmentUpserts[0].update).not.toHaveProperty('sponsoredByPartnerId');
    expect(state.enrollmentUpserts[0].update).not.toHaveProperty('fundingNotes');
    // All three ride the same fundingSource-null-guarded write.
    expect(state.enrollmentUpdateManys[0].data).toEqual({
      fundingSource: 'PARTNER_ORG',
      fundingNotes: 'Sponsored by Concordia High School (Fall 2026)',
      sponsoredByPartnerId: 'partner-concordia',
    });
  });

  it('also guards the stamp on fundingNotes being empty', async () => {
    // Admins can record fundingNotes with a null fundingSource via
    // /api/admin/members/[id]/enrollment-funding; those notes are a
    // deliberate human record and must not be overwritten.
    state.partner = sponsoringPartner();

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(state.enrollmentUpdateManys[0].where).toMatchObject({
      fundingSource: null,
      fundingNotes: null,
    });
  });

  it('honors the partner\'s explicit funding source', async () => {
    state.partner = sponsoringPartner({ sponsorshipFundingSource: 'GRANT' });

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(enrollmentCreate()).toMatchObject({ fundingSource: 'GRANT' });
  });

  it('does not stamp when the sponsorship window has expired', async () => {
    state.partner = sponsoringPartner({
      sponsorshipStartsAt: new Date('2020-01-01T00:00:00Z'),
      sponsorshipEndsAt: new Date('2020-12-31T00:00:00Z'),
    });

    const res = await POST(makeRequest({ referralRef: 'concordia-hs' }));
    expect(res.status).toBe(200);

    const create = enrollmentCreate();
    expect(create).not.toHaveProperty('fundingSource');
    expect(create).not.toHaveProperty('fundingNotes');
    expect(create).not.toHaveProperty('sponsoredByPartnerId');
    expect(state.enrollmentUpdateManys).toHaveLength(0);
  });

  it('does not stamp for a partner that does not sponsor enrollment', async () => {
    state.partner = sponsoringPartner({ sponsoredEnrollment: false });

    const res = await POST(makeRequest({ referralRef: 'some-partner' }));
    expect(res.status).toBe(200);

    expect(enrollmentCreate()).not.toHaveProperty('sponsoredByPartnerId');
  });

  it('leaves the enrollment unstamped but the student enrolled when the seat cap is reached', async () => {
    state.partner = sponsoringPartner({ sponsorshipSeatCap: 25 });
    state.sponsoredSeatCount = 25;

    const res = await POST(makeRequest({ referralRef: 'concordia-hs' }));
    // Soft cap: a full cap must never error a student out of the funnel.
    expect(res.status).toBe(200);

    const create = enrollmentCreate();
    expect(create).not.toHaveProperty('fundingSource');
    expect(create).not.toHaveProperty('sponsoredByPartnerId');
    expect(state.enrollmentUpdateManys).toHaveLength(0);
  });

  it('keeps the seat-cap note out of Application.notes and in the admin alert', async () => {
    // PRIVACY: Application.notes is returned verbatim to the member by the
    // self-serve GDPR export (lib/member/exportData.ts). "Your school ran out
    // of funded seats, funding pending admin review" is a staff signal, not
    // something to hand a student.
    state.partner = sponsoringPartner({ sponsorshipSeatCap: 25 });
    state.sponsoredSeatCount = 25;

    await POST(makeRequest({ referralRef: 'concordia-hs', ageGroup: 'under_18' }));

    const notes = state.applicationCreates[0].data.notes ?? '';
    expect(notes).not.toContain('Seat cap');
    expect(notes).not.toContain('funding pending admin review');
    // The rest of the notes are unaffected.
    expect(notes).toContain('Age group: under_18');

    // Staff still get the signal, on the admin alert email.
    expect(state.adminEmails).toHaveLength(1);
    expect(state.adminEmails[0].applicationNotes).toContain(
      'Seat cap reached for Concordia High School sponsorship — funding pending admin review'
    );
    expect(state.adminEmails[0].applicationNotes).toContain('Age group: under_18');
  });

  it('does not add a seat-cap line to the admin alert when seats remain', async () => {
    state.partner = sponsoringPartner({ sponsorshipSeatCap: 25 });
    state.sponsoredSeatCount = 24;

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(state.adminEmails[0].applicationNotes ?? '').not.toContain('Seat cap');
  });

  it('counts seats only inside the sponsorship window', async () => {
    // Nothing ever clears sponsoredByPartnerId, so an unscoped count keeps
    // reading last term's total after a rollover — at which point every new
    // student silently lands unfunded.
    // A window around "now" so the sponsorship is active without mocking the
    // clock; the assertion is on the filter, which is the actual mechanism.
    const startsAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    state.partner = sponsoringPartner({
      sponsorshipSeatCap: 25,
      sponsorshipStartsAt: startsAt,
      sponsorshipEndsAt: endsAt,
    });
    // Prior-term enrollments are excluded by the filter, so the count the
    // route sees is this term's only.
    state.sponsoredSeatCount = 3;

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(state.enrollmentCounts).toHaveLength(1);
    expect(state.enrollmentCounts[0]).toEqual({
      sponsoredByPartnerId: 'partner-concordia',
      enrolledAt: { gte: startsAt, lte: endsAt },
    });
    // Under this term's cap, so it still stamps.
    expect(enrollmentCreate()).toMatchObject({ sponsoredByPartnerId: 'partner-concordia' });
  });

  it('counts every sponsored seat when the partner has no window configured', async () => {
    state.partner = sponsoringPartner({ sponsorshipSeatCap: 25 });

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(state.enrollmentCounts[0]).toEqual({
      sponsoredByPartnerId: 'partner-concordia',
    });
  });

  it('still stamps while seats remain under the cap', async () => {
    state.partner = sponsoringPartner({ sponsorshipSeatCap: 25 });
    state.sponsoredSeatCount = 24;

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(enrollmentCreate()).toMatchObject({ sponsoredByPartnerId: 'partner-concordia' });
    expect(state.applicationCreates[0].data.notes ?? '').not.toContain('Seat cap reached');
  });

  it('resolves the partner from the ref cookie when the body carries none', async () => {
    state.partner = sponsoringPartner();
    state.cookies[PARTNER_REF_COOKIE] = 'concordia-hs';

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(state.partnerLookups).toHaveLength(1);
    expect(state.partnerLookups[0].where.OR).toEqual([
      { referralCode: 'concordia-hs' },
      { slug: 'concordia-hs' },
    ]);
    expect(enrollmentCreate()).toMatchObject({ sponsoredByPartnerId: 'partner-concordia' });
  });

  it('prefers the body ref over the cookie', async () => {
    state.partner = sponsoringPartner();
    state.cookies[PARTNER_REF_COOKIE] = 'stale-partner';

    await POST(makeRequest({ referralRef: 'Concordia-HS' }));

    expect(state.partnerLookups[0].where.OR).toEqual([
      { referralCode: 'concordia-hs' },
      { slug: 'concordia-hs' },
    ]);
  });

  it('looks up no partner at all when neither body nor cookie has a ref', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(state.partnerLookups).toHaveLength(0);
    expect(enrollmentCreate()).not.toHaveProperty('sponsoredByPartnerId');
  });

  it('records school name and district on the profile for a high_school partner', async () => {
    state.partner = sponsoringPartner({
      partnerType: 'high_school',
      schoolDistrict: 'Austin ISD',
    });

    const res = await POST(makeRequest({ referralRef: 'concordia-hs' }));
    expect(res.status).toBe(200);

    expect(state.profileUpserts).toHaveLength(1);
    expect(state.profileUpserts[0].create).toMatchObject({
      schoolName: 'Concordia High School',
      schoolDistrict: 'Austin ISD',
    });
    expect(state.profileUpserts[0].update).toMatchObject({
      schoolName: 'Concordia High School',
      schoolDistrict: 'Austin ISD',
    });
  });

  it('does not treat high-school applicants as employed job-seekers', async () => {
    state.partner = sponsoringPartner({
      partnerType: 'high_school',
      schoolDistrict: 'Austin ISD',
    });

    const res = await POST(
      makeRequest({
        referralRef: 'concordia-hs',
        ageGroup: 'under_18',
        gradeLevel: '11',
        schoolName: 'Concordia High School',
        parentGuardianName: 'Alex Rader',
        parentGuardianEmail: 'parent@example.com',
        eligibilityQ1: null,
        eligibilityQ2: null,
        county: null,
        primaryBarriers: ['high_school_student'],
      }),
    );
    expect(res.status).toBe(200);

    expect(state.profileUpserts[0].create).toMatchObject({
      hasEmploymentBarrier: false,
      barrierTypes: ['high_school_student'],
      gradeLevel: '11',
      parentGuardianName: 'Alex Rader',
    });
    const notes = state.applicationCreates[0].data.notes ?? '';
    expect(notes).toContain('high-school student');
    expect(notes).toContain('Age group: under_18');
    expect(notes).toContain('Grade: 11');
    expect(notes).not.toContain('Quick eligibility');
    expect(notes).not.toContain('County:');
  });

  it('leaves the profile school fields untouched for a non-school partner', async () => {
    state.partner = sponsoringPartner({ partnerType: 'community' });

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(state.profileUpserts[0].create).not.toHaveProperty('schoolName');
    expect(state.profileUpserts[0].update).not.toHaveProperty('schoolDistrict');
  });

  it('omits schoolDistrict entirely when the partner has none', async () => {
    // The key used to be written unconditionally, so a partner with a null
    // district nulled out a district an admin had already recorded.
    state.partner = sponsoringPartner({ partnerType: 'high_school', schoolDistrict: null });

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(state.profileUpserts[0].create).toMatchObject({ schoolName: 'Concordia High School' });
    expect(state.profileUpserts[0].create).not.toHaveProperty('schoolDistrict');
    expect(state.profileUpserts[0].update).not.toHaveProperty('schoolDistrict');
  });

  it('omits schoolDistrict when the partner has only whitespace', async () => {
    state.partner = sponsoringPartner({ partnerType: 'high_school', schoolDistrict: '   ' });

    await POST(makeRequest({ referralRef: 'concordia-hs' }));

    expect(state.profileUpserts[0].update).not.toHaveProperty('schoolDistrict');
  });
});

/**
 * Phase B2 hardening: the durable partner-ref cookie is client-held state on
 * a funnel that runs on school lab and library machines. It has to be
 * re-validated on read, consumed exactly once, and it must never turn a
 * returning applicant's re-submit into a 500.
 */
describe('POST /api/apply/signup partner ref cookie handling', () => {
  beforeEach(resetState);

  function sponsoringPartner(): Record<string, unknown> {
    return {
      id: 'partner-concordia',
      name: 'Concordia High School',
      partnerType: 'high_school',
      contactEmail: 'marianne.rader@chsaustin.org',
      notifyOnEnrollment: true,
      sponsoredEnrollment: true,
      sponsorshipFundingSource: null,
      sponsorshipTermLabel: '2026',
      sponsorshipStartsAt: null,
      sponsorshipEndsAt: null,
      sponsorshipSeatCap: null,
      schoolDistrict: 'Austin ISD',
    };
  }

  function clearedRefCookies() {
    return state.cookieSets.filter((c) => c.name === PARTNER_REF_COOKIE);
  }

  it('expires the ref cookie once it has been consumed', async () => {
    // Shared-device safety: without this, applicants #2..N for the next 30
    // days inherit the first student's school — attribution, funding stamp,
    // and the schoolName/schoolDistrict that drive minor/consent handling.
    state.partner = sponsoringPartner();
    state.cookies[PARTNER_REF_COOKIE] = 'concordia';

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(clearedRefCookies()).toHaveLength(1);
    expect(clearedRefCookies()[0]).toMatchObject({
      value: '',
      options: {
        maxAge: 0,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      },
    });
  });

  it('expires a malformed ref cookie too', async () => {
    state.cookies[PARTNER_REF_COOKIE] = '../admin';

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // Never looked up, but still cleared so it cannot linger for 30 days.
    expect(state.partnerLookups).toHaveLength(0);
    expect(clearedRefCookies()).toHaveLength(1);
  });

  it('writes no ref cookie at all for a signup that never had one', async () => {
    // The no-partner path must stay byte-identical to pre-Phase-B2 behavior,
    // including emitting no Set-Cookie header.
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(clearedRefCookies()).toHaveLength(0);
  });

  it('re-validates the cookie value instead of trusting it', async () => {
    // The body field is bounded by zod (.max(100)); the cookie path skipped
    // every one of those checks.
    for (const bad of [
      '../admin',
      '%2Fetc%2Fpasswd',
      'a\r\nSet-Cookie: evil=1',
      'partner ref',
      'a'.repeat(65),
      '   ',
    ]) {
      resetState();
      state.partner = sponsoringPartner();
      state.cookies[PARTNER_REF_COOKIE] = bad;

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(state.partnerLookups, `cookie value should be rejected: ${bad}`).toHaveLength(0);
      expect(state.enrollmentUpserts[0].create).not.toHaveProperty('sponsoredByPartnerId');
    }
  });

  it('normalizes a valid but uppercase cookie value', async () => {
    state.partner = sponsoringPartner();
    state.cookies[PARTNER_REF_COOKIE] = 'CONCORDIA';

    await POST(makeRequest());

    expect(state.partnerLookups[0].where.OR).toEqual([
      { referralCode: 'concordia' },
      { slug: 'concordia' },
    ]);
  });

  it('upserts the partner referral so a re-submit cannot 500', async () => {
    // The mocked `partnerReferral.create` throws, standing in for the P2002 a
    // returning applicant hits under `@@unique([partnerId, memberId])` — a
    // path the durable cookie makes routine (e.g. someone who applied but
    // never confirmed their email, where Supabase returns the real user).
    state.partner = sponsoringPartner();
    state.cookies[PARTNER_REF_COOKIE] = 'concordia';

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(state.partnerReferralUpserts).toHaveLength(1);
    expect(state.partnerReferralUpserts[0]).toEqual({
      where: {
        partnerId_memberId: { partnerId: 'partner-concordia', memberId: 'user-test-1' },
      },
      create: { partnerId: 'partner-concordia', memberId: 'user-test-1' },
      // Empty so a re-submit preserves the original referredAt and any
      // admin-assigned partner user.
      update: {},
    });
  });

  it('records no partner referral when there is no ref at all', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(state.partnerReferralUpserts).toHaveLength(0);
  });
});

describe('POST /api/apply/signup WS4 eligibility extended fields', () => {
  beforeEach(resetState);

  it('retains the signup supplied result rather than applying the questionnaire scoring policy', async () => {
    const res = await POST(makeRequest({
      eligibilityQ1: 'yes', eligibilityQ2: 'yes', eligibilityQ3: 'yes',
      eligibilityQualifies: false, eligibilityYesCount: 0,
    }));
    expect(res.status).toBe(200);
    expect(state.screeningUpserts[0].create).toMatchObject({ qualifies: false, yesCount: 0 });
    expect(state.screeningUpserts[0].update).toMatchObject({ qualifies: false, yesCount: 0 });
  });

  it('preserves the existing null result fallback and skips incomplete triads', async () => {
    const res = await POST(makeRequest({
      eligibilityQualifies: null, eligibilityYesCount: null,
      eligibilityQ1: 'yes', eligibilityQ2: 'yes', eligibilityQ3: null,
    }));
    expect(res.status).toBe(200);
    expect(state.screeningUpserts[0].create).toMatchObject({ q3: null, qualifies: false, yesCount: 0 });
    resetState();
    const incomplete = await POST(makeRequest({ eligibilityQ1: null, eligibilityQ2: 'yes' }));
    expect(incomplete.status).toBe(200);
    expect(state.screeningUpserts).toEqual([]);
  });

  it('persists unemployment / SNAP / hear-about / ambassador fields on screening upsert', async () => {
    const res = await POST(
      makeRequest({
        eligibilityQ1: 'yes',
        eligibilityQ2: 'yes',
        eligibilityQ3: 'yes',
        eligibilityYesCount: 3,
        eligibilityQualifies: true,
        receivingUnemployment: 'yes',
        exhaustedUnemployment: 'no',
        layoffCompany: 'Acme Logistics',
        snapWic: 'yes',
        hearAbout: 'Partner or community ambassador',
        hearAboutOther: null,
        partnerAmbassadorReferral: 'Ambassador Jane / code-abc',
        primaryBarriers: ['seeking_skills_training', 'employment_gap'],
      }),
    );
    expect(res.status).toBe(200);
    expect(state.screeningUpserts).toHaveLength(1);
    expect(state.screeningUpserts[0].create).toMatchObject({
      q1: 'yes',
      q2: 'yes',
      q3: 'yes',
      receivingUnemployment: 'yes',
      exhaustedUnemployment: 'no',
      layoffCompany: 'Acme Logistics',
      snapWic: 'yes',
      hearAbout: 'Partner or community ambassador',
      partnerAmbassadorReferral: 'Ambassador Jane / code-abc',
      yesCount: 3,
      qualifies: true,
    });
    const notes = state.applicationCreates[0]?.data.notes ?? '';
    expect(notes).toContain('Receiving unemployment: yes');
    expect(notes).toContain('SNAP/WIC: yes');
    expect(notes).toContain('Layoff / last employer: Acme Logistics');
    expect(notes).toContain('Heard about us: Partner or community ambassador');
    expect(notes).toContain('Partner/ambassador referral: Ambassador Jane / code-abc');

    // WS5: confirmation (awaited before response) + admin alert (after()) payloads
    expect(sendApplicationConfirmationEmail).toHaveBeenCalled();
    const confArgs = vi.mocked(sendApplicationConfirmationEmail).mock.calls.at(-1)?.[0];
    expect(confArgs?.eligibility).toMatchObject({
      receivingUnemployment: 'yes',
      snapWic: 'yes',
      layoffCompany: 'Acme Logistics',
      hearAbout: 'Partner or community ambassador',
      partnerAmbassadorReferral: 'Ambassador Jane / code-abc',
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(sendNewApplicationAdminEmail).toHaveBeenCalled();
    const adminArgs = vi.mocked(sendNewApplicationAdminEmail).mock.calls.at(-1)?.[0];
    expect(adminArgs?.eligibility).toMatchObject({
      receivingUnemployment: 'yes',
      snapWic: 'yes',
    });
  });

  it('rejects invalid receivingUnemployment values with 400', async () => {
    const res = await POST(makeRequest({ receivingUnemployment: 'sometimes' }));
    expect(res.status).toBe(400);
    expect(state.screeningUpserts).toHaveLength(0);
  });
});

describe('POST /api/apply/signup school enrollment ack emails', () => {
  beforeEach(resetState);

  function schoolPartner(overrides: Partial<PartnerRow> = {}): PartnerRow {
    return {
      id: 'partner-concordia',
      name: 'Concordia High School',
      partnerType: 'high_school',
      contactEmail: 'marianne.rader@chsaustin.org',
      notifyOnEnrollment: true,
      sponsoredEnrollment: true,
      sponsorshipFundingSource: 'PARTNER_ORG',
      sponsorshipTermLabel: '2026',
      sponsorshipStartsAt: null,
      sponsorshipEndsAt: null,
      sponsorshipSeatCap: null,
      schoolDistrict: 'Concordia',
      ...overrides,
    };
  }

  it('sends parent and partner ack emails on under-18 school signup', async () => {
    state.partner = schoolPartner();

    const res = await POST(
      makeRequest({
        referralRef: 'chs2026',
        ageGroup: 'under_18',
        gradeLevel: '11',
        schoolName: 'Concordia High School',
        parentGuardianName: 'Alex Rader',
        parentGuardianEmail: 'parent@example.com',
        primaryBarriers: ['high_school_student'],
        eligibilityQ1: null,
        eligibilityQ2: null,
        county: null,
      }),
    );
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 0));

    expect(sendSchoolEnrollmentParentAckEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'parent@example.com',
        parentGuardianName: 'Alex Rader',
        studentName: 'Concordia Student',
        schoolName: 'Concordia High School',
        programInterest: 'IT Support Professional Certificate (IBM)',
      }),
    );
    expect(sendSchoolEnrollmentPartnerAckEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'marianne.rader@chsaustin.org',
        partnerName: 'Concordia High School',
        studentName: 'Concordia Student',
        studentEmail: 'applicant@example.com',
        gradeLevel: '11',
      }),
    );
  });

  it('skips parent ack when not under 18', async () => {
    state.partner = schoolPartner();

    await POST(
      makeRequest({
        referralRef: 'chs2026',
        ageGroup: '18_24',
        gradeLevel: '12',
        primaryBarriers: ['high_school_student'],
        eligibilityQ1: null,
        eligibilityQ2: null,
        county: null,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(sendSchoolEnrollmentParentAckEmail).not.toHaveBeenCalled();
    expect(sendSchoolEnrollmentPartnerAckEmail).toHaveBeenCalled();
  });

  it('skips partner ack when notifyOnEnrollment is false', async () => {
    state.partner = schoolPartner({ notifyOnEnrollment: false });

    await POST(
      makeRequest({
        referralRef: 'chs2026',
        ageGroup: 'under_18',
        gradeLevel: '10',
        parentGuardianEmail: 'parent@example.com',
        primaryBarriers: ['high_school_student'],
        eligibilityQ1: null,
        eligibilityQ2: null,
        county: null,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(sendSchoolEnrollmentParentAckEmail).toHaveBeenCalled();
    expect(sendSchoolEnrollmentPartnerAckEmail).not.toHaveBeenCalled();
  });

  it('does not send school ack emails for adult WIOA signup', async () => {
    await POST(makeRequest());

    await new Promise((r) => setTimeout(r, 0));

    expect(sendSchoolEnrollmentParentAckEmail).not.toHaveBeenCalled();
    expect(sendSchoolEnrollmentPartnerAckEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/apply/signup account-safety guards (9/2/26)', () => {
  beforeEach(() => {
    resetState();
    supabaseGetUser.mockReset();
    supabaseGetUser.mockResolvedValue({ data: { user: null }, error: null } as never);
    supabaseSignUp.mockReset();
    supabaseSignUp.mockResolvedValue({
      data: {
        user: {
          id: 'user-test-1',
          email: 'applicant@example.com',
          identities: [{ id: 'identity-test-1', user_id: 'user-test-1' }],
        },
        session: null,
      },
      error: null,
    } as never);
  });

  it('refuses to create an account while the browser is signed in as someone else', async () => {
    supabaseGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@example.com' } },
      error: null,
    } as never);

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('ALREADY_SIGNED_IN');
    expect(body.error).toContain('admin@example.com');
    expect(supabaseSignUp).not.toHaveBeenCalled();
  });

  it('requires staff recovery for an existing legacy identity even when Auth is missing', async () => {
    state.existingAccount = { id: 'old-super-admin-identity' };
    const res = await POST(makeRequest({ email: 'Applicant@Example.COM' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: 'ACCOUNT_RECOVERY_REQUIRED',
      error: expect.stringContaining('staff-assisted account recovery'),
    });
    expect(state.emailLookups).toEqual([{
      where: { email: { equals: 'applicant@example.com', mode: 'insensitive' } },
      select: { id: true, email: true },
      take: 25,
    }]);
    expect(supabaseSignUp).not.toHaveBeenCalled();
    expect(state.userUpserts).toEqual([]);
    expect(state.profileUpserts).toEqual([]);
    expect(state.enrollmentUpserts).toEqual([]);
    expect(state.applicationCreates).toEqual([]);
  });

  // `mode: 'insensitive'` compiles to ILIKE, so the applicant's own address is
  // the PATTERN and `_` matches any single character. Treating a pattern hit as
  // "this account exists" hard-blocks a real applicant out of the funnel with a
  // 409 they cannot self-resolve — silently, with no log and no Sentry capture.
  it('lets an applicant whose email contains an underscore through when only a same-shaped row matches', async () => {
    // What ILIKE 'real_person@example.com' returns: a different person.
    state.emailCandidates = [{ id: 'unrelated-member', email: 'real.person@example.com' }];

    const res = await POST(makeRequest({ email: 'real_person@example.com' }));

    expect(res.status).not.toBe(409);
    expect(supabaseSignUp).toHaveBeenCalled();
    expect(state.applicationCreates).toHaveLength(1);
  });

  it('still blocks when the exact address is present among wildcard matches', async () => {
    state.emailCandidates = [
      { id: 'unrelated-member', email: 'real.person@example.com' },
      { id: 'the-real-owner', email: 'real_person@example.com' },
    ];

    const res = await POST(makeRequest({ email: 'real_person@example.com' }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: 'ACCOUNT_RECOVERY_REQUIRED',
      error: expect.stringContaining('staff-assisted account recovery'),
    });
    expect(supabaseSignUp).not.toHaveBeenCalled();
    expect(state.applicationCreates).toEqual([]);
  });

  it('treats an obfuscated existing-user signUp (empty identities) as "already registered"', async () => {
    supabaseSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-existing', email: 'applicant@example.com', identities: [] },
        session: null,
      },
      error: null,
    } as never);

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already exists/i);
  });

  function p2002EmailCollision() {
    return {
      code: 'P2002',
      meta: { target: ['email'] },
      message: 'Unique constraint failed on the fields: (`email`)',
    };
  }

  it('compensates only the freshly created Auth identity after a raced app-email collision', async () => {
    state.userUpsertError = p2002EmailCollision();
    state.authAdminUser = { id: 'user-test-1', email: 'applicant@example.com' };

    const res = await POST(makeRequest({ email: 'Applicant@Example.COM' }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: 'ACCOUNT_RECOVERY_REQUIRED',
      error: expect.stringContaining('staff-assisted account recovery'),
    });
    expect(state.authAdminLookups).toEqual(['user-test-1']);
    expect(state.authDeletes).toEqual(['user-test-1']);
    expect(state.profileUpserts).toEqual([]);
    expect(state.enrollmentUpserts).toEqual([]);
    expect(state.applicationCreates).toEqual([]);
    expect(state.screeningUpserts).toEqual([]);
    expect(state.partnerReferralUpserts).toEqual([]);
    expect(sendApplicationConfirmationEmail).not.toHaveBeenCalled();
    expect(sendNewApplicationAdminEmail).not.toHaveBeenCalled();
    expect(captureApiError).toHaveBeenCalledWith(
      expect.any(Error),
      {
        route: 'POST /api/apply/signup#authCompensation',
        extra: {
          collision: 'app_email_unique',
          compensation: 'deleted',
        },
      },
    );
    expect(JSON.stringify(vi.mocked(captureApiError).mock.calls)).not.toContain('applicant@example.com');
    expect(JSON.stringify(vi.mocked(captureApiError).mock.calls)).not.toContain('user-test-1');
  });

  it('returns the same generic recovery response when guarded compensation fails', async () => {
    state.userUpsertError = p2002EmailCollision();
    state.authAdminUser = { id: 'user-test-1', email: 'applicant@example.com' };
    state.authDeleteError = { message: 'provider delete unavailable' };

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      code: 'ACCOUNT_RECOVERY_REQUIRED',
      error: expect.stringContaining('staff-assisted account recovery'),
    });
    expect(state.authDeletes).toEqual(['user-test-1']);
  });

  it('does not delete when the provider identity email does not exactly match the request', async () => {
    state.userUpsertError = p2002EmailCollision();
    state.authAdminUser = { id: 'user-test-1', email: 'different@example.com' };

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    expect(state.authAdminLookups).toEqual(['user-test-1']);
    expect(state.authDeletes).toEqual([]);
  });

  it('does not delete when the exact-ID provider lookup returns another identity', async () => {
    state.userUpsertError = p2002EmailCollision();
    state.authAdminUser = { id: 'different-user', email: 'applicant@example.com' };

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    expect(state.authAdminLookups).toEqual(['user-test-1']);
    expect(state.authDeletes).toEqual([]);
  });

  it('does not delete when the exact-ID provider lookup fails', async () => {
    state.userUpsertError = p2002EmailCollision();
    state.authAdminLookupError = { message: 'provider lookup unavailable' };

    const res = await POST(makeRequest());

    expect(res.status).toBe(409);
    expect(state.authAdminLookups).toEqual(['user-test-1']);
    expect(state.authDeletes).toEqual([]);
    expect(captureApiError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({ compensation: 'guard_failed' }),
      }),
    );
  });

  it('does not compensate an obfuscated reused Auth identity', async () => {
    supabaseSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-existing', email: 'applicant@example.com', identities: [] },
        session: null,
      },
      error: null,
    } as never);

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(state.authAdminLookups).toEqual([]);
    expect(state.authDeletes).toEqual([]);
  });

  it('does not compensate a newly returned identity for a non-collision database failure', async () => {
    state.userUpsertError = { code: 'P2024', message: 'connection pool timeout' };
    state.authAdminUser = { id: 'user-test-1', email: 'applicant@example.com' };

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(state.authAdminLookups).toEqual([]);
    expect(state.authDeletes).toEqual([]);
  });
});
