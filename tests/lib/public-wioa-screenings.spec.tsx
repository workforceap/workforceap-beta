import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesWhere } from '../helpers/prismaWhereMatches';

const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, fail: false }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  withAdminPageScope: async (_scope: unknown, callback: (db: unknown) => unknown) => callback({ publicWioaScreening: {
    findMany: async ({ where, take }: { where: object; take: number }) => {
      if (state.fail) throw new Error('Unavailable');
      return state.rows.filter((row) => matchesWhere(row, where)).slice(0, take);
    },
    count: async ({ where }: { where: object }) => state.rows.filter((row) => matchesWhere(row, where)).length,
  } }),
}));

import { loadPublicWioaScreenings, publicScreeningEvidence } from '@/lib/admin/publicWioaScreenings';
import PublicWioaScreeningsPanel from '@/components/admin/PublicWioaScreeningsPanel';

const portal = {
  version: 2, submittedAt: '2026-10-01T12:00:00Z', signal: 'review', reasons: [],
  answers: { ageBracket: '25_54', countyOrZip: '78701', primaryBarrier: 'none', dislocatedWorker: false,
    lowIncomeSelfReport: false, trainingInterest: true, completedIntakeSelfReport: false },
};
const tokenized = { version: 'public_eligibility_lead_v1', source: 'tokenized_questionnaire',
  answers: { q1: 'yes', q2: null, publicAssistanceHelpRequested: 'no' }, primaryBarriers: ['transportation'] };
const row = { id: 'public-1', organizationId: 'org-1', fullName: 'Public contact', email: 'contact@mail.invalid',
  phone: null, createdAt: new Date('2026-10-01T12:00:00Z'), snapshot: portal };
beforeEach(() => { state.rows = [row, { ...row, id: 'foreign', organizationId: 'org-2' }]; state.fail = false; });

describe('public screening evidence and authorized visibility', () => {
  it('keeps self-reported false distinct from an unanswered optional question', () => {
    const evidence = publicScreeningEvidence(portal);
    expect(evidence.source).toBe('Public WIOA questionnaire');
    expect(evidence.answers.find((item) => item.label === 'Low income (self-reported)')?.value).toBe('No');
    expect(evidence.answers.find((item) => item.label === 'Receiving public assistance')?.value).toBe('Not answered');
  });

  it('shows actual partial tokenized answers without inventing WIOA signals or exposing arbitrary stored fields', () => {
    const evidence = publicScreeningEvidence({ ...tokenized, privateExtra: 'DO NOT DISPLAY' });
    expect(evidence.source).toBe('Public eligibility questionnaire');
    expect(evidence.answers.find((item) => item.label === 'Unemployed or underemployed')?.value).toBe('Yes');
    expect(evidence.answers.find((item) => item.label === 'Household income below $60,000')?.value).toBe('Not answered');
    expect(JSON.stringify(evidence)).not.toContain('DO NOT DISPLAY');
    expect(evidence).not.toHaveProperty('signal');
    expect(evidence.answers.map((item) => item.value)).not.toContain('likely');
    expect(publicScreeningEvidence({ version: 'unknown', answers: {} }).answers).toEqual([]);
  });

  it('limits organization admins to their own public contacts and preserves platform-admin access', async () => {
    expect((await loadPublicWioaScreenings({ ok: true, orgId: 'org-1', superAdmin: false })).rows.map((item) => item.id)).toEqual(['public-1']);
    expect((await loadPublicWioaScreenings({ ok: true, orgId: 'org-1', superAdmin: true })).total).toBe(2);
  });

  it('bounds the loaded records while reporting the true scoped total', async () => {
    state.rows = Array.from({ length: 103 }, (_, index) => ({ ...row, id: String(index) }));
    const data = await loadPublicWioaScreenings({ ok: true, orgId: 'org-1', superAdmin: false });
    expect(data.rows).toHaveLength(100);
    expect(data.total).toBe(103);
  });

  it('opens saved answers and never presents a public contact as a member review or verified decision', () => {
    render(<PublicWioaScreeningsPanel rows={[{ ...row, snapshot: tokenized }]} total={1} />);
    expect(screen.getByText('contact@mail.invalid')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open|member|verify/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View answers for Public contact' }));
    expect(screen.getByText('Unemployed or underemployed')).toBeVisible();
    expect(screen.getByText('No staff review status is stored for these contacts.', { exact: false })).toBeVisible();
  });

  it('renders a load failure as unavailable rather than claiming there are no public records', async () => {
    state.fail = true;
    await expect(loadPublicWioaScreenings({ ok: true, orgId: 'org-1', superAdmin: false })).rejects.toThrow('Unavailable');
    render(<PublicWioaScreeningsPanel rows={[]} total={0} failed />);
    expect(screen.getByRole('status')).toHaveTextContent('could not be loaded');
    expect(screen.queryByText('No public screenings saved yet.')).not.toBeInTheDocument();
  });
});
