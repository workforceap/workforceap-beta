import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/observability/logger';
import { EMAIL_DELIVERY_SLO_WORKFLOW, XAPI_INGESTION_SLO_WORKFLOW } from '@/lib/observability/sloObservations';

export type SloReport = {
  id: string;
  name: string;
  target: string;
  current: string | null;
  status: 'within' | 'breaching' | 'unknown';
  source: string;
  note?: string;
};

export type TimedSloCounts = {
  total: bigint | number | string;
  satisfied: bigint | number | string;
  unobserved: bigint | number | string;
};

const DAY_MS = 86_400_000;

/** Compare full-precision counts, not the rounded display percentage. */
export function evaluateTimedSlo(
  report: Omit<SloReport, 'current' | 'status'>,
  counts: TimedSloCounts | undefined,
  targetPercent: number,
): SloReport {
  const total = Number(counts?.total ?? 0);
  const satisfied = Number(counts?.satisfied ?? 0);
  const unobserved = Number(counts?.unobserved ?? 0);
  if (![total, satisfied, unobserved].every((n) => Number.isSafeInteger(n) && n >= 0) || satisfied + unobserved > total) {
    return { ...report, current: null, status: 'unknown', note: 'Observation counts are incomplete or invalid' };
  }
  if (unobserved > 0) {
    return { ...report, current: null, status: 'unknown', note: `${unobserved} of ${total} observations lack a usable outcome; no percentage is inferred. ${report.note ?? ''}`.trim() };
  }
  if (total === 0) {
    return { ...report, current: null, status: 'unknown', note: `No eligible observations in the rolling 7-day window. ${report.note ?? ''}`.trim() };
  }
  const percentage = satisfied / total * 100;
  return {
    ...report,
    current: `${percentage.toFixed(2)}%`,
    status: BigInt(satisfied) * BigInt(10_000) >= BigInt(total) * BigInt(Math.round(targetPercent * 100)) ? 'within' : 'breaching',
    note: `${satisfied} of ${total} eligible observations met the deadline. ${report.note ?? ''}`.trim(),
  };
}

const emailReport = {
  id: 'email_delivered_5min',
  name: 'Email delivered within 5 min',
  target: '99% in 5 min',
  source: 'email_send_logs + immutable signed Resend delivery observations, rolling 7 days',
  note: 'Deduplicated non-skipped sends; timing starts at the first logged send. Org admins see account-linked sends in their organization. Historical latest-event timestamps do not establish immutable delivery evidence.',
};

export async function measureEmailDelivery(organizationId: string | null, now: Date): Promise<SloReport> {
  if (!process.env.RESEND_WEBHOOK_SECRET?.trim()) {
    return { ...emailReport, current: null, status: 'unknown', note: 'RESEND_WEBHOOK_SECRET not configured — delivery measurement unavailable' };
  }
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const matured = new Date(now.getTime() - 5 * 60_000);
  try {
    const rows = await prisma.$queryRaw<TimedSloCounts[]>`
      WITH delivery_evidence AS (
        SELECT entity_id,
          MIN(CASE
            WHEN metadata->>'version' = '1' AND metadata->>'event' = 'delivered'
              AND jsonb_typeof(metadata->'eventAtMs') = 'number'
            THEN (metadata->>'eventAtMs')::numeric
          END) AS delivered_ms
        FROM workflow_diagnostics
        WHERE workflow = ${EMAIL_DELIVERY_SLO_WORKFLOW}
          AND entity_type = 'email_send_log'
          AND status = 'success'
          AND created_at >= ${since} AND created_at <= ${now}
        GROUP BY entity_id
      ), eligible AS (
        SELECT e.status, e.last_event, e.bounce_type, e.provider_message_id,
          EXTRACT(EPOCH FROM e.created_at) * 1000 AS queued_ms,
          d.delivered_ms
        FROM email_send_logs e
        LEFT JOIN users u ON u.id = e.user_id
        LEFT JOIN delivery_evidence d ON d.entity_id = e.id
        WHERE e.created_at >= ${since} AND e.created_at <= ${matured}
          AND e.status <> 'skipped' AND e.provider = 'resend'
          AND (${organizationId}::text IS NULL OR u.organization_id = ${organizationId})
      )
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE delivered_ms >= queued_ms AND delivered_ms <= queued_ms + 300000) AS satisfied,
        COUNT(*) FILTER (WHERE
          (delivered_ms IS NOT NULL AND (delivered_ms < queued_ms OR delivered_ms > ${now.getTime()}))
          OR (delivered_ms IS NULL AND NOT (status = 'failed' AND provider_message_id IS NULL)
            AND NOT (COALESCE(last_event, '') = 'failed'
              OR (COALESCE(last_event, '') = 'bounced' AND LOWER(COALESCE(bounce_type, '')) = 'permanent')))
        ) AS unobserved
      FROM eligible
    `;
    return evaluateTimedSlo(emailReport, rows[0], 99);
  } catch (error) {
    logger.warn('slo email delivery query failed', { errorName: error instanceof Error ? error.name : 'unknown' });
    return { ...emailReport, current: null, status: 'unknown', note: 'Delivery query unavailable — see server logs' };
  }
}

const xapiReport = {
  id: 'coursera_xapi_ingestion',
  name: 'Coursera xAPI ingestion success',
  target: '99.5% within 60 s',
  source: 'Authenticated /api/xapi statement persistence observations, rolling 7 days',
  note: 'Recorded inbound statement attempts, including retries and raw unparsed statements. Earlier traffic without batch observations is unavailable; downstream member/course matching is a separate signal.',
};

export async function measureCourseraIngestion(organizationId: string | null, now: Date): Promise<SloReport> {
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const matured = new Date(now.getTime() - 60_000);
  try {
    const rows = await prisma.$queryRaw<TimedSloCounts[]>`
      WITH batches AS (
        SELECT status,
          CASE WHEN metadata->>'version' = '1'
            AND jsonb_typeof(metadata->'received') = 'number'
            THEN (metadata->>'received')::numeric END AS received,
          CASE WHEN metadata->>'version' = '1'
            AND jsonb_typeof(metadata->'persistedWithin60s') = 'number'
            THEN (metadata->>'persistedWithin60s')::numeric END AS persisted
        FROM workflow_diagnostics
        WHERE workflow = ${XAPI_INGESTION_SLO_WORKFLOW} AND entity_type = 'organization'
          AND created_at >= ${since} AND created_at <= ${matured}
          AND (${organizationId}::text IS NULL OR entity_id = ${organizationId})
      ), checked AS (
        SELECT *, received IS NOT NULL AND received >= 1 AND received = FLOOR(received)
          AND persisted IS NOT NULL AND persisted >= 0 AND persisted <= received AND persisted = FLOOR(persisted)
          AND status = 'success' AS usable
        FROM batches
      )
      SELECT COALESCE(SUM(CASE WHEN received >= 1 AND received = FLOOR(received) THEN received ELSE 1 END), 0) AS total,
        COALESCE(SUM(CASE WHEN usable THEN persisted ELSE 0 END), 0) AS satisfied,
        COALESCE(SUM(CASE WHEN usable THEN 0 ELSE CASE WHEN received >= 1 AND received = FLOOR(received) THEN received ELSE 1 END END), 0) AS unobserved
      FROM checked
    `;
    return evaluateTimedSlo(xapiReport, rows[0], 99.5);
  } catch (error) {
    logger.warn('slo xapi ingestion query failed', { errorName: error instanceof Error ? error.name : 'unknown' });
    return { ...xapiReport, current: null, status: 'unknown', note: 'Ingestion observation query unavailable — see server logs' };
  }
}
