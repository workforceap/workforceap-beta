import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import CounselorDetail from '@/app/(portal)/dashboard/counselor/[id]/page';
import LabPage from '@/app/(portal)/dashboard/learning/labs/[labId]/page';
import TrainingBridgePage from '@/app/(portal)/dashboard/ai-tools/training-bridge/page';

const stubs = vi.hoisted(() => ({ user: vi.fn(), session: vi.fn(), assessment: vi.fn(), lab: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: stubs.user }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { aIToolResult: { findUnique: stubs.session, findFirst: stubs.assessment } } }));
vi.mock('@/lib/member/labWorkspace', () => ({ loadLabWorkspace: stubs.lab }));
vi.mock('@/components/portal/MemberLabWorkspace', () => ({ MemberLabWorkspace: () => <h1>Assigned lab evidence</h1> }));
vi.mock('@/app/seo', () => ({ buildPageMetadata: () => ({}), buildPageMetadataAsync: async () => ({}) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

beforeEach(() => { vi.resetAllMocks(); stubs.user.mockResolvedValue({ id: 'synthetic-member' }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const show = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);

describe('member dynamic route boundaries', () => {
  it('scopes a counselor session to the signed-in member and renders the saved result', async () => {
    stubs.session.mockResolvedValue({ id: 'session-1', output: 'Saved practice feedback', createdAt: new Date('2026-10-01T12:00:00Z') });
    show(await CounselorDetail({ params: Promise.resolve({ id: 'session-1' }) }));
    expect(stubs.session).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-1', userId: 'synthetic-member', toolType: 'career_counselor' } }));
    expect(screen.getAllByText('Saved practice feedback').length).toBeGreaterThan(0);
  });
  it('does not render an unavailable or foreign counselor session', async () => {
    stubs.session.mockResolvedValue(null);
    await expect(CounselorDetail({ params: Promise.resolve({ id: 'foreign' }) })).rejects.toThrow('NOT_FOUND');
  });
  it('redirects signed-out session visitors before reading saved data', async () => {
    stubs.user.mockResolvedValue(null);
    await expect(CounselorDetail({ params: Promise.resolve({ id: 'session-1' }) })).rejects.toThrow('REDIRECT:');
    expect(stubs.session).not.toHaveBeenCalled();
  });
  it('rejects invalid lab identifiers before loading member state', async () => {
    await expect(LabPage({ params: Promise.resolve({ labId: '../other' }) })).rejects.toThrow('NOT_FOUND');
    expect(stubs.lab).not.toHaveBeenCalled();
  });
  it('keeps unavailable labs distinct from load failures and assigned work', async () => {
    stubs.lab.mockResolvedValue(null);
    const view = show(await LabPage({ params: Promise.resolve({ labId: 'ticket-triage' }) }));
    expect(screen.getByRole('heading', { name: /not available in your assignment/i })).toBeVisible();
    view.unmount();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubs.lab.mockRejectedValue(new Error('database unavailable'));
    const failed = show(await LabPage({ params: Promise.resolve({ labId: 'ticket-triage' }) }));
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/dashboard/learning/labs/ticket-triage');
    failed.unmount();
    stubs.lab.mockResolvedValue({ programSlug: 'assigned', curriculumVersion: 'v1', lab: { id: 'ticket-triage', contentVersion: 'v1' } });
    show(await LabPage({ params: Promise.resolve({ labId: 'ticket-triage' }) }));
    expect(screen.getByRole('heading', { name: 'Assigned lab evidence' })).toBeVisible();
  });
});

describe('training bridge saved assessment', () => {
  it('shows an honest unassessed state and a working Skill Mapper destination', async () => {
    stubs.assessment.mockResolvedValue(null);
    show(await TrainingBridgePage());
    expect(screen.getByRole('heading', { name: /Run Skill Mapper first/i })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Skill Mapper' })).toHaveAttribute('href', '/dashboard/ai-tools/skill-mapper');
    expect(stubs.assessment).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'synthetic-member' }) }));
  });
  it('marks a failed lookup so browser acceptance cannot count it as a passing empty state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubs.assessment.mockRejectedValue(new Error('database unavailable'));
    const view = show(await TrainingBridgePage());
    expect(view.container.querySelector('[data-portal-error-state="training-bridge-assessment-load"]')).not.toBeNull();
  });
});
