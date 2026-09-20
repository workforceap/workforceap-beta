import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { logCronRun } from '@/lib/admin/logCronRun';
import { runWithGucContext, SYSTEM_GUC_CONTEXT } from '@/lib/db/gucContext';
import { captureApiError } from '@/lib/observability/captureApiError';
import { hasReportedApiError, runWithApiErrorScope } from '@/lib/observability/apiErrorScope';
import { authorizeCronRequest } from './authorizeCronRequest';
import { isCronEnabled } from './isCronEnabled';
import { CRON_SECRET_BOOT_MESSAGE, decideCronSecretBootFromEnv } from './cronSecretPolicy';
import {
  startCronExecution,
  completeCronExecution,
  runWithCronExecution,
  getCronRecordsProcessed,
  hasCronDiagnosticBeenLogged,
} from './cronExecution';

// ── Production boot assertion (WAP-177 fix 6) ─────────────────────────────
// Mirrors lib/rate-limit.ts: a cron deployment with no CRON_SECRET must fail
// to load rather than answer 401 to every scheduled run with zero rows. Dev,
// test and `next build` stay open; previews opt out with
// CRON_ALLOW_MISSING_SECRET=1.
// ──────────────────────────────────────────────────────────────────────────
const cronSecretBoot = decideCronSecretBootFromEnv();
if (!cronSecretBoot.ok) {
  console.error(CRON_SECRET_BOOT_MESSAGE);
  throw new Error(CRON_SECRET_BOOT_MESSAGE);
}

const AUTH_REPORT_INTERVAL_MS = 300_000;

/**
 * Authorize before the handler runs; track every authorized execution and
 * report failures even when tracking/settings storage is unavailable.
 *
 * Auth rejections leave a trace (WAP-177 fix 1): at most once per five minutes
 * per wrapper/configuration state the wrapper reports the 401 and records a
 * `FAILED: unauthorized` CronExecution plus an error WorkflowDiagnostic under
 * the system GUC context. The throttle keeps unauthenticated traffic from
 * becoming an unbounded database write amplifier while still ensuring a
 * missing or rotated secret is visible on /admin/crons and in error reporting.
 */
export function withCronLogging(
  workflowKey: string,
  handler: (request: any) => Promise<any>,
) {
  let lastAuthReport: { at: number; reason: string } | undefined;
  const route = `cron/${workflowKey}`;

  const recordUnauthorizedAttempt = (reason: string) => runWithGucContext(SYSTEM_GUC_CONTEXT, async () => {
    const message = `unauthorized: ${reason}`;
    try {
      const executionId = await startCronExecution(workflowKey);
      await completeCronExecution(executionId, 'FAILED', message);
    } catch (trackingError) {
      captureApiError(trackingError, { route, extra: { phase: 'record_unauthorized' } });
    }
    await logCronRun(workflowKey, { ok: false, error: message, status: 401, reason }, 'error');
  });

  return (request: any): Promise<any> => runWithApiErrorScope(async () => {
    const unauthorized = authorizeCronRequest(request);
    if (unauthorized) {
      const reason = process.env.CRON_SECRET?.trim() ? 'unauthorized' : 'missing_secret';
      const now = Date.now();
      if (!lastAuthReport || lastAuthReport.reason !== reason || now - lastAuthReport.at >= AUTH_REPORT_INTERVAL_MS) {
        lastAuthReport = { at: now, reason };
        captureApiError(new Error('Cron authorization rejected'), { route, extra: { status: 401, reason } });
        await recordUnauthorizedAttempt(reason);
      }
      return unauthorized;
    }

    return runWithGucContext(SYSTEM_GUC_CONTEXT, async () => {
      let executionId: string | undefined;
      let phase = 'start_execution';

      const fail = async (error: unknown) => {
        unstable_rethrow(error);
        captureApiError(error, { route, extra: { phase } });
        const message = error instanceof Error ? error.message : 'Cron failed';
        if (executionId) {
          try {
            await completeCronExecution(executionId, 'FAILED', message);
          } catch (trackingError) {
            captureApiError(trackingError, { route, extra: { phase: 'record_failure' } });
          }
        }
        await logCronRun(workflowKey, { ok: false, error: message, phase }, 'error');
        return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
      };

      try {
        executionId = await startCronExecution(workflowKey);
      } catch (error) {
        return fail(error);
      }

      const currentExecutionId = executionId;
      return runWithCronExecution(currentExecutionId, async () => {
        try {
          phase = 'settings';
          if (!(await isCronEnabled(workflowKey))) {
            phase = 'record_skip';
            await completeCronExecution(currentExecutionId, 'SKIPPED');
            await logCronRun(workflowKey, { skipped: true, reason: 'disabled' }, 'ok');
            return NextResponse.json({ skipped: true, reason: 'disabled' });
          }

          phase = 'handler';
          const response = await handler(request);
          const responseStatus = response && typeof response.status === 'number' ? response.status : 200;
          const failed = responseStatus >= 400;
          const error = failed ? `Cron handler returned HTTP ${responseStatus}` : undefined;
          if (failed && !hasReportedApiError()) {
            captureApiError(new Error(error), { route, extra: { status: responseStatus } });
          }

          phase = 'record_result';
          if (failed) await completeCronExecution(currentExecutionId, 'FAILED', error);
          else await completeCronExecution(currentExecutionId, 'SUCCESS');
          if (!hasCronDiagnosticBeenLogged()) {
            const recordsProcessed = getCronRecordsProcessed();
            await logCronRun(workflowKey, {
              ok: !failed,
              status: responseStatus,
              ...(error ? { error } : {}),
              ...(recordsProcessed === undefined ? {} : { recordsProcessed }),
            }, failed ? 'error' : 'ok');
          }
          return response;
        } catch (error) {
          return fail(error);
        }
      });
    });
  });
}
