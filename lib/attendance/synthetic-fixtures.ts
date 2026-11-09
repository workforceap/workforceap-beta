/**
 * LOCAL SYNTHETIC attendance fixtures. Fixture-only: these actors are NOT an auth
 * system and must never be imported by a production route. Fixed UUID namespace only.
 */
import type { Actor } from './workflow';
import type { TrustedEnrollment } from './repository';

export const SYNTHETIC_LABEL = 'LOCAL SYNTHETIC DEMO — non-durable, not production attendance';
export const SYNTHETIC_MEMBER = '00000000-0000-4000-8000-000000000001';
export const SYNTHETIC_ADMIN = '00000000-0000-4000-8000-000000000002';
export const SYNTHETIC_ORG = '00000000-0000-4000-8000-000000000003';
export const SYNTHETIC_INSTRUCTOR = '00000000-0000-4000-8000-000000000004';
export const SYNTHETIC_ENROLLMENT = '00000000-0000-4000-8000-000000000005';
export const SYNTHETIC_OTHER_MEMBER = '00000000-0000-4000-8000-000000000011';
export const SYNTHETIC_INACTIVE_ENROLLMENT = '00000000-0000-4000-8000-000000000099';
export const SYNTHETIC_OTHER_ORG = '00000000-0000-4000-8000-0000000000aa';
export const SYNTHETIC_OTHER_ORG_MEMBER = '00000000-0000-4000-8000-0000000000ab';
export const SYNTHETIC_OTHER_ORG_ENROLLMENT = '00000000-0000-4000-8000-0000000000ac';
export const SYNTHETIC_OTHER_MEMBER_ENROLLMENT = '00000000-0000-4000-8000-000000000012';

export type SyntheticRole = 'student' | 'admin' | 'instructor' | 'other-student' | 'other-org-admin';

export function syntheticActor(role: SyntheticRole): Actor {
  switch (role) {
    case 'admin': return { userId: SYNTHETIC_ADMIN, organizationId: SYNTHETIC_ORG, permissions: ['attendance:admin'] };
    case 'instructor': return { userId: SYNTHETIC_INSTRUCTOR, organizationId: SYNTHETIC_ORG, permissions: ['attendance:instructor'] };
    case 'other-student': return { userId: SYNTHETIC_OTHER_MEMBER, organizationId: SYNTHETIC_ORG, permissions: [] };
    case 'other-org-admin': return { userId: '00000000-0000-4000-8000-0000000000ad', organizationId: SYNTHETIC_OTHER_ORG, permissions: ['attendance:admin'] };
    default: return { userId: SYNTHETIC_MEMBER, organizationId: SYNTHETIC_ORG, permissions: [] };
  }
}

function enrollment(over: Partial<TrustedEnrollment> & { scope: TrustedEnrollment['scope'] }): TrustedEnrollment {
  return {
    active: true,
    profile: { name: 'Synthetic Student', email: 'synthetic-student@example.invalid', phone: null },
    enrollment: { program: 'Synthetic Workforce Program', twistId: 'SYN-001', counselor: 'Synthetic Counselor', abbreviation: 'SWP', pathway: 'IT', classStart: '2026-08-01', classEnd: '2027-07-31' },
    startMonth: 8,
    configuredInstructorId: SYNTHETIC_INSTRUCTOR,
    sourceMappings: [],
    ...over,
  };
}

export function syntheticEnrollments(): TrustedEnrollment[] {
  const activeScope = { organizationId: SYNTHETIC_ORG, memberId: SYNTHETIC_MEMBER, enrollmentId: SYNTHETIC_ENROLLMENT };
  return [
    enrollment({ scope: activeScope, sourceMappings: [{ ...activeScope, providerLearnerId: 'synthetic-learner', courseId: 'synthetic-course' }] }),
    enrollment({ scope: { ...activeScope, enrollmentId: SYNTHETIC_INACTIVE_ENROLLMENT }, active: false }),
    enrollment({ scope: { organizationId: SYNTHETIC_ORG, memberId: SYNTHETIC_OTHER_MEMBER, enrollmentId: SYNTHETIC_OTHER_MEMBER_ENROLLMENT }, profile: { name: 'Other Synthetic Student', email: null, phone: null } }),
    enrollment({ scope: { organizationId: SYNTHETIC_OTHER_ORG, memberId: SYNTHETIC_OTHER_ORG_MEMBER, enrollmentId: SYNTHETIC_OTHER_ORG_ENROLLMENT }, profile: { name: 'Other Tenant Student', email: null, phone: null } }),
  ];
}
