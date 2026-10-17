/**
 * Leftover from #2803: `lockEligibilityMember` / `eligibilityWriteFailure`
 * map a missing FOR UPDATE row to a clean 404 without treating it as a
 * screening conflict.
 */
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  eligibilityWriteFailure,
  lockEligibilityMember,
} from '@/lib/wioa/eligibilityForm';

describe('lockEligibilityMember', () => {
  it('throws ELIGIBILITY_SUBJECT_UNAVAILABLE when FOR UPDATE returns no row', async () => {
    const queryRaw = vi.fn(async () => []);
    const findFirst = vi.fn();
    await expect(
      lockEligibilityMember(
        { $queryRaw: queryRaw, user: { findFirst } } as never,
        'member-1',
        'org-1',
      ),
    ).rejects.toThrow('ELIGIBILITY_SUBJECT_UNAVAILABLE');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('throws when the lock hits a row but the follow-up read is gone', async () => {
    const queryRaw = vi.fn(async () => [{ id: 'member-1' }]);
    const findFirst = vi.fn(async () => null);
    await expect(
      lockEligibilityMember(
        { $queryRaw: queryRaw, user: { findFirst } } as never,
        'member-1',
        'org-1',
      ),
    ).rejects.toThrow('ELIGIBILITY_SUBJECT_UNAVAILABLE');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'member-1', deletedAt: null, organizationId: 'org-1' },
      select: {
        wioaQualificationJson: true,
        organizationId: true,
        fullName: true,
        email: true,
      },
    });
  });

  it('returns the locked member when both reads agree', async () => {
    const current = {
      wioaQualificationJson: { eligibilityForm: { version: 1 } },
      organizationId: 'org-1',
      fullName: 'Ada',
      email: 'ada@example.org',
    };
    const result = await lockEligibilityMember(
      {
        $queryRaw: async () => [{ id: 'member-1' }],
        user: { findFirst: async () => current },
      } as never,
      'member-1',
    );
    expect(result).toEqual(current);
  });
});

describe('eligibilityWriteFailure', () => {
  it('maps a missing lock to 404 and a CAS conflict to 409', () => {
    expect(eligibilityWriteFailure(new Error('ELIGIBILITY_SUBJECT_UNAVAILABLE'))).toEqual({
      status: 404,
      error: 'Member not found',
    });
    expect(eligibilityWriteFailure(new Error('ELIGIBILITY_FORM_CONFLICT'))).toEqual({
      status: 409,
      error: 'Your screening changed. Reload and try again.',
    });
    expect(
      eligibilityWriteFailure(
        new Prisma.PrismaClientKnownRequestError('Serialization conflict', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      ),
    ).toEqual({
      status: 409,
      error: 'Your screening changed. Reload and try again.',
    });
    expect(eligibilityWriteFailure(new Error('Screening unavailable'))).toBeNull();
  });
});
