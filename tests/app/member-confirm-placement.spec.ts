import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Product call 2026-09-22 (Mike, "Do it", Slack ts 1790092663.833649): the
 * member's confirm-offer action creates or updates a PlacementRecord the same
 * way an employer-side hire does. The record writer itself is pinned in
 * lib/placement/recordPlacementFromApplication.test.ts; this spec pins the
 * action: what it hands the writer, that it does so after the tracker row is
 * ACCEPTED, and that a writer failure cannot take the claim event, the partner
 * notification or the revalidation with it.
 */

const mocks = vi.hoisted(() => ({
  recordPlacement: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withUserGuc: vi.fn(async (_user: unknown, fn: () => Promise<unknown>) => fn()),
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/portal/workflowEvents', () => ({ recordPartnerWorkflowEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/member/applicationStatusEvent', () => ({ recordApplicationStatusChange: vi.fn(async () => {}) }));
vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(async () => {}),
  persistEvent: vi.fn(async () => ({})),
}));
vi.mock('@/lib/placement/recordPlacementFromApplication', () => ({
  recordPlacementFromApplication: mocks.recordPlacement,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    jobApplication: { findUnique: vi.fn(), update: vi.fn() },
    partnerReferral: { findFirst: vi.fn(async () => null) },
  },
}));

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { persistEvent } from '@/lib/events/track';
import { captureApiError } from '@/lib/observability/captureApiError';
import { recordPartnerWorkflowEvent } from '@/lib/portal/workflowEvents';
import { confirmPlacement } from '@/app/(portal)/dashboard/placementAction';

const MEMBER_ID = 'member-1';
const APPLICATION_ID = 'job-app-1';

const offer = {
  id: APPLICATION_ID,
  userId: MEMBER_ID,
  status: 'OFFER',
  company: 'Acme',
  role: 'Help Desk Technician',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: MEMBER_ID, email: 'member@example.com' } as never);
  vi.mocked(prisma.jobApplication.findUnique).mockResolvedValue(offer as never);
  vi.mocked(prisma.jobApplication.update).mockResolvedValue({ id: APPLICATION_ID } as never);
  vi.mocked(prisma.partnerReferral.findFirst).mockResolvedValue({ partnerId: 'partner-1' } as never);
  mocks.recordPlacement.mockResolvedValue({
    outcome: 'created',
    placement: { id: 'placement-1', employerName: 'Acme', jobTitle: 'Help Desk Technician' },
  });
});

describe('confirmPlacement records the member-reported placement', () => {
  it('hands the tracker row to the shared writer as a member self-report by the member', async () => {
    await confirmPlacement(APPLICATION_ID);

    expect(mocks.recordPlacement).toHaveBeenCalledTimes(1);
    expect(mocks.recordPlacement).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MEMBER_ID,
        employerName: 'Acme',
        jobTitle: 'Help Desk Technician',
        source: 'member_self_report',
        applicationId: APPLICATION_ID,
        actorUserId: MEMBER_ID,
      }),
    );
    expect(recordPartnerWorkflowEvent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'placement_confirmation_submitted',
      headline: 'Placement reported, pending verification',
    }));
    expect(JSON.stringify(vi.mocked(recordPartnerWorkflowEvent).mock.calls)).not.toContain('Acme');
  });

  it('writes the record after the tracker row is ACCEPTED and before the claim event, which carries the outcome', async () => {
    const order: string[] = [];
    vi.mocked(prisma.jobApplication.update).mockImplementation((async () => {
      order.push('status');
      return { id: APPLICATION_ID };
    }) as never);
    mocks.recordPlacement.mockImplementation(async () => {
      order.push('placement');
      return { outcome: 'created', placement: { id: 'placement-1', employerName: 'Acme', jobTitle: 'Help Desk Technician' } };
    });
    vi.mocked(persistEvent).mockImplementation((async (params: { eventName: string }) => {
      order.push(`persist:${params.eventName}`);
      return {};
    }) as never);

    await confirmPlacement(APPLICATION_ID);

    expect(order).toEqual(['status', 'placement', 'persist:placement_confirmation_submitted']);
    const claim = vi.mocked(persistEvent).mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(claim.metadata).toMatchObject({
      placementOutcome: 'created',
      placementRecordId: 'placement-1',
      pendingReview: true,
    });
    expect(String(claim.metadata.note)).not.toContain('No placement record');
  });

  it('reports "unchanged" truthfully when the member had already been placed', async () => {
    mocks.recordPlacement.mockResolvedValue({
      outcome: 'unchanged',
      placement: { id: 'placement-1', employerName: 'Acme', jobTitle: 'Help Desk Technician' },
    });

    await confirmPlacement(APPLICATION_ID);

    const claim = vi.mocked(persistEvent).mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(claim.metadata).toMatchObject({ placementOutcome: 'unchanged', placementRecordId: 'placement-1' });
  });

  it('a failing record write is captured and cannot take the claim event, the partner notice or the revalidation with it', async () => {
    mocks.recordPlacement.mockRejectedValue(new Error('placement_records unavailable'));

    await expect(confirmPlacement(APPLICATION_ID)).resolves.not.toThrow();

    expect(captureApiError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ route: 'dashboard/confirmPlacement' }),
    );
    const claim = vi.mocked(persistEvent).mock.calls[0][0] as { eventName: string; metadata: Record<string, unknown> };
    expect(claim.eventName).toBe('placement_confirmation_submitted');
    expect(claim.metadata).toMatchObject({ placementOutcome: 'failed', placementRecordId: null });
    expect(recordPartnerWorkflowEvent).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/placements');
  });

  it('never writes a record for an application that is not an offer', async () => {
    vi.mocked(prisma.jobApplication.findUnique).mockResolvedValue({ ...offer, status: 'INTERVIEW' } as never);

    await expect(confirmPlacement(APPLICATION_ID)).rejects.toThrow(/Only offer or accepted/);

    expect(mocks.recordPlacement).not.toHaveBeenCalled();
    expect(prisma.jobApplication.update).not.toHaveBeenCalled();
  });

  it("never writes a record for another member's application", async () => {
    vi.mocked(prisma.jobApplication.findUnique).mockResolvedValue({ ...offer, userId: 'someone-else' } as never);

    await expect(confirmPlacement(APPLICATION_ID)).rejects.toThrow(/Application not found/);

    expect(mocks.recordPlacement).not.toHaveBeenCalled();
  });
});
