import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CommandCenterKit } from '@/components/portal/kit/pages/admin/CommandCenterKit';
import {
  COMMAND_CENTER_CRON_ROWS,
  CRON_RUNS_HREF,
  buildCommandCenterSystemHealth,
  cronHealthRow,
  formatAgo,
  notCheckedHereRow,
  type CronRunSnapshot,
} from '@/lib/admin/commandCenterHealth';

/**
 * Command Center "System health" (admin audit gap map, wave 16): no row may
 * say NOT VERIFIED for something the platform already records. Cron rows come
 * from CronExecution freshness; the SLA row from the org's thread count; rows
 * this page cannot check say "Not checked here" and link to where it lives.
 */
const NOW = new Date('2026-09-20T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const COURSERA = COMMAND_CENTER_CRON_ROWS[0];
const AT_RISK = COMMAND_CENTER_CRON_ROWS[1];

const run = (jobName: string, status: string, startedH: number, completedH: number | null = startedH): CronRunSnapshot => ({
  jobName,
  status,
  startedAt: hoursAgo(startedH),
  completedAt: completedH === null ? null : hoursAgo(completedH),
});

describe('cron definitions', () => {
  it('map the two health rows to the jobNames the cron routes record', () => {
    expect(COURSERA).toEqual({ name: 'Coursera sync', jobName: 'cron_coursera_b4b_sync', expectedEveryHours: 6 });
    expect(AT_RISK).toEqual({ name: 'At-risk scoring', jobName: 'cron_at_risk_check', expectedEveryHours: 24 });
    expect(CRON_RUNS_HREF).toBe('/admin/crons');
  });
});

describe('formatAgo', () => {
  it('rounds to minutes, hours, then days', () => {
    expect(formatAgo(NOW, NOW)).toBe('just now');
    expect(formatAgo(new Date(NOW.getTime() - 5 * 60000), NOW)).toBe('5m ago');
    expect(formatAgo(hoursAgo(3), NOW)).toBe('3h ago');
    expect(formatAgo(hoursAgo(47), NOW)).toBe('47h ago');
    expect(formatAgo(hoursAgo(72), NOW)).toBe('3d ago');
  });
});

describe('cronHealthRow', () => {
  it('is unknown (not verified) only when no run was ever recorded', () => {
    expect(cronHealthRow(COURSERA, null, NOW)).toEqual({
      name: 'Coursera sync',
      status: 'unknown',
      meta: 'No run recorded yet',
      href: '/admin/crons',
      hrefLabel: 'Cron runs',
    });
  });

  it('is ok for a successful run inside 1.5x the cadence', () => {
    expect(cronHealthRow(COURSERA, run(COURSERA.jobName, 'SUCCESS', 2), NOW)).toMatchObject({
      status: 'ok',
      meta: 'Last run 2h ago',
    });
    expect(cronHealthRow(COURSERA, run(COURSERA.jobName, 'SKIPPED', 1), NOW)).toMatchObject({
      status: 'ok',
      meta: 'Last run skipped 1h ago',
    });
    // Age is measured from completion when it exists.
    expect(cronHealthRow(COURSERA, run(COURSERA.jobName, 'SUCCESS', 10, 8), NOW)).toMatchObject({ status: 'ok', meta: 'Last run 8h ago' });
  });

  it('warns when the last successful run is stale for the cadence', () => {
    expect(cronHealthRow(COURSERA, run(COURSERA.jobName, 'SUCCESS', 10), NOW)).toEqual({
      name: 'Coursera sync',
      status: 'warn',
      meta: 'Last run 10h ago · expected every 6h',
      href: '/admin/crons',
      hrefLabel: 'Cron runs',
    });
    // The daily job tolerates 36h.
    expect(cronHealthRow(AT_RISK, run(AT_RISK.jobName, 'SUCCESS', 30), NOW).status).toBe('ok');
    expect(cronHealthRow(AT_RISK, run(AT_RISK.jobName, 'SUCCESS', 40), NOW).status).toBe('warn');
  });

  it('warns on a failed run and on a run that never finished', () => {
    expect(cronHealthRow(AT_RISK, run(AT_RISK.jobName, 'FAILED', 3, null), NOW)).toMatchObject({
      status: 'warn',
      meta: 'Last run failed 3h ago',
    });
    expect(cronHealthRow(COURSERA, run(COURSERA.jobName, 'RUNNING', 1, null), NOW)).toMatchObject({
      status: 'ok',
      meta: 'Run in progress (started 1h ago)',
    });
    expect(cronHealthRow(COURSERA, run(COURSERA.jobName, 'RUNNING', 12, null), NOW)).toMatchObject({
      status: 'warn',
      meta: 'Run started 12h ago has not finished',
    });
  });
});

describe('buildCommandCenterSystemHealth', () => {
  const base = { now: NOW, slaBreaches48h: 0, recentCronErrors: 0, workflowHealthLoadFailed: false };

  it('gives tenant admins honest "Not checked here" rows with a link, never a fabricated state', () => {
    const rows = buildCommandCenterSystemHealth({ ...base, superAdmin: false, cronRuns: null });
    expect(rows.map((r) => r.name)).toEqual(['Coursera sync', 'At-risk scoring', 'Member reply SLA', 'Payouts']);
    for (const name of ['Coursera sync', 'At-risk scoring']) {
      expect(rows.find((r) => r.name === name)).toEqual(
        notCheckedHereRow({
          name,
          reason: 'Platform-wide job; run history is on the cron page',
          href: '/admin/crons',
          hrefLabel: 'Cron runs',
        }),
      );
    }
    expect(rows.find((r) => r.name === 'Payouts')).toMatchObject({
      status: 'unknown',
      statusLabel: 'Not checked here',
      tone: 'muted',
      href: '/admin/partners',
      hrefLabel: 'Partners',
    });
    expect(rows.find((r) => r.name === 'Member reply SLA')).toEqual({
      name: 'Member reply SLA',
      status: 'ok',
      meta: 'No replies overdue by 48h',
    });
    expect(rows.some((r) => /not verified/i.test(r.meta ?? ''))).toBe(false);
    expect(rows.some((r) => r.meta === 'No automated check available')).toBe(false);
  });

  it('computes real cron freshness and platform errors for platform admins', () => {
    const rows = buildCommandCenterSystemHealth({
      ...base,
      superAdmin: true,
      slaBreaches48h: 2,
      recentCronErrors: 3,
      cronRuns: [run(COURSERA.jobName, 'SUCCESS', 1), run(AT_RISK.jobName, 'FAILED', 5, null)],
    });
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ['Coursera sync', 'ok'],
      ['At-risk scoring', 'warn'],
      ['Member reply SLA', 'warn'],
      ['Platform workflow errors', 'warn'],
      ['Payouts', 'unknown'],
    ]);
    expect(rows[0].meta).toBe('Last run 1h ago');
    expect(rows[1].meta).toBe('Last run failed 5h ago');
    expect(rows[2].meta).toBe('2 threads waiting >48h');
    expect(rows[3].meta).toBe('3 errors recorded in 7 days');
    expect(rows[0].statusLabel).toBeUndefined();
  });

  it('says so when run history could not be read or diagnostics failed', () => {
    const rows = buildCommandCenterSystemHealth({
      ...base,
      superAdmin: true,
      recentCronErrors: null,
      workflowHealthLoadFailed: true,
      cronRuns: null,
    });
    expect(rows[0]).toMatchObject({ name: 'Coursera sync', status: 'unknown', meta: 'Could not read run history', href: '/admin/crons' });
    expect(rows.find((r) => r.name === 'Platform workflow errors')).toMatchObject({ status: 'unknown', meta: 'Could not check diagnostics' });
    // A job with no execution row yet is unknown with its own reason.
    const partial = buildCommandCenterSystemHealth({ ...base, superAdmin: true, cronRuns: [run(COURSERA.jobName, 'SUCCESS', 1)] });
    expect(partial[1]).toMatchObject({ name: 'At-risk scoring', status: 'unknown', meta: 'No run recorded yet' });
  });
});

describe('CommandCenterKit system-health rows', () => {
  afterEach(cleanup);

  it('renders the honest chip text, tone and the "where it is checked" link', () => {
    render(
      <CommandCenterKit
        dateLabel="Sep 20, 2026"
        kpis={[]}
        queueItems={[]}
        programHealth={[]}
        placementsByMonth={[]}
        systemHealth={buildCommandCenterSystemHealth({
          superAdmin: false,
          now: NOW,
          slaBreaches48h: 0,
          recentCronErrors: null,
          workflowHealthLoadFailed: false,
          cronRuns: null,
        })}
      />,
    );
    expect(screen.getAllByText('Not checked here')).toHaveLength(3);
    expect(screen.queryByText('Not verified')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Coursera sync: Not checked here')).toBeInTheDocument();
    const cronLinks = screen.getAllByRole('link', { name: 'Cron runs' });
    expect(cronLinks).toHaveLength(2);
    expect(cronLinks[0]).toHaveAttribute('href', '/admin/crons');
    expect(screen.getByRole('link', { name: 'Partners' })).toHaveAttribute('href', '/admin/partners');
    expect(screen.getByText('OK')).toBeInTheDocument();
    for (const chip of screen.getAllByText('Not checked here')) {
      expect(chip).toHaveClass('wa-kit-tag--muted');
    }
  });

  it('keeps the default chips for rows without an override', () => {
    render(
      <CommandCenterKit
        dateLabel="Sep 20, 2026"
        kpis={[]}
        queueItems={[]}
        programHealth={[]}
        placementsByMonth={[]}
        systemHealth={[
          { name: 'Coursera sync', status: 'ok', meta: 'Last run 1h ago' },
          { name: 'At-risk scoring', status: 'warn', meta: 'Last run failed 5h ago', href: '/admin/crons', hrefLabel: 'Cron runs' },
          { name: 'Payouts', status: 'unknown', meta: 'No run recorded yet' },
        ]}
      />,
    );
    expect(screen.getByText('OK')).toHaveClass('wa-kit-tag--ok');
    expect(screen.getByText('Warn')).toHaveClass('wa-kit-tag--warn');
    expect(screen.getByText('Not verified')).toHaveClass('wa-kit-tag--muted');
    expect(screen.getByLabelText('Payouts not verified')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cron runs' })).toHaveAttribute('href', '/admin/crons');
  });
});
