import 'server-only';

import { getAdminAttention } from '@/lib/attention/admin';
import { selectByReason } from '@/lib/attention/evaluate';
import { ATTENTION_REASON_META } from '@/lib/attention/reasons';
import {
  STUDENTS_ROSTER_VIEW_HREFS,
  type StudentsNeeds,
  type StudentsRosterFocus,
  type StudentsRosterView,
} from '@/lib/admin/studentsRosterView';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScope';

export const STUDENTS_FOCUS_UNAVAILABLE_NOTICE =
  'The new-applicants filter could not load, so this is every student. Refresh in a few minutes, or use the list on Today.';

export type StudentsRosterFocusLoad = { focus: StudentsRosterFocus | null; failed: boolean };

/**
 * `/admin/students?needs=new-applicants` (WAP-198): the members behind the
 * admin Today's "N new applicants have no counselor" row. Same queue, same
 * rule (`new_no_counselor`), same tenant scope, so the roster shows exactly
 * the people that number counts. `getAdminAttention` is cached per request.
 *
 * Only the Students preset focuses (it has the Counselor column); the other
 * `needs=` values map to chips (`chipForStudentsNeeds`). A failed attention
 * read falls back to the full roster with a notice instead of an empty list.
 */
export async function loadStudentsRosterFocus(
  scope: AdminPageTenantOk,
  needs: StudentsNeeds | null,
  view: StudentsRosterView,
): Promise<StudentsRosterFocusLoad> {
  if (needs !== 'new-applicants' || view !== 'roster') return { focus: null, failed: false };
  try {
    const queue = await getAdminAttention(scope);
    return {
      focus: {
        label: 'New applicants with no counselor',
        detail: ATTENTION_REASON_META.new_no_counselor.definition,
        memberIds: selectByReason(queue, 'new_no_counselor').map((row) => row.memberId),
        clearHref: STUDENTS_ROSTER_VIEW_HREFS.roster,
      },
      failed: false,
    };
  } catch (reason) {
    console.error('[admin/students] new-applicants focus load failed', reason);
    return { focus: null, failed: true };
  }
}
