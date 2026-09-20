/**
 * Applicant chase schedule (WAP-167).
 *
 * `cron/applicant-followup` used to email applicants only while their
 * application was 3–6 days old; after day 6 nothing chased an application
 * again (75 pending at a 115-day median on 2026-09-18). Three bounded stages
 * now exist. Each window is as wide as the cron cadence (every 3 days), which
 * remains the primary "one email per applicant per stage" guarantee; the
 * `application_reminder_sent` MemberEvent ledger is the second guard against a
 * re-run inside a window. Windows are deliberately closed at the top: nobody
 * older than 23 days is emailed automatically. Reaching the applicants who
 * aged past that before this shipped is a staff decision, not a cron's.
 */
import type { EventName } from '@/lib/events/names';

export type ApplicantChaseStageId = 'day3' | 'day10' | 'day20';

export interface ApplicantChaseStage {
  stage: ApplicantChaseStageId;
  /** Application age (days since submission) at which the window opens. */
  minDays: number;
  /** Last age (inclusive) the window still covers. */
  maxDays: number;
}

export const APPLICANT_CHASE_STAGES: readonly ApplicantChaseStage[] = [
  { stage: 'day3', minDays: 3, maxDays: 6 },
  { stage: 'day10', minDays: 10, maxDays: 13 },
  { stage: 'day20', minDays: 20, maxDays: 23 },
];

export const APPLICANT_CHASE_EVENT: EventName = 'application_reminder_sent';
export const APPLICATION_ENTITY_TYPE = 'application';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `submittedAt` bounds for a stage: between `maxDays` and `minDays` ago. */
export function chaseWindow(stage: ApplicantChaseStage, now: Date): { gte: Date; lte: Date } {
  return {
    gte: new Date(now.getTime() - stage.maxDays * DAY_MS),
    lte: new Date(now.getTime() - stage.minDays * DAY_MS),
  };
}

/** Stage whose window covers an application of this age, if any. */
export function stageForAgeDays(ageDays: number): ApplicantChaseStageId | null {
  const match = APPLICANT_CHASE_STAGES.find((s) => ageDays >= s.minDays && ageDays <= s.maxDays);
  return match?.stage ?? null;
}

export function chaseLedgerKey(applicationId: string, stage: ApplicantChaseStageId): string {
  return `${applicationId}:${stage}`;
}

/**
 * Build the "already sent" set from stored `application_reminder_sent`
 * events. Rows without a stage in their metadata predate the stages and are
 * treated as the Day-3 send, which is the only chase that existed then.
 */
export function chaseLedgerFromEvents(
  events: ReadonlyArray<{ entityId: string | null; metadata: unknown }>,
): Set<string> {
  const ledger = new Set<string>();
  for (const event of events) {
    if (!event.entityId) continue;
    const metadata = event.metadata !== null && typeof event.metadata === 'object'
      ? (event.metadata as Record<string, unknown>)
      : {};
    const stage = typeof metadata.stage === 'string' ? metadata.stage : 'day3';
    ledger.add(chaseLedgerKey(event.entityId, stage as ApplicantChaseStageId));
  }
  return ledger;
}
