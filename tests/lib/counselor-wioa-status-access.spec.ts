// @vitest-environment node
/**
 * Counselors may record intake verification only. `not_eligible` is a
 * workforce-board determination; if this helper regresses, a counselor PATCH
 * would write an eligibility decision the UI already hides.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(),
  isCounselor: vi.fn(),
  isSuperAdmin: vi.fn(),
}));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(),
}));

import { canReviewActorSetWioaStatus } from '@/lib/counselor/applicationReviewAccess';
import {
  COUNSELOR_WIOA_REVIEW_STATUSES,
  WIOA_REVIEW_STATUSES,
  isCounselorWioaReviewStatus,
} from '@/lib/wioa/wioaReview';

const counselor = { userId: 'counselor-1', role: 'counselor' as const };
const admin = { userId: 'admin-1', role: 'admin' as const };
const superAdmin = { userId: 'super-1', role: 'super_admin' as const };

describe('isCounselorWioaReviewStatus', () => {
  it('allows intake statuses and never eligibility', () => {
    expect([...COUNSELOR_WIOA_REVIEW_STATUSES]).toEqual(['pending', 'in_review', 'needs_info', 'verified']);
    for (const status of COUNSELOR_WIOA_REVIEW_STATUSES) {
      expect(isCounselorWioaReviewStatus(status)).toBe(true);
    }
    expect(isCounselorWioaReviewStatus('not_eligible')).toBe(false);
    expect(isCounselorWioaReviewStatus('eligible')).toBe(false);
    expect(isCounselorWioaReviewStatus('')).toBe(false);
    expect(isCounselorWioaReviewStatus('VERIFIED')).toBe(false);
  });
});

describe('canReviewActorSetWioaStatus', () => {
  it.each([...WIOA_REVIEW_STATUSES])('lets admin and super-admin set %s', (status) => {
    expect(canReviewActorSetWioaStatus(admin, status)).toBe(true);
    expect(canReviewActorSetWioaStatus(superAdmin, status)).toBe(true);
  });

  it.each([...COUNSELOR_WIOA_REVIEW_STATUSES])('lets a counselor set intake status %s', (status) => {
    expect(canReviewActorSetWioaStatus(counselor, status)).toBe(true);
  });

  it('blocks a counselor from recording not_eligible or an unknown status', () => {
    expect(canReviewActorSetWioaStatus(counselor, 'not_eligible')).toBe(false);
    expect(canReviewActorSetWioaStatus(counselor, 'denied')).toBe(false);
    expect(canReviewActorSetWioaStatus(admin, 'not_eligible')).toBe(true);
  });
});
