import vercelConfig from '../../vercel.json';

/**
 * Schedule captions for /admin/crons, derived from the committed vercel.json
 * `crons` list (what Vercel actually schedules), keyed by the
 * `CronExecution.jobName` the board groups on.
 *
 * `jobName` is the first argument each route passes to
 * `withCronLogging(...)` (lib/cron/withCronLogging.ts -> startCronExecution),
 * not the route segment: most routes record `cron_<segment_with_underscores>`,
 * a few do not (see below). The parity tests in lib/admin/cronScheduleKey.test.ts
 * fail when a vercel.json path has no entry here, and
 * tests/app/admin-crons-schedule-key.spec.tsx pins the page to it.
 */

type ScheduledCron = { path: string; schedule: string };

/**
 * vercel.json path -> the `CronExecution.jobName` its route records, or
 * `null` when the route writes no CronExecution rows (so it never appears on
 * the /admin/crons board).
 */
export const CRON_JOB_NAME_BY_PATH: Readonly<Record<string, string | null>> = {
  '/api/cron/applicant-followup': 'cron_applicant_followup',
  '/api/cron/applicant-aging-digest': 'cron_applicant_aging_digest',
  '/api/cron/at-risk-alerts': 'cron_at_risk_alerts',
  '/api/cron/at-risk-check': 'cron_at_risk_check',
  '/api/cron/coursera-auto-heal': 'cron_coursera_auto_heal',
  '/api/cron/coursera-b4b-sync': 'cron_coursera_b4b_sync',
  '/api/cron/coursera-sync': 'cron_coursera_sync',
  '/api/cron/coursera-training-sync': 'cron_coursera_training_sync',
  '/api/cron/course-accountability': 'cron_course_accountability',
  // No `cron_` prefix: withCronLogging('data_cleanup').
  '/api/cron/data-cleanup': 'data_cleanup',
  '/api/cron/deploy-health': 'cron_deploy_health',
  '/api/cron/inactive-nudge': 'cron_inactive_nudge',
  '/api/cron/inactivity-nudge': 'cron_inactivity_nudge',
  '/api/cron/interview-reminders': 'cron_interview_reminders',
  '/api/cron/onboarding-stalls': 'cron_onboarding_stalls',
  '/api/cron/employer-pending-applicants': 'cron_employer_pending_applicants',
  '/api/cron/job-expiry': 'cron_job_expiry',
  '/api/cron/retention-decisions': 'cron_retention_decisions',
  '/api/cron/job-alerts': 'cron_job_alerts',
  // No `cron_` prefix: WORKFLOW_KEY = 'milestone_cascade_draft' / '..._expire'.
  '/api/cron/milestone-cascade-draft': 'milestone_cascade_draft',
  '/api/cron/milestone-cascade-expire': 'milestone_cascade_expire',
  '/api/cron/milestone-celebration': 'cron_milestone_celebration',
  // Shortened: withCronLogging('cron_partner_digest').
  '/api/cron/partner-outcome-digest': 'cron_partner_digest',
  '/api/cron/placement-survey': 'cron_placement_survey',
  '/api/cron/smoke-test': 'cron_smoke_test',
  '/api/cron/stale-training-check': 'cron_stale_training_check',
  '/api/cron/verification': 'cron_verification',
  '/api/cron/weekly-recap': 'cron_weekly_recap',
  '/api/cron/weekly-recap-email': 'cron_weekly_recap_email',
  '/api/cron/wioa-report': 'cron_wioa_report',
  // Outside /api/cron: GET is withCronLogging('cron_webhook_process_retries').
  '/api/admin/webhooks/process-retries': 'cron_webhook_process_retries',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const INT = /^\d+$/;
const STEP = /^\*\/(\d+)$/;

function inRange(value: string, min: number, max: number): boolean {
  if (!INT.test(value)) return false;
  const n = Number(value);
  return n >= min && n <= max;
}

function clock(hour: number, minute: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/**
 * A plain-language UTC caption for a 5-field cron expression, to the minute.
 * Covers the shapes vercel.json uses; anything else is shown as the raw
 * expression rather than a guessed description.
 */
export function formatCronSchedule(expression: string): string {
  const raw = `${expression} (UTC)`;
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return raw;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (month !== '*') return raw;

  const everyMinutes = STEP.exec(minute);
  if (everyMinutes && hour === '*' && dayOfMonth === '*' && dayOfWeek === '*') {
    return `Every ${everyMinutes[1]} minutes`;
  }
  if (!inRange(minute, 0, 59)) return raw;
  const mm = String(Number(minute)).padStart(2, '0');

  if (hour === '*' && dayOfMonth === '*' && dayOfWeek === '*') return `Hourly at :${mm} UTC`;
  const everyHours = STEP.exec(hour);
  if (everyHours && dayOfMonth === '*' && dayOfWeek === '*') return `Every ${everyHours[1]} hours at :${mm} UTC`;
  if (!inRange(hour, 0, 23)) return raw;
  const at = `${clock(Number(hour), Number(minute))} UTC`;

  if (dayOfMonth === '*' && dayOfWeek === '*') return `Daily ${at}`;
  if (dayOfMonth === '*' && inRange(dayOfWeek, 0, 7)) return `${WEEKDAYS[Number(dayOfWeek) % 7]} ${at}`;
  if (dayOfWeek !== '*') return raw;
  if (inRange(dayOfMonth, 1, 31)) return `Monthly on the ${ordinal(Number(dayOfMonth))}, ${at}`;
  // `*/N` in day-of-month runs on days 1, 1+N, ... and restarts on the 1st.
  const everyDays = STEP.exec(dayOfMonth);
  if (everyDays) return `Every ${everyDays[1]} days from the 1st of the month, ${at}`;
  return raw;
}

/** jobName -> caption for every scheduled path that records CronExecution rows. */
export function buildCronScheduleKey(
  crons: readonly ScheduledCron[],
  jobNameByPath: Readonly<Record<string, string | null>>,
): Record<string, string> {
  const key: Record<string, string> = {};
  for (const cron of crons) {
    const jobName = jobNameByPath[cron.path];
    if (!jobName) continue;
    key[jobName] = formatCronSchedule(cron.schedule);
  }
  return key;
}

/** The /admin/crons schedule key: `CronExecution.jobName` -> caption. */
export const CRON_SCHEDULE_BY_JOB: Readonly<Record<string, string>> = buildCronScheduleKey(
  vercelConfig.crons,
  CRON_JOB_NAME_BY_PATH,
);

/**
 * The raw vercel.json expression per `CronExecution.jobName`, for every
 * scheduled path that records CronExecution rows. /admin/crons reads it for
 * the expected run interval (lib/cron/cronFreshness.ts).
 */
export const CRON_EXPRESSION_BY_JOB: Readonly<Record<string, string>> = Object.fromEntries(
  vercelConfig.crons.flatMap((cron) => {
    const jobName = CRON_JOB_NAME_BY_PATH[cron.path];
    return jobName ? [[jobName, cron.schedule]] : [];
  }),
);
