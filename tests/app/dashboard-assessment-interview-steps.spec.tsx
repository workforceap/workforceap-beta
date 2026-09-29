import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import en from '@/messages/en.json';

/**
 * WAP-197 item 6: the pre-screening form and the interview request rendered
 * only inside the legacy home's never-shown `!homeOnly` block, so no member
 * could reach /api/member/pre-screening (the only writer of
 * PreScreeningResponse, which /admin/members/interview-ready lists) or
 * /api/member/interview-request. They now live on /dashboard/assessment
 * after the completed preassessment, which is where the member application
 * status next steps link (#pre-screening, #interview). The page renders for
 * real; auth and the database are stubbed and fetch is the API stub.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findUnique: vi.fn(),
  fetch: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => { throw new Error(`redirect:${href}`); },
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn(async () => ({})) }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string, values?: Record<string, string>) => {
    let node: unknown = (en as Record<string, unknown>)[ns];
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    if (typeof node !== 'string') return `${ns}.${key}`;
    return node.replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? `{${name}}`);
  }),
}));
vi.mock('@/components/portal/AssessmentForm', () => ({ default: () => <div data-testid="assessment-form" /> }));

import AssessmentPage from '@/app/(portal)/dashboard/assessment/page';

type Intake = {
  assessmentCompleted?: boolean;
  preScreeningResponse?: { id: string } | null;
  interviewEligible?: boolean;
  interviewRequestedAt?: Date | null;
  interviewCompletedAt?: Date | null;
};

function member(over: Intake = {}) {
  return {
    id: 'member-1',
    fullName: 'Pat Member',
    phone: '5125550100',
    assessmentCompleted: true,
    assessmentScorePct: 80,
    assessmentCompletedAt: new Date('2026-09-01T15:00:00Z'),
    programInterest: null,
    profile: null,
    courseEnrollments: [],
    preScreeningResponse: null,
    interviewEligible: false,
    interviewRequestedAt: null,
    interviewCompletedAt: null,
    ...over,
  };
}

async function renderPage(over: Intake = {}) {
  mocks.findUnique.mockResolvedValue(member(over));
  const page = await AssessmentPage({ searchParams: Promise.resolve({}) });
  return render(page);
}

beforeEach(() => {
  mocks.getUser.mockResolvedValue({ id: 'member-1' });
  mocks.fetch.mockReset();
  mocks.refresh.mockReset();
  mocks.fetch.mockResolvedValue(Response.json({ draft: null }));
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('/dashboard/assessment interview steps (WAP-197)', () => {
  it('loads the pre-screening draft query from the member row', async () => {
    await renderPage();
    const args = mocks.findUnique.mock.calls[0][0];
    expect(args.include.preScreeningResponse).toEqual({ select: { id: true } });
  });

  it('shows no pre-screening before the preassessment is complete (the route refuses it)', async () => {
    await renderPage({ assessmentCompleted: false });
    expect(screen.getByTestId('assessment-form')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pre-screening' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Interview' })).toBeNull();
  });

  it('mounts the working pre-screening form in #pre-screening after the preassessment', async () => {
    const { container } = await renderPage();
    const section = screen.getByRole('region', { name: 'Pre-screening' });
    expect(section.id).toBe('pre-screening');
    expect(container.querySelectorAll('#pre-screening')).toHaveLength(1);
    expect(within(section).getByRole('combobox', { name: 'Current employment status' })).toBeInTheDocument();
    expect(within(section).getByRole('textbox', { name: /Biggest barrier/ })).toBeInTheDocument();
    expect(within(section).getByRole('progressbar', { name: 'Pre-screening completion' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Submit pre-screening' }).className).toContain('wa-kit-cta');
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith('/api/member/pre-screening/draft'));
    expect(screen.queryByRole('region', { name: 'Interview' })).toBeNull();
    // Kit page: no Material Symbols ligatures and no legacy --color-* refs in the form.
    expect(container.querySelector('.material-symbols-outlined')).toBeNull();
    expect(section.innerHTML).not.toMatch(/--color-/);
  });

  it('submits to /api/member/pre-screening and refreshes the page on success', async () => {
    await renderPage();
    const section = screen.getByRole('region', { name: 'Pre-screening' });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith('/api/member/pre-screening/draft'));
    mocks.fetch.mockResolvedValue(Response.json({ ok: true }));
    fireEvent.change(within(section).getByRole('textbox', { name: /Biggest barrier/ }), { target: { value: 'Childcare' } });
    fireEvent.click(within(section).getByRole('radio', { name: 'No' }));
    fireEvent.submit(within(section).getByRole('button', { name: 'Submit pre-screening' }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    const post = mocks.fetch.mock.calls.find(([url, init]) => url === '/api/member/pre-screening' && init?.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ barrier: 'Childcare', workforceAssistance: false });
  });

  it('keeps a server validation sentence visible when the submit is refused', async () => {
    await renderPage();
    const section = screen.getByRole('region', { name: 'Pre-screening' });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith('/api/member/pre-screening/draft'));
    mocks.fetch.mockResolvedValue(Response.json({ error: 'Pre-screening already submitted.' }, { status: 400 }));
    fireEvent.click(within(section).getByRole('radio', { name: 'Yes' }));
    fireEvent.submit(within(section).getByRole('button', { name: 'Submit pre-screening' }).closest('form') as HTMLFormElement);
    expect(await within(section).findByRole('alert')).toHaveTextContent('Pre-screening already submitted.');
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('after pre-screening, before eligibility: says a counselor will review, no request button', async () => {
    await renderPage({ preScreeningResponse: { id: 'ps-1' } });
    expect(screen.queryByRole('region', { name: 'Pre-screening' })).toBeNull();
    const section = screen.getByRole('region', { name: 'Interview' });
    expect(section).toHaveTextContent('Pre-screening submitted. A counselor will review it');
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('interview eligible: #interview offers the interview request', async () => {
    await renderPage({ preScreeningResponse: { id: 'ps-1' }, interviewEligible: true });
    const section = screen.getByRole('region', { name: 'Interview' });
    expect(section.id).toBe('interview');
    expect(within(section).getByRole('button', { name: 'Request interview' })).toBeInTheDocument();
    expect(section).toHaveTextContent(en.dashboard.interviewSteps.eligible);
  });

  it('interview requested: shows when it was received instead of the button', async () => {
    await renderPage({
      preScreeningResponse: { id: 'ps-1' },
      interviewEligible: true,
      interviewRequestedAt: new Date('2026-09-10T15:00:00Z'),
    });
    const section = screen.getByRole('region', { name: 'Interview' });
    expect(section).toHaveTextContent('We received your interview request on');
    expect(section).not.toHaveTextContent('{date}');
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('interview completed: the step is gone', async () => {
    await renderPage({
      preScreeningResponse: { id: 'ps-1' },
      interviewEligible: true,
      interviewCompletedAt: new Date('2026-09-12T15:00:00Z'),
    });
    expect(screen.queryByRole('region', { name: 'Interview' })).toBeNull();
    expect(screen.getByText('Preassessment complete')).toBeInTheDocument();
  });
});

describe('interview step and recap copy catalogs (WAP-197)', () => {
  it('every locale carries the same interviewSteps keys and weeklyRecapOpenGoals', async () => {
    const catalogs = {
      en,
      es: (await import('@/messages/es.json')).default,
      fr: (await import('@/messages/fr.json')).default,
      pt: (await import('@/messages/pt.json')).default,
    };
    const keys = Object.keys(en.dashboard.interviewSteps).sort();
    for (const [locale, messages] of Object.entries(catalogs)) {
      const steps = messages.dashboard.interviewSteps as Record<string, string>;
      expect(Object.keys(steps).sort(), locale).toEqual(keys);
      for (const value of Object.values(steps)) expect(value.trim(), locale).not.toBe('');
      expect(steps.requested, locale).toContain('{date}');
      expect(messages.dashboard.weeklyRecapOpenGoals.trim(), locale).not.toBe('');
    }
  });
});
