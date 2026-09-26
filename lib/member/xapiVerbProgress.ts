import { CourseProgressStatus } from '@prisma/client';

import { isXapiCourseProgressVerb } from '@/lib/xapi/statementModel';
import type { ParsedXapiStatement } from '@/lib/xapi/statementModel';

/** Maps xAPI verbs to the next `CourseProgressStatus` for upserts (pure).
 *  Recheck the shared course-progress classification here so an isolated caller
 *  cannot complete a whole course from one lesson's `completed` or `passed` verb. */
export function inferCourseProgressStatusFromXapiVerb(
  parsed: ParsedXapiStatement
): CourseProgressStatus | null {
  if (!isXapiCourseProgressVerb(parsed)) return null;

  const verbId = (parsed.verbId ?? '').toLowerCase();
  if (verbId.includes('completed') || verbId.includes('passed')) {
    return CourseProgressStatus.COMPLETED;
  }
  if (
    verbId.includes('started')
    || verbId.includes('registered')
    || verbId.includes('initialized')
    || verbId.includes('progressed')
  ) {
    return CourseProgressStatus.IN_PROGRESS;
  }
  return null;
}
