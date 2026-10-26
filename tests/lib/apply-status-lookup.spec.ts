import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUsers: vi.fn(),
  findApplication: vi.fn(),
  scopedOrgs: [] as string[],
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findMany: mocks.findUsers } },
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  crossTenantOK: (fn: () => Promise<unknown>) => fn(),
  withTenantScope: (orgId: string, fn: (db: { application: { findFirst: typeof mocks.findApplication } }) => Promise<unknown>) => {
    mocks.scopedOrgs.push(orgId);
    return fn({ application: { findFirst: mocks.findApplication } });
  },
}));

import { EXACT_EMAIL_CANDIDATE_LIMIT } from '@/lib/db/exactEmailMatch';
import {
  issueApplicationStatusLinkToken,
  verifyApplicationStatusLinkToken,
} from '@/lib/apply/statusLinkToken';
import {
  counselorNameForStatusLink,
  findApplicationForStatusLookup,
  loadApplicationForStatusLink,
  type StatusLinkApplication,
} from '@/lib/apply/statusLookup';

/**
 * #2760 added the public status-link read and first-name counselor display.
 * Route/page suites mock these helpers, so an ILIKE neighbour, a changed
 * email, or a last-name leak would not fail those tests.
 */

const OWNER = {
  id: 'user-owner',
  email: 'm_johnson@example.org',
  fullName: 'M Johnson',
  organizationId: 'org-owner',
};
const NEIGHBOUR = {
  id: 'user-neighbour',
  email: 'mrjohnson@example.org',
  fullName: 'Mr Johnson',
  organizationId: 'org-neighbour',
};

function application(
  overrides: Partial<StatusLinkApplication> = {},
  user: Partial<StatusLinkApplication['user']> = {},
): StatusLinkApplication {
  return {
    id: 'app-1',
    status: 'PENDING',
    programInterest: 'it-support',
    submittedAt: new Date('2026-10-01T12:00:00Z'),
    createdAt: new Date('2026-10-01T11:00:00Z'),
    ...overrides,
    user: {
      id: OWNER.id,
      email: OWNER.email,
      fullName: OWNER.fullName,
      organizationId: OWNER.organizationId,
      enrolledProgram: null,
      enrolledAt: null,
      assessmentCompleted: false,
      courseEnrollments: [],
      counselorAssignments: [],
      ...user,
    },
  };
}

function verifiedToken(email: string, applicationId = 'app-1', organizationId = OWNER.organizationId) {
  const token = issueApplicationStatusLinkToken({ applicationId, organizationId, email });
  const verified = verifyApplicationStatusLinkToken(token);
  if (!verified.ok) throw new Error('expected a valid status-link token');
  return verified;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scopedOrgs.length = 0;
  vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', 'status-lookup-test-secret');
  mocks.findUsers.mockResolvedValue([]);
  mocks.findApplication.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('findApplicationForStatusLookup', () => {
  it('does not query when the visitor typed only whitespace', async () => {
    expect(await findApplicationForStatusLookup('   ')).toBeNull();
    expect(mocks.findUsers).not.toHaveBeenCalled();
    expect(mocks.findApplication).not.toHaveBeenCalled();
  });

  it('refuses an ILIKE neighbour and never reads that tenant\'s applications', async () => {
    mocks.findUsers.mockResolvedValue([NEIGHBOUR]);
    expect(await findApplicationForStatusLookup(OWNER.email)).toBeNull();
    expect(mocks.findUsers).toHaveBeenCalledWith(expect.objectContaining({
      take: EXACT_EMAIL_CANDIDATE_LIMIT,
      where: expect.objectContaining({
        deletedAt: null,
        email: { equals: OWNER.email, mode: 'insensitive' },
      }),
    }));
    expect(mocks.findApplication).not.toHaveBeenCalled();
    expect(mocks.scopedOrgs).toEqual([]);
  });

  it('keeps the exact address among ILIKE hits and scopes the application read to that org', async () => {
    mocks.findUsers.mockResolvedValue([NEIGHBOUR, OWNER]);
    mocks.findApplication.mockResolvedValue({ id: 'app-owner' });
    expect(await findApplicationForStatusLookup('  M_JOHNSON@Example.org ')).toEqual({
      applicationId: 'app-owner',
      userId: OWNER.id,
      organizationId: OWNER.organizationId,
      email: OWNER.email,
      fullName: OWNER.fullName,
    });
    expect(mocks.scopedOrgs).toEqual([OWNER.organizationId]);
    expect(mocks.findApplication).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: OWNER.id },
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('returns null when the exact user has no application', async () => {
    mocks.findUsers.mockResolvedValue([OWNER]);
    mocks.findApplication.mockResolvedValue(null);
    expect(await findApplicationForStatusLookup(OWNER.email)).toBeNull();
    expect(mocks.scopedOrgs).toEqual([OWNER.organizationId]);
  });
});

describe('loadApplicationForStatusLink', () => {
  it('returns the row when the token email hash still matches the account', async () => {
    const row = application();
    mocks.findApplication.mockResolvedValue(row);
    expect(await loadApplicationForStatusLink(verifiedToken(OWNER.email))).toEqual(row);
    expect(mocks.scopedOrgs).toEqual([OWNER.organizationId]);
    expect(mocks.findApplication).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'app-1', user: { deletedAt: null } },
    }));
  });

  it('refuses to render when the account email changed after the link was minted', async () => {
    mocks.findApplication.mockResolvedValue(application({}, { email: 'new-address@example.org' }));
    expect(await loadApplicationForStatusLink(verifiedToken(OWNER.email))).toBeNull();
  });

  it('returns null when the token\'s application is gone', async () => {
    mocks.findApplication.mockResolvedValue(null);
    expect(await loadApplicationForStatusLink(verifiedToken(OWNER.email, 'app-missing', 'org-other'))).toBeNull();
    expect(mocks.scopedOrgs).toEqual(['org-other']);
  });
});

describe('counselorNameForStatusLink', () => {
  it('shows only the first name to an unauthenticated link holder', () => {
    expect(counselorNameForStatusLink(application({}, {
      counselorAssignments: [{ counselor: { user: { fullName: '  Casey   Counselor  ' } } }],
    }))).toBe('Casey');
  });

  it('keeps a single-token or hyphenated given name and hides an empty assignment', () => {
    expect(counselorNameForStatusLink(application({}, {
      counselorAssignments: [{ counselor: { user: { fullName: 'Casey' } } }],
    }))).toBe('Casey');
    expect(counselorNameForStatusLink(application({}, {
      counselorAssignments: [{ counselor: { user: { fullName: 'Mary-Jane Smith' } } }],
    }))).toBe('Mary-Jane');
    expect(counselorNameForStatusLink(application())).toBeNull();
    expect(counselorNameForStatusLink(application({}, {
      counselorAssignments: [{ counselor: { user: { fullName: '   ' } } }],
    }))).toBeNull();
  });
});
