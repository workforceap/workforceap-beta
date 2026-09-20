/**
 * Command Center "System health" rows.
 *
 * Every row is either a real state computed from data the page already has
 * (or one cheap indexed query), or an honest "Not checked here" that says
 * where the check lives. Nothing here calls an external service: cron
 * freshness comes from the `CronExecution` rows the cron routes write via
 * `withCronLogging`, the same table `/admin/crons` reads.
 *
 * Pure module: the page loads the rows and passes them in, so the mapping is
 * unit-tested without Prisma.
 */
import type { KitTone } from '@/components/portal/kit/tokens';

export type CommandCenterHealthStatus = 'ok' | 'warn' | 'unknown';

export interface CommandCenterHealthRow {
  name: string;
  status: CommandCenterHealthStatus;
  /** Small caption, e.g. "Last run 2h ago" or the reason a check is not done here. */
  meta?: string;
  /** Chip text override (default: OK / Warn / Not verified by status). */
  statusLabel?: string;
  /** Chip tone override (default follows status). */
  tone?: KitTone;
  /** Where this is actually checked, when not here. */
  href?: string;
  hrefLabel?: string;
}

/** Latest `CronExecution` row for one job, as the page loads it. */
export interface CronRunSnapshot {
  jobName: string;
  status: string; // RUNNING | SUCCESS | FAILED | SKIPPED
  startedAt: Date;
  completedAt: Date | null;
}

export interface CronHealthDefinition {
  name: string;
  /** `jobName` written by `withCronLogging(workflowKey, …)` for the route. */
  jobName: string;
  /** Schedule cadence from vercel.json; a run older than 1.5x this is stale. */
  expectedEveryHours: number;
}

/** Where cron run history is inspected (every admin can open it). */
export const CRON_RUNS_HREF = '/admin/crons';

export const COMMAND_CENTER_CRON_ROWS: ReadonlyArray<CronHealthDefinition> = [
  // vercel.json: /api/cron/coursera-b4b-sync every 6h — the B4B enrollment
  // report import that feeds member course progress.
  { name: 'Coursera sync', jobName: 'cron_coursera_b4b_sync', expectedEveryHours: 6 },
  // vercel.json: /api/cron/at-risk-check daily — writes the AtRiskAlert rows
  // the "Who needs you today" queue reads.
  { name: 'At-risk scoring', jobName: 'cron_at_risk_check', expectedEveryHours: 24 },
];

const HOUR_MS = 60 * 60 * 1000;
const STALE_FACTOR = 1.5;

export function formatAgo(from: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - from.getTime());
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Real freshness state for one scheduled job from its latest execution row. */
export function cronHealthRow(
  def: CronHealthDefinition,
  latest: CronRunSnapshot | null,
  now: Date,
): CommandCenterHealthRow {
  const base = { name: def.name, href: CRON_RUNS_HREF, hrefLabel: 'Cron runs' };
  if (!latest) {
    return { ...base, status: 'unknown', meta: 'No run recorded yet' };
  }
  const staleMs = def.expectedEveryHours * STALE_FACTOR * HOUR_MS;
  const startedAgo = formatAgo(latest.startedAt, now);
  if (latest.status === 'FAILED') {
    return { ...base, status: 'warn', meta: `Last run failed ${startedAgo}` };
  }
  if (latest.status === 'RUNNING') {
    const runningMs = now.getTime() - latest.startedAt.getTime();
    return runningMs > staleMs
      ? { ...base, status: 'warn', meta: `Run started ${startedAgo} has not finished` }
      : { ...base, status: 'ok', meta: `Run in progress (started ${startedAgo})` };
  }
  const finishedAt = latest.completedAt ?? latest.startedAt;
  const ageMs = now.getTime() - finishedAt.getTime();
  const finishedAgo = formatAgo(finishedAt, now);
  if (ageMs > staleMs) {
    return {
      ...base,
      status: 'warn',
      meta: `Last run ${finishedAgo} · expected every ${def.expectedEveryHours}h`,
    };
  }
  return {
    ...base,
    status: 'ok',
    meta: latest.status === 'SKIPPED' ? `Last run skipped ${finishedAgo}` : `Last run ${finishedAgo}`,
  };
}

/** Honest placeholder: this page does not check it; here is where it is checked. */
export function notCheckedHereRow(input: {
  name: string;
  reason: string;
  href: string;
  hrefLabel: string;
}): CommandCenterHealthRow {
  return {
    name: input.name,
    status: 'unknown',
    statusLabel: 'Not checked here',
    tone: 'muted',
    meta: input.reason,
    href: input.href,
    hrefLabel: input.hrefLabel,
  };
}

export interface BuildSystemHealthInput {
  superAdmin: boolean;
  now: Date;
  slaBreaches48h: number;
  /** null when not loaded (tenant admins never load platform diagnostics). */
  recentCronErrors: number | null;
  workflowHealthLoadFailed: boolean;
  /**
   * Latest execution per job in COMMAND_CENTER_CRON_ROWS; null when the page
   * did not load them (tenant admins) or the query failed.
   */
  cronRuns: ReadonlyArray<CronRunSnapshot> | null;
}

/**
 * Order: platform jobs, then this org's reply SLA, then platform errors
 * (super admins), then payouts.
 *
 * Platform-wide cron freshness is global diagnostics, so like the existing
 * "Platform workflow errors" row it is computed for platform admins only;
 * tenant admins get an honest pointer to /admin/crons instead of a made-up
 * state. Payouts have no automated check anywhere yet: they are released per
 * partner from the partner record, so the row says so and links there.
 */
export function buildCommandCenterSystemHealth(input: BuildSystemHealthInput): CommandCenterHealthRow[] {
  const cronRows: CommandCenterHealthRow[] = COMMAND_CENTER_CRON_ROWS.map((def) => {
    if (!input.superAdmin) {
      return notCheckedHereRow({
        name: def.name,
        reason: 'Platform-wide job; run history is on the cron page',
        href: CRON_RUNS_HREF,
        hrefLabel: 'Cron runs',
      });
    }
    if (input.cronRuns === null) {
      return { name: def.name, status: 'unknown', meta: 'Could not read run history', href: CRON_RUNS_HREF, hrefLabel: 'Cron runs' };
    }
    const latest = input.cronRuns.find((run) => run.jobName === def.jobName) ?? null;
    return cronHealthRow(def, latest, input.now);
  });

  const sla: CommandCenterHealthRow = {
    name: 'Member reply SLA',
    status: input.slaBreaches48h > 0 ? 'warn' : 'ok',
    meta: input.slaBreaches48h > 0
      ? `${input.slaBreaches48h} threads waiting >48h`
      : 'No replies overdue by 48h',
  };

  const platformErrors: CommandCenterHealthRow[] = input.superAdmin
    ? [{
        name: 'Platform workflow errors',
        status: input.workflowHealthLoadFailed || input.recentCronErrors == null ? 'unknown'
          : input.recentCronErrors > 0 ? 'warn' : 'ok',
        meta: input.workflowHealthLoadFailed || input.recentCronErrors == null ? 'Could not check diagnostics'
          : `${input.recentCronErrors} errors recorded in 7 days`,
      }]
    : [];

  const payouts = notCheckedHereRow({
    name: 'Payouts',
    reason: 'Released per partner from the partner record; no automated check yet',
    href: '/admin/partners',
    hrefLabel: 'Partners',
  });

  return [...cronRows, sla, ...platformErrors, payouts];
}
