import { logCronRun } from '@/lib/admin/logCronRun';
import { withCronLogging } from '@/lib/cron/withCronLogging';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

// WAP-177 fix 4: bound the function so a hung run is killed and swept to FAILED
// by data-cleanup instead of pinning a RUNNING row forever.
export const maxDuration = 60;

/**
 * Hourly Vercel deploy health check.
 *
 * Queries the Vercel API to verify the latest production deployment
 * is in READY state. If the Vercel API token is missing/invalid,
 * degrades to a live-site health check instead of failing the cron.
 */

async function fallbackSiteHealth(reason: string, status?: number) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
  const res = await fetch(siteUrl, { cache: 'no-store' });
  const result = {
    ok: res.ok,
    degraded: true,
    fallback: 'site-health',
    reason,
    status,
    siteStatus: res.status,
    siteUrl,
    checkedAt: new Date().toISOString(),
  };

  await setCronRecordsProcessed(1);
  await logCronRun('cron_deploy_health', result, result.ok ? 'ok' : 'error');
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

async function handle(_request: Request) {
  const projectId = process.env.VERCEL_PROJECT_ID || 'prj_pfOpwxedCID96oF2hlaE5J7kbNid';
  const teamId = process.env.VERCEL_TEAM_ID || 'team_zTfMkbIIH6ADgy5Hy43MCM5K';
  const token = process.env.VERCEL_TOKEN;

  if (!token) {
    return fallbackSiteHealth('VERCEL_TOKEN missing');
  }

  const params = new URLSearchParams({
    projectId,
    target: 'production',
    limit: '1',
  });
  if (teamId) {
    params.set('teamId', teamId);
  }

  const res = await fetch(
    `https://api.vercel.com/v6/deployments?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    return fallbackSiteHealth('Vercel API error', res.status);
  }

  const data = await res.json();
  const latest = data.deployments?.[0];

  const result = {
    ok: latest?.readyState === 'READY',
    readyState: latest?.readyState,
    url: latest?.url,
    commit: latest?.meta?.githubCommitSha,
    checkedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(result));
  await setCronRecordsProcessed(1);
  await logCronRun('cron_deploy_health', result, result.ok ? 'ok' : 'error');
  return Response.json(result, { status: result.ok ? 200 : 503 });
}

export const GET = withCronLogging('cron_deploy_health', handle);
export const POST = withCronLogging('cron_deploy_health', handle);
