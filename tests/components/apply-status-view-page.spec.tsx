import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { issueApplicationStatusLinkToken } from '@/lib/apply/statusLinkToken';
import type { StatusLinkApplication } from '@/lib/apply/statusLookup';

/**
 * Product call 28a: the emailed link opens a page that shows the real status
 * with the member dashboard's own vocabulary, and a calm "request a new one"
 * page for anything that does not verify.
 */
const apply = en.apply as unknown as Record<string, unknown>;
function translate(key: string, vars: Record<string, string | number> = {}) {
  const raw = apply[key];
  if (typeof raw !== 'string') throw new Error(`missing apply.${key}`);
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

vi.mock('next-intl/server', () => ({
  getTranslations: async () => translate,
  getLocale: async () => 'en',
}));
vi.mock('@/components/LocalizedLink', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
vi.mock('@/components/Footer', () => ({ default: () => null }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withSystemGuc: (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn(), captureApiResponseError: vi.fn() }));
vi.mock('@/lib/apply/statusLookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apply/statusLookup')>();
  return { ...actual, loadApplicationForStatusLink: vi.fn() };
});

import ApplyStatusViewPage from '@/app/apply/status/view/page';
import { loadApplicationForStatusLink } from '@/lib/apply/statusLookup';
import { auditLog } from '@/lib/audit';

const NOW = new Date('2026-09-22T16:00:00Z');

function application(overrides: Partial<StatusLinkApplication> = {}, user: Partial<StatusLinkApplication['user']> = {}): StatusLinkApplication {
  return {
    id: 'app-1',
    status: 'PENDING',
    programInterest: 'it-support',
    submittedAt: new Date('2026-09-15T12:00:00Z'),
    createdAt: new Date('2026-09-15T11:00:00Z'),
    ...overrides,
    user: {
      id: 'user-1',
      email: 'ada@example.org',
      fullName: 'Ada Applicant',
      organizationId: 'org-1',
      enrolledProgram: null,
      enrolledAt: null,
      assessmentCompleted: false,
      counselorAssignments: [{ counselor: { user: { fullName: 'Casey Counselor' } } }],
      ...user,
    },
  };
}

function tokenFor(app: StatusLinkApplication, opts: { now?: Date; ttlMinutes?: number } = {}) {
  return issueApplicationStatusLinkToken({
    applicationId: app.id,
    organizationId: app.user.organizationId,
    email: app.user.email,
    now: opts.now ?? new Date(),
    ttlMinutes: opts.ttlMinutes,
  });
}

async function mount(token: string | undefined) {
  render(await ApplyStatusViewPage({ searchParams: Promise.resolve(token === undefined ? {} : { t: token }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', 'page-test-secret');
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('/apply/status/view', () => {
  it('renders a pending application with the dashboard label, next step, counselor and program', async () => {
    const app = application();
    vi.mocked(loadApplicationForStatusLink).mockResolvedValue(app);
    await mount(tokenFor(app));

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Applied');
    expect(screen.getByText(/Our team is reviewing your application\. Watch your email for next steps from a counselor\./)).toBeInTheDocument();
    expect(screen.getByText('Casey Counselor')).toBeInTheDocument();
    expect(screen.getByText('IT Support')).toBeInTheDocument();
    expect(screen.getByText('September 15, 2026')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Application progress' })).toBeInTheDocument();
    expect(screen.getByText('Applied', { selector: '.apply-status-step.active .apply-status-label' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.apply.statusLoginCta })).toHaveAttribute('href', '/login?redirectTo=/dashboard');
    expect(screen.getByRole('link', { name: en.apply.statusViewRequestAgain })).toHaveAttribute('href', '/apply/status');
    expect(document.body.textContent).not.toMatch(/ada@example\.org/);
    expect(document.body.textContent).not.toMatch(/SMS|text message|business day/i);

    const verified = vi.mocked(loadApplicationForStatusLink).mock.calls[0][0];
    expect(verified).toMatchObject({ ok: true, applicationId: 'app-1', organizationId: 'org-1' });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user-1',
      action: 'application_status_viewed',
      targetType: 'Application',
      targetId: 'app-1',
      metadata: { orgId: 'org-1', status: 'PENDING' },
    }));
  });

  it.each([
    ['NEEDS_INFO', 'Under review', /We may need a bit more information/],
    ['APPROVED', 'Approved', /Choose your program and complete your profile/],
    ['DENIED', 'Application closed', /unable to move forward with this application/],
  ] as const)('shows %s as "%s" with its next step', async (status, label, next) => {
    const app = application({ status }, { counselorAssignments: [] });
    vi.mocked(loadApplicationForStatusLink).mockResolvedValue(app);
    await mount(tokenFor(app));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(label);
    expect(screen.getByText(next)).toBeInTheDocument();
    expect(screen.queryByText(en.apply.statusViewCounselorLabel, { exact: false })).not.toBeInTheDocument();
    if (status === 'DENIED') {
      expect(screen.queryByRole('list', { name: 'Application progress' })).not.toBeInTheDocument();
    }
  });

  it('shows the enrolled stage once the member has a program, like the dashboard does', async () => {
    const app = application({ status: 'APPROVED' }, { enrolledProgram: 'it-support', enrolledAt: new Date('2026-09-20T00:00:00Z') });
    vi.mocked(loadApplicationForStatusLink).mockResolvedValue(app);
    await mount(tokenFor(app));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Program selected');
  });

  it('renders the calm expired page for an expired token without touching the database', async () => {
    const app = application();
    const expired = tokenFor(app, { now: new Date(NOW.getTime() - 31 * 60_000) });
    await mount(expired);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired');
    expect(screen.getByText(/Status links work for 30 minutes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.apply.statusViewExpiredCta })).toHaveAttribute('href', '/apply/status');
    expect(loadApplicationForStatusLink).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/error|invalid|exception/i);
  });

  it.each([
    ['a tampered token', (t: string) => `${t.slice(0, -2)}xx`],
    ['garbage', () => 'not-a-token'],
    ['no token', () => undefined],
  ])('renders the same calm page for %s', async (_label, mutate) => {
    const app = application();
    await mount(mutate(tokenFor(app)));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired');
    expect(loadApplicationForStatusLink).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/error|invalid|exception/i);
  });

  it('renders the calm page when a valid token no longer matches a row (email changed or application gone)', async () => {
    const app = application();
    vi.mocked(loadApplicationForStatusLink).mockResolvedValue(null);
    await mount(tokenFor(app));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired');
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('renders the calm page instead of throwing when the read fails', async () => {
    const app = application();
    vi.mocked(loadApplicationForStatusLink).mockRejectedValue(new Error('db down'));
    await mount(tokenFor(app));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired');
  });
});
