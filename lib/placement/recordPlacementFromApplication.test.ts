import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Product call 2026-09-22 (Mike, "Do it", Slack ts 1790092663.833649): a
 * member confirming an offer must produce the same PlacementRecord an
 * employer marking the application hired does, so self-reported hires reach
 * the retention check-ins, the First 90 Days card and the placement counts.
 *
 * PlacementRecord.userId is @unique, so the row is the idempotency key. These
 * specs pin the three outcomes on that one row and the verification
 * semantics: nothing here ever sets `startDateVerified`.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn(async () => ({ awarded: true })) }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => ({})) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    placementRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(async () => ({ enrolledProgram: 'it-support' })) },
    employer: { findUnique: vi.fn() },
    counselorAssignment: { findFirst: vi.fn(async () => ({ counselor: { userId: 'counselor-user' } })) },
    jobPostingApplication: { findUnique: vi.fn(async () => ({ job: { title: 'Help Desk Technician' } })) },
  },
}));

import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { awardPoints } from '@/lib/member/points';
import { createNotification } from '@/lib/notifications/create';
import {
  EMPLOYER_CORROBORATION_MARKER,
  EMPLOYER_HIRED_NOTE,
  MEMBER_SELF_REPORT_NOTE,
  isMemberReportedPlacement,
  recordPlacementFromApplication,
} from './recordPlacementFromApplication';
import { notifyAndRecordPlacement } from '@/lib/employer/applicationStatusEffects';

const MEMBER_ID = 'member-1';
const NOW = new Date('2026-09-22T16:00:00Z');

const memberReportedRow = {
  id: 'placement-1',
  employerName: 'Acme (as typed by member)',
  jobTitle: 'Help desk',
  notes: MEMBER_SELF_REPORT_NOTE,
  placedBy: null,
  startDateVerified: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.placementRecord.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.placementRecord.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: 'placement-1',
    employerName: args.data.employerName,
    jobTitle: args.data.jobTitle,
  })) as never);
  vi.mocked(prisma.placementRecord.update).mockImplementation((async (args: { data: Record<string, unknown> }) => ({
    id: 'placement-1',
    employerName: args.data.employerName,
    jobTitle: args.data.jobTitle,
  })) as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ enrolledProgram: 'it-support' } as never);
  vi.mocked(prisma.counselorAssignment.findFirst).mockResolvedValue({ counselor: { userId: 'counselor-user' } } as never);
});

describe('member self-report with no existing row', () => {
  it('creates one member-reported, unverified row keyed on the member and audits it', async () => {
    const result = await recordPlacementFromApplication({
      userId: MEMBER_ID,
      employerName: 'Acme',
      jobTitle: 'Help Desk Technician',
      source: 'member_self_report',
      applicationId: 'job-app-1',
      actorUserId: MEMBER_ID,
      now: NOW,
    });

    expect(result.outcome).toBe('created');
    expect(prisma.placementRecord.create).toHaveBeenCalledTimes(1);
    const data = vi.mocked(prisma.placementRecord.create).mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: MEMBER_ID,
      employerName: 'Acme',
      jobTitle: 'Help Desk Technician',
      programSlug: 'it-support',
      placedAt: NOW,
      startDateVerified: false,
      notes: MEMBER_SELF_REPORT_NOTE,
    });
    // Auto-created, not staff-entered: `placedBy` stays null so a later
    // employer confirmation may corroborate it and staff-owned rows stay apart.
    expect(data).not.toHaveProperty('placedBy');
    expect(prisma.placementRecord.update).not.toHaveBeenCalled();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: MEMBER_ID,
        action: 'placement_create',
        targetType: 'placement_record',
        targetId: 'placement-1',
        metadata: expect.objectContaining({
          memberId: MEMBER_ID,
          source: 'member_self_report',
          applicationId: 'job-app-1',
          startDateVerified: false,
        }),
      }),
    );
    expect(awardPoints).toHaveBeenCalledWith(MEMBER_ID, 'placement_recorded', 'placement-1');

    const notified = vi.mocked(createNotification).mock.calls.map((call) => call[0]);
    expect(notified.map((n) => n.userId)).toEqual([MEMBER_ID, 'counselor-user']);
    expect(notified[1].body).toContain('reported accepting an offer at Acme');
  });

  it('does not create a second row when the member confirms again', async () => {
    vi.mocked(prisma.placementRecord.findUnique).mockResolvedValue(memberReportedRow as never);

    const result = await recordPlacementFromApplication({
      userId: MEMBER_ID,
      employerName: 'Acme',
      jobTitle: 'Help Desk Technician',
      source: 'member_self_report',
      applicationId: 'job-app-2',
      actorUserId: MEMBER_ID,
      now: NOW,
    });

    expect(result).toEqual({
      outcome: 'unchanged',
      placement: { id: 'placement-1', employerName: memberReportedRow.employerName, jobTitle: memberReportedRow.jobTitle },
    });
    expect(prisma.placementRecord.create).not.toHaveBeenCalled();
    expect(prisma.placementRecord.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(awardPoints).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('employer hire on the row the member already reported', () => {
  it('corroborates the same row in place, keeps it unverified, and never creates a duplicate', async () => {
    vi.mocked(prisma.placementRecord.findUnique).mockResolvedValue(memberReportedRow as never);

    const result = await recordPlacementFromApplication({
      userId: MEMBER_ID,
      employerName: 'Acme Corporation',
      jobTitle: 'Help Desk Technician',
      source: 'employer_hired',
      applicationId: 'posting-app-1',
      actorUserId: 'employer-user',
      now: NOW,
    });

    expect(result.outcome).toBe('corroborated');
    expect(result.placement.id).toBe('placement-1');
    expect(prisma.placementRecord.create).not.toHaveBeenCalled();
    expect(prisma.placementRecord.update).toHaveBeenCalledTimes(1);
    const update = vi.mocked(prisma.placementRecord.update).mock.calls[0][0];
    expect(update.where).toEqual({ id: 'placement-1' });
    // The employer's name and title are authoritative over the member's free-typed strings...
    expect(update.data).toMatchObject({ employerName: 'Acme Corporation', jobTitle: 'Help Desk Technician' });
    expect(String(update.data.notes)).toContain(MEMBER_SELF_REPORT_NOTE);
    expect(String(update.data.notes)).toContain(`${EMPLOYER_CORROBORATION_MARKER} on 2026-09-22`);
    // ...but only a counselor confirms start date and wage.
    expect(update.data).not.toHaveProperty('startDateVerified');
    expect(update.data).not.toHaveProperty('placedBy');

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'employer-user',
        action: 'placement_update',
        targetId: 'placement-1',
        metadata: expect.objectContaining({
          source: 'employer_hired',
          corroborated: true,
          previousEmployerName: memberReportedRow.employerName,
          startDateVerified: false,
        }),
      }),
    );
    // No second 500-point award and no second "Placement recorded" for the member.
    expect(awardPoints).not.toHaveBeenCalled();
    const notified = vi.mocked(createNotification).mock.calls.map((call) => call[0]);
    expect(notified.map((n) => n.userId)).toEqual(['counselor-user']);
    expect(notified[0].body).toContain('employer confirmed the hire');
  });

  it('is a no-op when the employer confirms the same hire twice', async () => {
    vi.mocked(prisma.placementRecord.findUnique).mockResolvedValue({
      ...memberReportedRow,
      employerName: 'Acme Corporation',
      notes: `${MEMBER_SELF_REPORT_NOTE}\n${EMPLOYER_CORROBORATION_MARKER} on 2026-09-22 (application posting-app-1).`,
    } as never);

    const result = await recordPlacementFromApplication({
      userId: MEMBER_ID,
      employerName: 'Acme Corporation',
      jobTitle: 'Help Desk Technician',
      source: 'employer_hired',
      applicationId: 'posting-app-1',
      actorUserId: 'employer-user',
      now: NOW,
    });

    expect(result.outcome).toBe('unchanged');
    expect(prisma.placementRecord.create).not.toHaveBeenCalled();
    expect(prisma.placementRecord.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it.each([
    ['a counselor entered the row', { ...memberReportedRow, placedBy: 'counselor-user', notes: null }],
    ['staff already verified the row', { ...memberReportedRow, startDateVerified: true }],
  ])('leaves the row alone when %s', async (_label, row) => {
    vi.mocked(prisma.placementRecord.findUnique).mockResolvedValue(row as never);

    const result = await recordPlacementFromApplication({
      userId: MEMBER_ID,
      employerName: 'Acme Corporation',
      jobTitle: 'Help Desk Technician',
      source: 'employer_hired',
      applicationId: 'posting-app-1',
      actorUserId: 'employer-user',
      now: NOW,
    });

    expect(result.outcome).toBe('unchanged');
    expect(prisma.placementRecord.create).not.toHaveBeenCalled();
    expect(prisma.placementRecord.update).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('employer hire with no existing row', () => {
  it('creates the same shape of unverified row as before, tagged as employer-created', async () => {
    const result = await recordPlacementFromApplication({
      userId: MEMBER_ID,
      employerName: 'Acme Corporation',
      jobTitle: 'Help Desk Technician',
      source: 'employer_hired',
      applicationId: 'posting-app-1',
      actorUserId: 'employer-user',
      now: NOW,
    });

    expect(result.outcome).toBe('created');
    expect(vi.mocked(prisma.placementRecord.create).mock.calls[0][0].data).toMatchObject({
      userId: MEMBER_ID,
      employerName: 'Acme Corporation',
      startDateVerified: false,
      notes: EMPLOYER_HIRED_NOTE,
    });
    const notified = vi.mocked(createNotification).mock.calls.map((call) => call[0]);
    expect(notified[1].body).toContain('was marked hired at Acme Corporation');
  });
});

describe('notifyAndRecordPlacement (the employer route side-effect) goes through the shared writer', () => {
  beforeEach(() => {
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({ companyName: 'Acme Corporation', userId: 'employer-user' } as never);
  });

  it('updates the member-reported row instead of creating a second one, then congratulates the employer', async () => {
    vi.mocked(prisma.placementRecord.findUnique).mockResolvedValue(memberReportedRow as never);

    await notifyAndRecordPlacement({
      applicationId: 'posting-app-1',
      studentId: MEMBER_ID,
      employerId: 'employer-1',
      nextStatus: 'hired',
    });

    expect(prisma.placementRecord.create).not.toHaveBeenCalled();
    expect(prisma.placementRecord.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.placementRecord.update).mock.calls[0][0].data).toMatchObject({
      employerName: 'Acme Corporation',
      jobTitle: 'Help Desk Technician',
    });
    const notified = vi.mocked(createNotification).mock.calls.map((call) => call[0]);
    // "You're hired!" to the member, verify nudge to the counselor, next-hire nudge to the employer.
    expect(notified.map((n) => n.userId)).toEqual([MEMBER_ID, 'counselor-user', 'employer-user']);
    expect(notified[2].title).toBe('Great hire! Post your next role');
  });

  it('skips the employer nudge when a staff-owned row already exists (as before)', async () => {
    vi.mocked(prisma.placementRecord.findUnique).mockResolvedValue({ ...memberReportedRow, placedBy: 'counselor-user' } as never);

    await notifyAndRecordPlacement({
      applicationId: 'posting-app-1',
      studentId: MEMBER_ID,
      employerId: 'employer-1',
      nextStatus: 'hired',
    });

    expect(prisma.placementRecord.create).not.toHaveBeenCalled();
    expect(prisma.placementRecord.update).not.toHaveBeenCalled();
    const notified = vi.mocked(createNotification).mock.calls.map((call) => call[0]);
    expect(notified.map((n) => n.userId)).toEqual([MEMBER_ID]);
  });
});

describe('member and employer confirm at the same moment (P2002 on the unique member row)', () => {
  const uniqueViolation = () => Object.assign(new Error('Unique constraint failed on the fields: (`user_id`)'), { code: 'P2002' });

  it('employer create loses the race to the member: corroborates the member row instead of failing', async () => {
    vi.mocked(prisma.placementRecord.findUnique)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(memberReportedRow as never);
    vi.mocked(prisma.placementRecord.create).mockRejectedValueOnce(uniqueViolation());

    const result = await recordPlacementFromApplication({
      userId: MEMBER_ID,
      employerName: 'Acme Corporation',
      jobTitle: 'Help Desk Technician',
      source: 'employer_hired',
      applicationId: 'posting-app-1',
      actorUserId: 'employer-user',
      now: NOW,
    });

    expect(result.outcome).toBe('corroborated');
    expect(prisma.placementRecord.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.placementRecord.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.placementRecord.update).mock.calls[0][0].data).toMatchObject({ employerName: 'Acme Corporation' });
    // Only the corroboration is audited; the lost create leaves no trace and awards nothing.
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(auditLog).mock.calls[0][0]).toMatchObject({ action: 'placement_update' });
    expect(awardPoints).not.toHaveBeenCalled();
  });

  it('member create loses the race to the employer: reports unchanged, duplicates nothing', async () => {
    vi.mocked(prisma.placementRecord.findUnique)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ ...memberReportedRow, employerName: 'Acme Corporation', notes: EMPLOYER_HIRED_NOTE } as never);
    vi.mocked(prisma.placementRecord.create).mockRejectedValueOnce(uniqueViolation());

    const result = await recordPlacementFromApplication({
      userId: MEMBER_ID,
      employerName: 'Acme',
      jobTitle: 'Help desk',
      source: 'member_self_report',
      applicationId: 'job-app-1',
      actorUserId: MEMBER_ID,
      now: NOW,
    });

    expect(result).toEqual({
      outcome: 'unchanged',
      placement: { id: 'placement-1', employerName: 'Acme Corporation', jobTitle: memberReportedRow.jobTitle },
    });
    expect(prisma.placementRecord.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('any other create failure still surfaces to the caller', async () => {
    vi.mocked(prisma.placementRecord.create).mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: 'P1017' }));

    await expect(
      recordPlacementFromApplication({
        userId: MEMBER_ID,
        employerName: 'Acme',
        jobTitle: 'Help desk',
        source: 'member_self_report',
        applicationId: 'job-app-1',
        actorUserId: MEMBER_ID,
        now: NOW,
      }),
    ).rejects.toThrow('connection lost');
    expect(prisma.placementRecord.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.placementRecord.update).not.toHaveBeenCalled();
  });
});

describe('isMemberReportedPlacement (staff lists)', () => {
  it('is true only for the unverified row this writer created from a member confirmation', () => {
    expect(isMemberReportedPlacement({ placedBy: null, startDateVerified: false, notes: MEMBER_SELF_REPORT_NOTE })).toBe(true);
    // Employer corroboration appends to the note; still member-reported until verified.
    expect(isMemberReportedPlacement({ placedBy: null, startDateVerified: false, notes: `${MEMBER_SELF_REPORT_NOTE}\nEmployer confirmed this hire on 2026-09-22 (application a1).` })).toBe(true);
    expect(isMemberReportedPlacement({ placedBy: null, startDateVerified: true, notes: MEMBER_SELF_REPORT_NOTE })).toBe(false);
    expect(isMemberReportedPlacement({ placedBy: 'staff-1', startDateVerified: false, notes: MEMBER_SELF_REPORT_NOTE })).toBe(false);
    expect(isMemberReportedPlacement({ placedBy: null, startDateVerified: false, notes: EMPLOYER_HIRED_NOTE })).toBe(false);
    expect(isMemberReportedPlacement({ placedBy: null, startDateVerified: false, notes: null })).toBe(false);
  });
});
