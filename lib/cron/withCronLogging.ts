import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { logCronRun } from '@/lib/admin/logCronRun';
import { runWithGucContext, SYSTEM_GUC_CONTEXT } from '@/lib/db/gucContext';
import { captureApiError } from '@/lib/observability/captureApiError';
import { hasReportedApiError, runWithApiErrorScope } from '@/lib/observability/apiErrorScope';
import { authorizeCronRequest } from './authorizeCronRequest';
import { isCronEnabled } from './isCronEnabled';
import {
  startCronExecution,
  completeCronExecution,
  runWithCronExecution,
  getCronRecordsProcessed,
  hasCronDiagnosticBeenLogged,
} from './cronExecution';

/**
 * Authorize before database work; track every authorized execution and report
 * failures even when tracking/settings storage is unavailable. Auth rejections
 * are reported at most once per five minutes per wrapper/configuration state,
 * without turning unauthenticated requests into database writes.
 */
export function withCronLogging(
  workflowKey: string,
  handler: (request: any) => Promise<any>,
) {
  let lastAuthReport: { at: number; reason: string } | undefined;
  const route = `cron/${workflowKey}`;

  return (request: any): Promise<any> => runWithApiErrorScope(async () => {
    const unauthorized = authorizeCronRequest(request);
    if (unauthorized) {
      const reason = process.env.CRON_SECRET?.trim() ? 'unauthorized' : 'missing_secret';
      const now = Date.now();
      if (!lastAuthReport || lastAuthReport.reason !== reason || now - lastAuthReport.at >= 300_000) {
        lastAuthReport = { at: now, reason };
        captureApiError(new Error('Cron authorization rejected'), { route, extra: { status: 401, reason } });
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
