import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { markCronDiagnosticLogged } from '@/lib/cron/cronExecution';
import { captureApiError } from '@/lib/observability/captureApiError';

export async function logCronRun(
  workflowKey: string,
  result: Record<string, unknown>,
  status: 'ok' | 'error' = 'ok',
): Promise<void> {
  const metadata = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
  await prisma.workflowDiagnostic.create({
    data: {
      workflow: workflowKey,
      status,
      method: 'scheduled',
      summary: `Scheduled run: ${JSON.stringify(result).slice(0, 200)}`,
      metadata,
    },
  }).then(() => {
    // Only a row that actually landed suppresses the wrapper's fallback row.
    // If this write failed, withCronLogging should still get its chance to
    // leave a trace rather than both layers staying silent.
    markCronDiagnosticLogged();
  }).catch((err) => {
    captureApiError(err, { route: `cron/${workflowKey}`, extra: { phase: 'write_diagnostic' } });
  });
}
