import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { SavedSkillMapperRun } from '@/lib/member/skillMapperRun';
import messages from '@/messages/en.json';
import CounselorDetail from '@/app/(portal)/dashboard/counselor/[id]/page';
import LabPage from '@/app/(portal)/dashboard/learning/labs/[labId]/page';
import TrainingBridgePage from '@/app/(portal)/dashboard/ai-tools/training-bridge/page';

const stubs = vi.hoisted(() => ({ user: vi.fn(), session: vi.fn(), skillContext: vi.fn(), lab: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: stubs.user }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { aIToolResult: { findUnique: stubs.session } } }));
vi.mock('@/lib/member/loadSkillMapperContext', () => ({ loadSkillMapperContext: stubs.skillContext }));
vi.mock('@/lib/member/labWorkspace', () => ({ loadLabWorkspace: stubs.lab }));
vi.mock('@/components/portal/MemberLabWorkspace', () => ({ MemberLabWorkspace: () => <h1>Assigned lab evidence</h1> }));
vi.mock('@/app/seo', () => ({ buildPageMetadata: () => ({}), buildPageMetadataAsync: async () => ({}) }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

beforeEach(() => { vi.resetAllMocks(); stubs.user.mockResolvedValue({ id: 'synthetic-member' }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const show = (ui: ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>);

describe('member saved-session route boundary', () => {
  it('reads only the signed-in member career-counselor result and renders the saved text', async () => {
    stubs.session.mockResolvedValue({ id: 'session-1', output: 'Saved practice feedback', createdAt: new Date('2026-10-01T12:00:00Z') });
    show(await CounselorDetail({ params: Promise.resolve({ id: 'session-1' }) }));
    expect(stubs.session).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-1', userId: 'synthetic-member', toolType: 'career_counselor' } }));
    expect(screen.getAllByText('Saved practice feedback').length).toBeGreaterThan(0);
  });
  it('returns not-found for an inaccessible result without falling back to another session', async () => {
    stubs.session.mockResolvedValue(null);
    await expect(CounselorDetail({ params: Promise.resolve({ id: 'foreign-result' }) })).rejects.toThrow('NOT_FOUND');
    expect(stubs.session).toHaveBeenCalledTimes(1);
    expect(stubs.session).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-result', userId: 'synthetic-member', toolType: 'career_counselor' } }));
  });
  it('redirects signed-out visitors before reading saved data', async () => {
    stubs.user.mockResolvedValue(null);
    await expect(CounselorDetail({ params: Promise.resolve({ id: 'session-1' }) })).rejects.toThrow('REDIRECT:/login?redirectTo=/dashboard/counselor');
    expect(stubs.session).not.toHaveBeenCalled();
  });
});

describe('member lab route boundary', () => {
  it('rejects a malformed lab before reading identity or assignment', async () => {
    await expect(LabPage({ params: Promise.resolve({ labId: '../other' }) })).rejects.toThrow('NOT_FOUND');
    expect(stubs.user).not.toHaveBeenCalled();
    expect(stubs.lab).not.toHaveBeenCalled();
  });
  it('redirects signed-out visitors without querying lab assignment', async () => {
    stubs.user.mockResolvedValue(null);
    await expect(LabPage({ params: Promise.resolve({ labId: 'ticket-triage' }) })).rejects.toThrow('REDIRECT:/login?redirectTo=%2Fdashboard%2Flearning%2Flabs%2Fticket-triage');
    expect(stubs.lab).not.toHaveBeenCalled();
  });
  it('keeps an unavailable assignment, load failure and assigned workspace visibly distinct', async () => {
    stubs.lab.mockResolvedValue(null);
    const unavailable = show(await LabPage({ params: Promise.resolve({ labId: 'ticket-triage' }) }));
    expect(stubs.lab).toHaveBeenCalledWith({ userId: 'synthetic-member', labId: 'ticket-triage' });
    expect(screen.getByRole('heading', { name: 'This lab is not available in your assignment' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to my program' })).toHaveAttribute('href', '/dashboard/program');
    unavailable.unmount();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubs.lab.mockRejectedValue(new Error('database unavailable'));
    const failed = show(await LabPage({ params: Promise.resolve({ labId: 'ticket-triage' }) }));
    expect(screen.getByRole('heading', { name: 'Your lab could not be loaded' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/dashboard/learning/labs/ticket-triage');
    expect(screen.queryByRole('heading', { name: 'This lab is not available in your assignment' })).toBeNull();
    failed.unmount();
    stubs.lab.mockResolvedValue({ programSlug: 'assigned', curriculumVersion: 'v1', lab: { id: 'ticket-triage', contentVersion: 'v1' } });
    show(await LabPage({ params: Promise.resolve({ labId: 'ticket-triage' }) }));
    expect(screen.getByRole('heading', { name: 'Assigned lab evidence' })).toBeVisible();
  });
});

describe('Training Bridge route uses current owned lookup context', () => {
  it('passes the authenticated member and explicit result selection through to the rendered handoff', async () => {
    const selected: SavedSkillMapperRun = { id: 'owned-old', occupationTitle: 'Computer User Support Specialists', occupationCode: '15-1232.00', skills: [{ name: 'Troubleshooting', score: 90 }], radarAxes: [{ axis: 'Engineering', value: 80 }], createdAt: '2026-10-20T12:00:00Z', demo: false };
    stubs.skillContext.mockResolvedValue({ selected, recent: [], selectionUnavailable: false });
    show(await TrainingBridgePage({ searchParams: Promise.resolve({ result: 'owned-old' }) }));
    expect(stubs.skillContext).toHaveBeenCalledWith('synthetic-member', 'owned-old');
    expect(screen.getByRole('link', { name: 'Open this skill comparison' })).toHaveAttribute('href', '/dashboard/ai-tools/skill-mapper?result=owned-old');
    expect(screen.getByRole('combobox', { name: 'Choose a saved Skill Mapper lookup' })).toHaveValue('owned-old');
  });
  it('marks a lookup failure and renders the honest load-error state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubs.skillContext.mockRejectedValue(new Error('database unavailable'));
    const view = show(await TrainingBridgePage({ searchParams: Promise.resolve({ result: 'owned-old' }) }));
    expect(view.container.querySelector('[data-portal-error-state="training-bridge-assessment-load"]')).not.toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(messages.memberWorkspace.training.loadFailed);
    expect(screen.queryByRole('link', { name: 'Open this skill comparison' })).toBeNull();
  });
});
