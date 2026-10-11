import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { issueApplicationStatusLinkToken } from '@/lib/apply/statusLinkToken';

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), auditLog: vi.fn() }));

vi.mock('@/lib/db/prisma', () => ({ prisma: { application: { findFirst: mocks.findFirst } } }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn() }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withSystemGuc: (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/components/Footer', () => ({ default: () => null }));
vi.mock('@/components/LocalizedLink', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string, vars: Record<string, string | number> = {}) => {
    const value = (en.apply as Record<string, unknown>)[key];
    if (typeof value !== 'string') throw new Error(`missing apply.${key}`);
    return value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
  },
}));

import ApplyStatusViewPage from '@/app/apply/status/view/page';

type Select = Record<string, boolean | { select: Select; where?: Record<string, unknown> }>;

// Return only fields the actual lookup asks Prisma to select. Relation filters
// are applied before projection so missing selection/scoping breaks the page.
function project(row: Record<string, unknown>, select: Select): Record<string, unknown> {
  return Object.fromEntries(Object.entries(select).map(([key, spec]) => {
    const value = row[key];
    if (spec === true || value == null) return [key, value];
    if (spec === false) return [key, undefined];
    if (Array.isArray(value)) {
      const filtered = value.filter((entry) => Object.entries(spec.where ?? {}).every(([field, expected]) => entry[field] === expected));
      return [key, filtered.map((entry) => project(entry, spec.select))];
    }
    return [key, project(value as Record<string, unknown>, spec.select)];
  }));
}

const enrolledAt = new Date('2026-09-20T12:00:00Z');
const primaryEnrollment = { id: 'enrollment-primary', programSlug: 'it-support', isPrimary: true, enrolledAt, organizationId: 'org-a' };

function application(userOverrides: Record<string, unknown> = {}) {
  return {
    id: 'application-1', status: 'APPROVED', programInterest: 'it-support',
    submittedAt: new Date('2026-09-15T12:00:00Z'), createdAt: new Date('2026-09-15T11:00:00Z'),
    user: {
      id: 'member-1', email: 'member@example.test', fullName: 'Pat Example', organizationId: 'org-a', deletedAt: null,
      enrolledProgram: null, enrolledAt: null, assessmentCompleted: false,
      courseEnrollments: [primaryEnrollment], counselorAssignments: [], ...userOverrides,
    },
  };
}

async function mount(userOverrides: Record<string, unknown> = {}, tokenOrg = 'org-a') {
  const row = application(userOverrides);
  mocks.findFirst.mockImplementation(async ({ where, select }: { where: { id: string; user: { organizationId: string; deletedAt: null } }; select: Select }) => {
    if (where.id !== row.id || where.user.organizationId !== row.user.organizationId || row.user.deletedAt !== null) return null;
    return project(row, select);
  });
  const token = issueApplicationStatusLinkToken({ applicationId: row.id, organizationId: tokenOrg, email: 'member@example.test' });
  render(await ApplyStatusViewPage({ searchParams: Promise.resolve({ t: token }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', 'synthetic-status-enrollment-secret');
  mocks.auditLog.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('emailed status follows the dashboard enrollment policy', () => {
  it('shows a primary enrollment when the legacy pointer is missing', async () => {
    await mount();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Program selected');
    expect(screen.getByText(/Complete your Training Preassessment/)).toBeInTheDocument();
    expect(screen.getByText('Program selected', { selector: '.apply-status-step.active .apply-status-label' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Choose your program and complete your profile/);
  });

  it.each([null, 'old-program'])('shows completed preassessment from the primary enrollment with legacy pointer %s', async (enrolledProgram) => {
    await mount({ enrolledProgram, assessmentCompleted: true });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Training preassessment complete');
    expect(screen.getByText(/Your Training Preassessment is complete/)).toBeInTheDocument();
  });

  it('keeps an unassigned progress-only enrollment from claiming a selected program', async () => {
    await mount({ courseEnrollments: [{ ...primaryEnrollment, isPrimary: false }] });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Approved$/);
    expect(screen.getByText(/Choose your program and complete your profile/)).toBeInTheDocument();
  });

  it('preserves the legacy fallback while enrollments have not been backfilled', async () => {
    await mount({ courseEnrollments: [], enrolledProgram: 'it-support', enrolledAt });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Program selected');
  });

  it('does not treat another organization\'s enrollment as this member\'s assignment', async () => {
    await mount({ courseEnrollments: [{ ...primaryEnrollment, organizationId: 'org-b' }] });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Approved$/);
  });

  it('retains the signed-link tenant and email checks', async () => {
    await mount({}, 'org-b');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired');
    expect(mocks.auditLog).not.toHaveBeenCalled();
    cleanup();
    await mount({ email: 'changed@example.test' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired');
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});
