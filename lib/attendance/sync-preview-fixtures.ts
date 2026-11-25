/** LOCAL SYNTHETIC sync-preview fixtures. Fixed fake ids, example.invalid addresses; never imported by production routes. */
import type { SyncInput } from './sync-preview';
import { SYNTHETIC_ENROLLMENT, SYNTHETIC_MEMBER, SYNTHETIC_OTHER_MEMBER, SYNTHETIC_OTHER_ORG, SYNTHETIC_OTHER_ORG_MEMBER, SYNTHETIC_ORG } from './synthetic-fixtures';

export const FX = {
  deletedUser: '00000000-0000-4000-8000-0000000000d1',
  program: 'synthetic-program', v1: 'synthetic-v1', v2: 'synthetic-v2',
  home: 'https://synthetic.invalid/accounts',
};
export function baseSyncInput(over: Partial<SyncInput> = {}): SyncInput {
  return {
    enrollment: { organizationId: SYNTHETIC_ORG, enrollmentId: SYNTHETIC_ENROLLMENT, userId: SYNTHETIC_MEMBER, userDeleted: false,
      userOrganizationId: SYNTHETIC_ORG, programSlug: FX.program, curriculumVersion: FX.v1 },
    orgUsers: { [SYNTHETIC_MEMBER]: { deleted: false }, [SYNTHETIC_OTHER_MEMBER]: { deleted: false }, [FX.deletedUser]: { deleted: true } },
    identityMappings: [
      { userId: SYNTHETIC_MEMBER, actorIdentifier: 'acct-member', actorHomePage: FX.home },
      { userId: SYNTHETIC_OTHER_MEMBER, actorIdentifier: 'acct-other', actorHomePage: FX.home },
      { userId: FX.deletedUser, actorIdentifier: 'acct-deleted', actorHomePage: FX.home },
    ],
    curriculumMappings: [
      { courseraCourseId: 'course-a', canonicalProgramSlug: FX.program, curriculumVersion: FX.v1, canonicalCourseSlug: 'course-a-v1' },
      { courseraCourseId: 'course-a', canonicalProgramSlug: FX.program, curriculumVersion: FX.v2, canonicalCourseSlug: 'course-a-v2' },
      { courseraCourseId: 'course-b', canonicalProgramSlug: FX.program, curriculumVersion: FX.v2, canonicalCourseSlug: 'course-b-v2' },
    ],
    curatedEmails: { 'member@example.invalid': SYNTHETIC_MEMBER },
    points: [], snapshots: [], adminEntries: [],
    period: { kind: 'weekly', selectedDate: '2026-09-09', startMonth: null },
    asOf: '2026-09-10T12:00:00Z',
    ...over,
  };
}
export { SYNTHETIC_OTHER_ORG, SYNTHETIC_OTHER_ORG_MEMBER };
