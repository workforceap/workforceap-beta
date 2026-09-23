/**
 * Pure freshness verdict for the staff "Diagnose Coursera connection" report
 * (lib/admin/diagnoseMemberCoursera.ts). Kept free of Prisma and server
 * imports so node:test can cover every branch.
 *
 * The question it answers: are this learner's progress numbers current, and
 * if they are not, is the sync behind or has the learner simply not finished?
 * A stale sync must never read as "learner inactive", and a current sync with
 * no rows for the learner must never read as "sync broken".
 */

/**
 * The B4B cron runs every 6 hours (vercel.json `30 *\/6 * * *`). Two missed
 * runs is stale. Same rule as the "B4B course rows" card on
 * /admin/coursera/health.
 */
export const COURSERA_SYNC_STALE_HOURS = 12;

export type CourseraFreshnessFacts = {
  /** MAX(last_synced_at) over b4b_sync rows in the member's organization. */
  orgLastB4BSyncAt: Date | null;
  /** last_synced_at of this learner's most recently written raw Coursera row. */
  memberLastSyncAt: Date | null;
  /** `source` of that row (b4b_sync, csv_import, ...): the provenance. */
  memberLastSyncSource: string | null;
  /** Latest coursera_xapi_events.received_at for this learner. */
  lastXapiReceivedAt: Date | null;
  /** Newest learner activity seen by B4B or by the canonical progress rows. */
  lastLearnerActivityAt: Date | null;
};

export type FreshnessState =
  | 'sync_stale'
  | 'not_seen_by_sync'
  | 'sync_current_incomplete'
  | 'sync_current_complete';

export type DiagnoseVerdictItem = {
  status: 'ok' | 'warn' | 'fail';
  title: string;
  detail: string;
};

export function latestDate(...dates: Array<Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const d of dates) {
    if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
  }
  return latest;
}

function formatAge(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function describe(date: Date | null, now: Date, missing: string): string {
  return date ? `${date.toISOString()} (${formatAge(date, now)})` : missing;
}

export function freshnessVerdict(args: {
  facts: CourseraFreshnessFacts;
  hasCanonicalEnrollment: boolean;
  allProgramsComplete: boolean;
  now: Date;
}): (DiagnoseVerdictItem & { state: FreshnessState }) | null {
  const { facts, hasCanonicalEnrollment, allProgramsComplete, now } = args;
  if (!hasCanonicalEnrollment) return null;

  const staleMs = COURSERA_SYNC_STALE_HOURS * 60 * 60 * 1000;
  const orgSync = facts.orgLastB4BSyncAt;
  const activity = describe(facts.lastLearnerActivityAt, now, 'no learner activity recorded');

  if (!orgSync || now.getTime() - orgSync.getTime() > staleMs) {
    const xapi = facts.lastXapiReceivedAt
      ? ` xAPI (live events) last arrived for this learner ${describe(facts.lastXapiReceivedAt, now, '')}, so course progress from that channel may still be current.`
      : '';
    return {
      state: 'sync_stale',
      status: 'warn',
      title: orgSync
        ? `B4B sync is stale: last row write ${formatAge(orgSync, now)}`
        : 'B4B sync is stale: it has never written a row in this organization',
      detail:
        `No B4B row was written in this organization in the last ${COURSERA_SYNC_STALE_HOURS}h, so this member's numbers may be behind Coursera. ` +
        'This is not evidence that the learner is inactive. Check the cron_coursera_b4b_sync receipts on /admin/coursera/health.' +
        xapi,
    };
  }

  if (!facts.memberLastSyncAt) {
    return {
      state: 'not_seen_by_sync',
      status: 'warn',
      title: 'Sync is current but has never written this learner',
      detail:
        `The B4B sync last wrote rows in this organization ${formatAge(orgSync, now)}, but none for this member. ` +
        "The member's email is probably not on the Coursera Enterprise roster, or the invite has not been accepted. " +
        'Check /admin/coursera/inspect-by-email.',
    };
  }

  const provenance = `Last row for this learner: ${describe(facts.memberLastSyncAt, now, '')}, source ${facts.memberLastSyncSource ?? 'unknown'}.`;
  if (allProgramsComplete) {
    return {
      state: 'sync_current_complete',
      status: 'ok',
      title: 'Sync is current: all program courses complete',
      detail: `${provenance} Last learner activity: ${activity}.`,
    };
  }
  return {
    state: 'sync_current_incomplete',
    status: 'ok',
    title: 'Sync is current: program not yet complete',
    detail:
      `${provenance} Last learner activity: ${activity}. ` +
      'The sync is running, so unfinished courses point to the learner not having finished rather than a sync delay. ' +
      'The sync pages through the roster in windows, so this learner\'s last row can trail the organization\'s latest write.',
  };
}
