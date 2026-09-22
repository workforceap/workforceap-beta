import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PlacementsKit } from '@/components/portal/kit/pages/admin-subviews/PlacementsKit';
import PlacementsTableClient from '@/components/admin/PlacementsTableClient';
import { sortPlacementRows } from '@/lib/admin/placementsRosterSort';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }), usePathname: () => '/admin/placements', useSearchParams: () => mocks.params }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

/**
 * A member confirming an offer on their dashboard now stands up a
 * PlacementRecord (lib/placement/recordPlacementFromApplication.ts). Staff must
 * be able to tell that unverified self-report apart from a pending row a
 * counselor or an employer created, in both renderings of /admin/placements.
 */
describe('/admin/placements tells a member-reported placement apart from other pending rows', () => {
  const base = { memberId: 'm', wage: '—', survey: 'Pending' as const };

  it('the kit token spells out "Member-reported, unverified" and keeps Pending / Confirmed as they were', () => {
    render(
      <PlacementsKit
        placements={[
          { ...base, id: 'p1', student: 'Self Reporter', employer: 'Acme', role: 'Tech', status: 'Member-reported' },
          { ...base, id: 'p2', student: 'Employer Hire', employer: 'Beta', role: 'Clerk', status: 'Pending' },
          { ...base, id: 'p3', student: 'Verified Hire', employer: 'Gamma', role: 'Nurse', status: 'Confirmed' },
        ]}
        ytd={3} avgWage="—" retention90d="—" toConfirm={2} total={3}
      />,
    );
    expect(screen.getAllByText('Member-reported, unverified').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0);
  });

  it('sorting by status surfaces member-reported rows before other pending rows and verified rows last', () => {
    const rows = [
      { ...base, id: 'p3', student: 'C', employer: 'Gamma', role: 'r', status: 'Confirmed' as const },
      { ...base, id: 'p2', student: 'B', employer: 'Beta', role: 'r', status: 'Pending' as const },
      { ...base, id: 'p1', student: 'A', employer: 'Acme', role: 'r', status: 'Member-reported' as const },
    ];
    expect(sortPlacementRows(rows, 'status', 'asc').map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('the legacy table shows "Member-reported, unverified" only for the self-reported row', () => {
    const user = { id: 'u', fullName: 'Member Example', email: 'member@example.test', enrolledProgram: null };
    render(
      <PlacementsTableClient
        placements={[
          { id: 'p1', employerName: 'Acme', jobTitle: 'Tech', startDate: null, startDateVerified: false, memberReported: true, salaryOffered: null, placedAt: '2026-09-22T00:00:00.000Z', user },
          { id: 'p2', employerName: 'Beta', jobTitle: 'Clerk', startDate: null, startDateVerified: false, salaryOffered: null, placedAt: '2026-09-21T00:00:00.000Z', user },
          { id: 'p3', employerName: 'Gamma', jobTitle: 'Nurse', startDate: null, startDateVerified: true, memberReported: false, salaryOffered: 52000, placedAt: '2026-09-20T00:00:00.000Z', user },
        ]}
      />,
    );
    expect(screen.getAllByText('Member-reported, unverified')).toHaveLength(1);
    expect(screen.getAllByText('Pending verification')).toHaveLength(1);
    expect(screen.getAllByText('Verified')).toHaveLength(1);
  });

  it('the legacy table status labels paint the gold pair while unverified and the success pair once verified, no hex, 13px', () => {
    const user = { id: 'u', fullName: 'Member Example', email: 'member@example.test', enrolledProgram: null };
    render(
      <PlacementsTableClient
        placements={[
          { id: 'p1', employerName: 'Acme', jobTitle: 'Tech', startDate: null, startDateVerified: false, memberReported: true, salaryOffered: null, placedAt: '2026-09-22T00:00:00.000Z', user },
          { id: 'p2', employerName: 'Beta', jobTitle: 'Clerk', startDate: null, startDateVerified: false, salaryOffered: null, placedAt: '2026-09-21T00:00:00.000Z', user },
          { id: 'p3', employerName: 'Gamma', jobTitle: 'Nurse', startDate: null, startDateVerified: true, salaryOffered: 52000, placedAt: '2026-09-20T00:00:00.000Z', user },
        ]}
      />,
    );
    const styleOf = (text: string) => screen.getByText(text).getAttribute('style') ?? '';
    for (const pending of ['Member-reported, unverified', 'Pending verification']) {
      const style = styleOf(pending);
      expect(style, pending).toContain('color: var(--wa-gold-dark)');
      expect(style, pending).toContain('background: var(--wa-gold-soft)');
      expect(style, pending).toContain('font-size: 0.8125rem');
      expect(style, pending).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
    const verified = styleOf('Verified');
    expect(verified).toContain('color: var(--wa-success-dark)');
    expect(verified).toContain('background: var(--wa-success-soft)');
    expect(verified).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
