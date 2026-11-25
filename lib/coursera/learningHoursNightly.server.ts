import {
  getCourseGradebookReports,
  listPrograms,
  type B4BGradebookReport,
} from '@/lib/coursera/b4bClient';
import {
  recordLearningHoursSnapshots,
  snapshotInputsFromGradebook,
} from '@/lib/coursera/learningHoursSnapshot.server';
import { resolveUserIdsByCourseraEmails } from '@/lib/coursera/resolveUserIdByEmail';
import { getDefaultOrganizationId } from '@/lib/tenant/organization';

/**
 * Nightly capture of every learner's cumulative Coursera learning hours.
 *
 * Reads `courseGradebookReports` one program at a time, a page at a time,
 * so the call count grows with pages, not learners (B4B rate-limits hard).
 * Rows for emails we can't match to a member are still kept, with no user
 * id, the same way `coursera_course_progress` keeps unmatched rows, so a
 * later identity match does not lose the history.
 */

const PAGE_LIMIT = 500;
const MAX_PAGES_PER_PROGRAM = 20;
const MAX_PROGRAM_PAGES = 5;

export type LearningHoursNightlyResult = {
  programs: number;
  programErrors: number;
  rowsScanned: number;
  snapshotsWritten: number;
  skippedNoHours: number;
  skippedNoIdentity: number;
  unmatchedEmails: number;
  stoppedForTime: boolean;
};

export async function captureNightlyLearningHours(opts: {
  /** Stop starting new requests after this many ms; what is read so far is still written. */
  budgetMs: number;
  now?: () => number;
}): Promise<LearningHoursNightlyResult> {
  const now = opts.now ?? Date.now;
  const deadline = now() + opts.budgetMs;
  const outOfTime = () => now() >= deadline;

  const programIds: string[] = [];
  let programStart: number | undefined;
  for (let page = 0; page < MAX_PROGRAM_PAGES; page += 1) {
    const envelope = await listPrograms({ excludeContent: true, limit: 100, start: programStart });
    programIds.push(...envelope.elements.map((p) => p.id).filter(Boolean));
    if (envelope.paging.next == null || envelope.elements.length === 0) break;
    programStart = envelope.paging.next;
  }

  const rows: B4BGradebookReport[] = [];
  let programErrors = 0;
  let stoppedForTime = false;
  for (const programId of programIds) {
    if (outOfTime()) {
      stoppedForTime = true;
      break;
    }
    try {
      let start: number | undefined;
      for (let page = 0; page < MAX_PAGES_PER_PROGRAM; page += 1) {
        const envelope = await getCourseGradebookReports({ programId, start, limit: PAGE_LIMIT });
        rows.push(...envelope.elements);
        if (envelope.paging.next == null || envelope.elements.length === 0) break;
        if (outOfTime()) {
          stoppedForTime = true;
          break;
        }
        start = envelope.paging.next;
      }
    } catch (err) {
      // One program failing must not lose the others' readings.
      programErrors += 1;
      console.warn(
        `[learningHoursNightly] gradebook fetch failed for program=${programId}:`,
        err instanceof Error ? err.message : err,
      );
    }
    if (stoppedForTime) break;
  }

  const organizationId = await getDefaultOrganizationId();
  const emails = rows
    .map((row) => (row.email ?? (row.externalId?.includes('@') ? row.externalId : ''))?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email));
  const userByEmail = await resolveUserIdsByCourseraEmails(emails, { organizationId });

  const { inputs, skippedNoHours, skippedNoIdentity } = snapshotInputsFromGradebook(
    rows,
    (email) => ({ organizationId, userId: userByEmail.get(email) ?? null }),
    'b4b_gradebook_nightly',
  );
  const snapshotsWritten = await recordLearningHoursSnapshots(inputs, new Date(now()));

  return {
    programs: programIds.length,
    programErrors,
    rowsScanned: rows.length,
    snapshotsWritten,
    skippedNoHours,
    skippedNoIdentity,
    unmatchedEmails: new Set(inputs.filter((i) => !i.userId).map((i) => i.externalEmail)).size,
    stoppedForTime,
  };
}
