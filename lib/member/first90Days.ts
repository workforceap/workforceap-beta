/**
 * First 90 Days coach — pure stage logic (Plan 4, Phase 1).
 *
 * The check-in schedule is derived deterministically from
 * `PlacementRecord.placedAt` — no schema changes, no cron. Stages:
 *
 *   week_1  → days 0–13 after placement
 *   day_30  → days 14–44
 *   day_60  → days 45–74
 *   day_90  → days 75–104 (two-week grace so the 90-day check-in
 *             can still be completed after day 90)
 *
 * Check-in responses persist as `MemberEvent` rows
 * (eventName = FIRST90_CHECK_IN_EVENT, entityId = stage) — the same
 * generic store the dashboard already reads for session cards — so no
 * new tables are needed. Trouble reports escalate via the existing
 * `AtRiskAlert` pipeline that the counselor inbox already surfaces.
 */

import type { EventName } from '@/lib/events/names';

export const FIRST90_STAGES = ['week_1', 'day_30', 'day_60', 'day_90'] as const;
export type First90Stage = (typeof FIRST90_STAGES)[number];

export const FIRST90_RESPONSES = ['going_well', 'have_questions', 'having_trouble'] as const;
export type First90Response = (typeof FIRST90_RESPONSES)[number];

/** MemberEvent.eventName used to persist check-in responses. */
export const FIRST90_CHECK_IN_EVENT = 'first90_check_in_submitted' satisfies EventName;

/** Card stays visible through day 104 (90 days + two-week grace). */
export const FIRST90_WINDOW_DAYS = 104;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysSincePlacement(placedAt: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - placedAt.getTime()) / MS_PER_DAY);
}

/**
 * Current check-in stage for a placement, or null when the member is
 * outside the first-90-days window (not yet placed in the future-date
 * edge case, or past day 104).
 */
export function getFirst90Stage(placedAt: Date, now: Date = new Date()): First90Stage | null {
  const days = daysSincePlacement(placedAt, now);
  if (days < 0 || days > FIRST90_WINDOW_DAYS) return null;
  if (days <= 13) return 'week_1';
  if (days <= 44) return 'day_30';
  if (days <= 74) return 'day_60';
  return 'day_90';
}

export function isFirst90Stage(value: string): value is First90Stage {
  return (FIRST90_STAGES as readonly string[]).includes(value);
}

export function isFirst90Response(value: string): value is First90Response {
  return (FIRST90_RESPONSES as readonly string[]).includes(value);
}

export type First90CheckInRecord = {
  stage: First90Stage;
  response: First90Response;
  createdAt: Date;
};

/**
 * Map raw MemberEvent rows (entityId = stage, metadata.response) to typed
 * check-in records, keeping only the most recent response per stage.
 */
export function buildCheckInsByStage(
  events: Array<{ entityId: string | null; metadata: unknown; createdAt: Date }>,
): Partial<Record<First90Stage, First90CheckInRecord>> {
  const byStage: Partial<Record<First90Stage, First90CheckInRecord>> = {};
  // Events arrive newest-first from the dashboard query; first hit wins.
  for (const ev of events) {
    if (!ev.entityId || !isFirst90Stage(ev.entityId)) continue;
    if (byStage[ev.entityId]) continue;
    const meta = (ev.metadata ?? {}) as { response?: string };
    if (!meta.response || !isFirst90Response(meta.response)) continue;
    byStage[ev.entityId] = {
      stage: ev.entityId,
      response: meta.response,
      createdAt: ev.createdAt,
    };
  }
  return byStage;
}
