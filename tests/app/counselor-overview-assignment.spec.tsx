import { withPortalIntl } from '@/tests/helpers/withPortalIntl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { programDisplayTitle } from '@/lib/content/programTitle';

const program = 'it-support-professional-certificate-ibm';
const rows = vi.hoisted(() => ({ assignments: [] as unknown[] }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'counselor-1' }) }));
vi.mock('@/lib/auth/roles', () => ({ isCounselor: async () => true, isAdmin: async () => false }));
vi.mock('next-intl/server', () => ({ getTranslations: async (namespace: string) => (key: string) => {
  let value: unknown = (en as Record<string, unknown>)[namespace];
  for (const part of key.split('.')) value = (value as Record<string, unknown>)?.[part];
  return typeof value === 'string' ? value : key;
} }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  counselor: { findFirst: async () => ({ id: 'counselor', partner: null }) },
  counselorAssignment: { count: async () => rows.assignments.length, findMany: async () => rows.assignments },
  messageThread: { findMany: async () => [] }, user: { findUnique: async () => ({ fullName: 'Staff Example' }) },
} }));
vi.mock('@/lib/counselor/commandCenter', () => ({ getCounselorCommandCenter: async () => ({ needsReply: [], atRisk: [], interviewing: [], totals: {} }) }));
vi.mock('@/lib/counselor/priorityQueue', () => ({ getCounselorPriorityQueue: async () => ({ rows: [], totals: { critical: 0, warning: 0, ontrack: 0, total: 0 } }) }));
vi.mock('@/components/portal/counselor/CounselorCommandCenter', () => ({ default: () => null }));
vi.mock('@/components/portal/counselor/CounselorPriorityQueue', () => ({ default: () => null }));
vi.mock('@/components/portal/AtRiskSummaryWidget', () => ({ default: () => null }));
vi.mock('@/components/portal/CounselorPortalVoiceBlock', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
import Page from '@/app/(portal)/counselor/overview/page';

describe('legacy counselor overview confirmed assignments', () => {
  it('keeps both rosters and enrolled/no-program metrics consistent for primary-only and stale history', async () => {
    rows.assignments = [
      { id: 'a-primary', memberId: 'primary', member: { id: 'primary', fullName: 'Primary Learner', email: 'primary@mail.invalid',
        enrolledProgram: null, programInterest: null, assessmentScorePct: 80, memberProgramProgress: [],
        courseEnrollments: [{ programSlug: program, isPrimary: true, curriculumVersion: 'legacy-v1', enrolledAt: new Date('2026-09-01') }] } },
      { id: 'a-stale', memberId: 'stale', member: { id: 'stale', fullName: 'History Learner', email: 'stale@mail.invalid',
        enrolledProgram: program, programInterest: null, assessmentScorePct: 80, memberProgramProgress: [],
        courseEnrollments: [{ programSlug: 'different-history', isPrimary: false, curriculumVersion: 'legacy-v1', enrolledAt: new Date('2026-09-01') }] } },
    ];
    const doc = document.implementation.createHTMLDocument('Overview');
    doc.body.innerHTML = renderToStaticMarkup(withPortalIntl(await Page({ searchParams: Promise.resolve({ ui: 'legacy' }) })));
    const metrics = [...doc.querySelectorAll('.portal-metric-card')];
    const enrolled = metrics.filter((tile) => tile.querySelector('.portal-metric-card__label')?.textContent === en.counselor.inAProgram);
    expect(enrolled).toHaveLength(2);
    for (const tile of enrolled) expect(tile.querySelector('.portal-metric-card__value')?.textContent).toBe('1');
    const missing = metrics.find((tile) => tile.querySelector('.portal-metric-card__label')?.textContent === en.counselor.noProgramYet);
    expect(missing?.querySelector('.portal-metric-card__value')?.textContent).toBe('1');
    for (const link of doc.querySelectorAll('a[href="/counselor/students/primary"]')) expect(link.textContent).toContain(programDisplayTitle(program));
    for (const link of doc.querySelectorAll('a[href="/counselor/students/stale"]')) expect(link.textContent).not.toContain(programDisplayTitle(program));
  });
});
