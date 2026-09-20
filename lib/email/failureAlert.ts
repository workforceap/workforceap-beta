/**
 * Threshold alert for failed email sends (WAP-163). 822 sends failed over ten
 * weeks with a diagnostic row each and nobody looking; the daily verification
 * cron now counts `email_send` errors in the last 24h and raises the existing
 * alert channels (Sentry via `captureApiError`, Discord via `notifyDiscord`)
 * whenever the count is above the threshold. `/admin/diagnostics` shows the
 * same count so the alert and the page agree.
 */
import type { PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { EMAIL_SEND_WORKFLOW } from '@/lib/email/failureRecord';
import { notifyDiscord } from '@/lib/notify/discord';
import { captureApiError } from '@/lib/observability/captureApiError';

export const EMAIL_FAILURE_ALERT_WINDOW_HOURS = 24;
/** Alert when failures in the window exceed this. Zero: any failed send is worth a look. */
export const EMAIL_FAILURE_ALERT_THRESHOLD = 0;

type FailureCountDb = Pick<PrismaClient, 'workflowDiagnostic'>;

export function emailFailureWindowStart(now: Date): Date {
  return new Date(now.getTime() - EMAIL_FAILURE_ALERT_WINDOW_HOURS * 60 * 60 * 1000);
}

export async function countRecentEmailFailures(db: FailureCountDb, now: Date): Promise<number> {
  return db.workflowDiagnostic.count({
    where: {
      workflow: EMAIL_SEND_WORKFLOW,
      status: 'error',
      createdAt: { gte: emailFailureWindowStart(now) },
    },
  });
}

export async function alertOnRecentEmailFailures(options: {
  db?: FailureCountDb;
  now?: Date;
  route?: string;
  siteUrl?: string;
} = {}): Promise<{ count: number; alerted: boolean; threshold: number }> {
  const db = options.db ?? prisma;
  const now = options.now ?? new Date();
  const route = options.route ?? 'cron/verification/email-failures';
  const siteUrl = options.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.workforceap.org';
  const count = await countRecentEmailFailures(db, now);
  const alerted = count > EMAIL_FAILURE_ALERT_THRESHOLD;
  if (alerted) {
    const message = `${count} email send${count === 1 ? '' : 's'} failed in the last ${EMAIL_FAILURE_ALERT_WINDOW_HOURS}h`;
    captureApiError(new Error(message), {
      route,
      extra: { count, threshold: EMAIL_FAILURE_ALERT_THRESHOLD, windowHours: EMAIL_FAILURE_ALERT_WINDOW_HOURS, diagnostics: '/admin/diagnostics' },
    });
    void notifyDiscord({
      title: 'Email sends failing',
      body: `${message}. Review and re-send them from the admin diagnostics page.`,
      url: `${siteUrl}/admin/diagnostics`,
      category: 'email',
      level: 'warn',
      fields: [{ name: 'Failed in 24h', value: String(count) }],
    }).catch(() => { /* fire-and-forget by contract */ });
  }
  return { count, alerted, threshold: EMAIL_FAILURE_ALERT_THRESHOLD };
}
