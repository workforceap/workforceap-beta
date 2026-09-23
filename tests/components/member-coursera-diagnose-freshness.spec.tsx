import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const diagnose = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/diagnoseMemberCoursera', () => ({ diagnoseMemberCoursera: diagnose }));

import MemberCourseraDiagnoseButton from '@/components/admin/MemberCourseraDiagnoseButton';

function report(freshness: unknown) {
  return {
    ok: true,
    user: {
      id: 'member-1',
      email: 'member@example.com',
      fullName: 'Member One',
      enrolledProgram: null,
      canonicalProgram: 'it-support-professional-certificate-google',
      courseraEnrollmentApproved: false,
    },
    freshness,
    identityMappings: [],
    enrollments: [],
    xapi: { totalForActor: 0, ignoredForActor: 0, processedForActor: 0, erroredForActor: 0, latestIgnored: [] },
    canonical: { courseProgressRows: 0, courseraCourseProgressRows: 0, courseraBadgeProgressRows: 0, canonicalMappingsTotal: 1 },
    reconciliation: [],
    verdict: [{ status: 'warn', title: 'B4B sync is stale: last row write 3d ago', detail: 'detail' }],
  };
}

describe('MemberCourseraDiagnoseButton sync freshness', () => {
  afterEach(() => {
    cleanup();
    diagnose.mockReset();
  });

  it('shows the freshness facts with provenance and marks missing timestamps', async () => {
    diagnose.mockResolvedValue(report({
      orgLastB4BSyncAt: new Date('2026-09-20T12:00:00Z'),
      memberLastSyncAt: new Date('2026-09-19T12:00:00Z'),
      memberLastSyncSource: 'csv_import',
      lastXapiReceivedAt: null,
      lastLearnerActivityAt: null,
    }));
    render(<MemberCourseraDiagnoseButton memberId="member-1" />);
    fireEvent.click(screen.getByRole('button', { name: /diagnose coursera connection/i }));

    expect(await screen.findByText('Sync freshness')).toBeTruthy();
    expect(screen.getByText('Last B4B sync (organization)')).toBeTruthy();
    expect(screen.getByText(/csv_import/)).toBeTruthy();
    expect(screen.getAllByText('Never recorded')).toHaveLength(2);
    expect(screen.getByText(/\(legacy pointer empty\)/)).toBeTruthy();
  });

  it('says freshness is unavailable when the reads failed', async () => {
    diagnose.mockResolvedValue(report(null));
    render(<MemberCourseraDiagnoseButton memberId="member-1" />);
    fireEvent.click(screen.getByRole('button', { name: /diagnose coursera connection/i }));

    expect(await screen.findByText(/Unavailable: the freshness reads failed/)).toBeTruthy();
  });
});
