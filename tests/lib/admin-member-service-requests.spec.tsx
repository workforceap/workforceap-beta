import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesWhere } from '../helpers/prismaWhereMatches';

const state = vi.hoisted(() => ({ benefits: [] as Array<Record<string, unknown>>, training: [] as Array<Record<string, unknown>>, reads: 0 }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  withAdminPageScope: async (_scope: unknown, callback: (db: unknown) => unknown) => callback({
    benefitRequest: { findMany: async ({ where, take }: { where: object; take: number }) => {
      state.reads++; return state.benefits.filter((row) => matchesWhere(row, where)).slice(0, take);
    } },
    trainingAccessRequest: { findMany: async ({ where, take }: { where: object; take: number }) => {
      state.reads++; return state.training.filter((row) => matchesWhere(row, where)).slice(0, take);
    } },
  }),
}));

import { loadMemberServiceRequests } from '@/lib/admin/memberServiceRequests';
import MemberServiceRequests from '@/components/admin/MemberServiceRequests';

const at = new Date('2026-10-01T12:00:00Z');
const scope = { ok: true as const, orgId: 'org-1', superAdmin: false };
const benefit = { id: 'benefit-1', userId: 'member-1', user: { organizationId: 'org-1', deletedAt: null },
  benefit: 'coursera', status: 'PENDING', createdAt: at, updatedAt: at };
const training = { ...benefit, id: 'training-1', providerKey: 'linkedin_premium', status: 'APPROVED', requestedAt: at, notes: 'Recorded request note' };
beforeEach(() => {
  state.reads = 0;
  state.benefits = [benefit, { ...benefit, id: 'other-member', userId: 'member-2' },
    { ...benefit, id: 'foreign', user: { organizationId: 'org-2', deletedAt: null } },
    { ...benefit, id: 'deleted', user: { organizationId: 'org-1', deletedAt: at } }];
  state.training = [training, { ...training, id: 'foreign-training', user: { organizationId: 'org-2', deletedAt: null } }];
});

describe('staff member access request records', () => {
  it('loads only the authorized active member in the specified organization', async () => {
    const data = await loadMemberServiceRequests(scope, 'member-1', 'org-1');
    expect(data.benefits.map((row) => row.id)).toEqual(['benefit-1']);
    expect(data.training.map((row) => row.id)).toEqual(['training-1']);
  });
  it('rejects an org-admin scope mismatch before querying and keeps platform reads tied to the selected member', async () => {
    await expect(loadMemberServiceRequests(scope, 'member-1', 'org-2')).rejects.toThrow('scope mismatch');
    expect(state.reads).toBe(0);
    const data = await loadMemberServiceRequests({ ...scope, superAdmin: true }, 'member-1', 'org-1');
    expect(data.benefits.map((row) => row.id)).toEqual(['benefit-1']);
  });
  it('renders saved statuses and notes without claiming provider access or exposing an approval action', async () => {
    render(<MemberServiceRequests {...await loadMemberServiceRequests(scope, 'member-1', 'org-1')} />);
    expect(screen.getByRole('heading', { name: 'Saved access requests' })).toBeVisible();
    expect(screen.getByText('pending')).toBeVisible();
    expect(screen.getByText('approved')).toBeVisible();
    expect(screen.getByText('Recorded request note')).toBeVisible();
    expect(screen.getByText(/does not confirm a live provider seat/)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('does not report a failed load as an empty history', () => {
    render(<MemberServiceRequests benefits={[]} training={[]} failed />);
    expect(screen.getByRole('status')).toHaveTextContent('could not be loaded');
    expect(screen.queryByText('No saved benefit or training access request records.')).not.toBeInTheDocument();
  });
});
