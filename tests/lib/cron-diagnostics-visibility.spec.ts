import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/cron/at-risk-alerts` returned HTTP 401 to its own Vercel scheduler from
 * 2026-08-31 to 2026-09-07. Each run was recorded FAILED in `cron_executions`
 * with "Cron handler returned HTTP 401" — and wrote nothing at all to
 * `workflow_diagnostics`, because `withCronLogging` only logged a diagnostic on
 * the SKIPPED and thrown-exception paths. Production bears this out: that
 * workflow has zero diagnostic rows across its whole history, successes
 * included, while every route that calls `logCronRun` inside its own handler
 * has hundreds. Counselor at-risk alerts and member retention nudges went
 * undelivered for three weeks with no diagnostic trace to notice.
 *
 * These tests use the real cronExecution store, the real logCronRun and the
 * real wrapper — only Prisma is faked — so the handoff under test is the actual
 * one: logCronRun marks the execution, and the wrapper honours that mark
 * instead of writing a second row.
 */

type DiagnosticRow = {
  workflow: string;
  status: string;
  method: string;
  summary: string;
  metadata: Record<string, unknown>;
};

const diagnostics: DiagnosticRow[] = [];
const executions = new Map<string, Record<string, unknown>>();
let executionSeq = 0;

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    cronExecution: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        executionSeq += 1;
        const id = `exec-${executionSeq}`;
        executions.set(id, { ...data });
        return { id };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        executions.get(where.id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        executions.set(where.id, { ...(executions.get(where.id) ?? {}), ...data });
        return executions.get(where.id);
      }),
    },
    workflowDiagnostic: {
      create: vi.fn(async ({ data }: { data: DiagnosticRow }) => {
        diagnostics.push(data);
        return data;
      }),
    },
  },
}));

vi.mock('@/lib/db/gucContext', () => ({
  getGucContext: () => undefined,
  SYSTEM_GUC_CONTEXT: { userId: null, organizationId: null, role: 'system' },
  runWithGucContext: (_context: unknown, callback: () => unknown) => callback(),
}));

vi.mock('@/lib/cron/authorizeCronRequest', () => ({
  authorizeCronRequest: () => null,
}));

vi.mock('@/lib/cron/isCronEnabled', () => ({
  isCronEnabled: async () => true,
}));

import { NextResponse } from 'next/server';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { withCronLogging } from '@/lib/cron/withCronLogging';

function request(): Request {
  return new Request('http://localhost:3000/api/cron/test');
}

function rowsFor(workflow: string): DiagnosticRow[] {
  return diagnostics.filter((row) => row.workflow === workflow);
}

describe('cron diagnostics visibility', () => {
  beforeEach(() => {
    diagnostics.length = 0;
    executions.clear();
    executionSeq = 0;
  });

  it('records a diagnostic row when a wrapper-only handler succeeds', async () => {
    const wrapped = withCronLogging('cron_wrapper_only', async () =>
      NextResponse.json({ ok: true }),
    );

    const response = await wrapped(request());

    expect(response.status).toBe(200);
    const rows = rowsFor('cron_wrapper_only');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ok');
    expect(rows[0].metadata).toMatchObject({ ok: true, status: 200 });
  });

  it('records a diagnostic row when a handler returns an error status', async () => {
    // The at-risk-alerts failure shape: the handler returns 401 rather than
    // throwing, so the catch block never runs.
    const wrapped = withCronLogging('cron_at_risk_alerts', async () =>
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const response = await wrapped(request());

    expect(response.status).toBe(401);
    const rows = rowsFor('cron_at_risk_alerts');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('error');
    expect(rows[0].metadata).toMatchObject({
      ok: false,
      status: 401,
      error: 'Cron handler returned HTTP 401',
    });
    // The CronExecution record still says FAILED, as it always did.
    expect([...executions.values()][0]).toMatchObject({
      status: 'FAILED',
      errorMessage: 'Cron handler returned HTTP 401',
    });
  });

  it('carries the handler-reported record count onto the success row', async () => {
    const wrapped = withCronLogging('cron_wrapper_only', async () => {
      await setCronRecordsProcessed(127);
      return NextResponse.json({ ok: true });
    });

    await wrapped(request());

    expect(rowsFor('cron_wrapper_only')[0].metadata).toMatchObject({
      ok: true,
      recordsProcessed: 127,
    });
  });

  it('does not duplicate a row the handler logged itself', async () => {
    // 28 of the 29 cron routes log their own diagnostic. They must keep
    // producing exactly one row, with their own payload.
    const wrapped = withCronLogging('cron_logs_itself', async () => {
      await logCronRun('cron_logs_itself', { scanned: 4, sent: 2 }, 'ok');
      return NextResponse.json({ ok: true });
    });

    await wrapped(request());

    const rows = rowsFor('cron_logs_itself');
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toEqual({ scanned: 4, sent: 2 });
  });

  it('does not duplicate a row when a self-logging handler then returns 500', async () => {
    const wrapped = withCronLogging('cron_logs_then_fails', async () => {
      await logCronRun('cron_logs_then_fails', { error: 'upstream refused' }, 'error');
      return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
    });

    await wrapped(request());

    const rows = rowsFor('cron_logs_then_fails');
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toEqual({ error: 'upstream refused' });
  });

  it('keeps the logged mark scoped to one execution', async () => {
    // The mark lives in AsyncLocalStorage, so a route that logs its own row on
    // one run must not suppress the wrapper's row on the next.
    let logOwnRow = true;
    const wrapped = withCronLogging('cron_alternating', async () => {
      if (logOwnRow) await logCronRun('cron_alternating', { own: true }, 'ok');
      return NextResponse.json({ ok: true });
    });

    await wrapped(request());
    logOwnRow = false;
    await wrapped(request());

    const rows = rowsFor('cron_alternating');
    expect(rows).toHaveLength(2);
    expect(rows[0].metadata).toEqual({ own: true });
    expect(rows[1].metadata).toMatchObject({ ok: true, status: 200 });
  });

  it('still logs exactly one row for a handler that throws', async () => {
    const wrapped = withCronLogging('cron_throws', async () => {
      throw new Error('boom');
    });

    const response = await wrapped(request());

    expect(response.status).toBe(500);
    const rows = rowsFor('cron_throws');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('error');
    expect(rows[0].metadata).toMatchObject({ ok: false, error: 'boom' });
  });
});
