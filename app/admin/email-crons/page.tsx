import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { loadCronEnabledStates } from '@/lib/cron/isCronEnabled';
import { CRON_REGISTRY, CRON_CATEGORY_COLOR } from '@/lib/admin/cronRegistry';
import PageHeader from '@/components/portal/PageHeader';
import EmailCronsClient from '@/components/admin/EmailCronsClient';
import { DesignSurface } from '@/components/portal/kit';
import {
  EmailCronsKit,
  type EmailCronRow,
  type EmailCronDisplayStatus,
} from '@/components/portal/kit/pages/admin-subviews/EmailCronsKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Email & Cron Management',
  description: 'Manage automated email triggers and scheduled jobs.',
  path: '/admin/email-crons',
});
}

/** Relative last-run caption: "just now", "5m ago", "3h ago", "2d ago", "—". */
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function AdminEmailCronsPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/email-crons');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { ui } = await searchParams;

  // Load last run for each cron from WorkflowDiagnostic
  const cronKeys = CRON_REGISTRY.map(c => c.workflowKey);
  const recentDiags = await prisma.workflowDiagnostic.findMany({
    where: { workflow: { in: cronKeys } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, workflow: true, status: true, summary: true, createdAt: true, metadata: true },
  });

  const enabledStates = await loadCronEnabledStates(cronKeys);

  // Group by workflow key
  const runsByKey = new Map<string, typeof recentDiags>();
  for (const d of recentDiags) {
    const list = runsByKey.get(d.workflow) ?? [];
    list.push(d);
    runsByKey.set(d.workflow, list);
  }

  const cronData = CRON_REGISTRY.map(cron => {
    const runs = runsByKey.get(cron.workflowKey) ?? [];
    const last = runs[0] ?? null;
    const meta = last?.metadata as Record<string, unknown> | null;
    // Check if most recent toggle set enabled = false
    const enabled = enabledStates.get(cron.workflowKey)!;

    return {
      ...cron,
      enabled,
      lastRunAt: last?.createdAt?.toISOString() ?? null,
      lastRunStatus: last?.status ?? null,
      lastRunSummary: last?.summary ?? null,
      recentRuns: runs.slice(0, 8).map(r => ({
        id: r.id,
        status: r.status,
        summary: r.summary ?? '',
        createdAt: r.createdAt.toISOString(),
        meta: r.metadata as Record<string, unknown> | null,
      })),
    };
  });

  // Quick stats — error count scoped to last 7 days so stale old errors don't surface indefinitely (#153)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const totalRuns = recentDiags.length;
  const errorRuns = recentDiags.filter(d =>
    (d.status === 'error' || d.status === 'errored') &&
    new Date(d.createdAt) >= sevenDaysAgo
  ).length;
  const enabledCount = cronData.filter(c => c.enabled).length;

  const cronSecretMissing = !process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16;

  // Design-kit default: dense roster, one row per registered cron.
  if (ui !== 'legacy') {
    const STATUS_MAP: Record<string, EmailCronDisplayStatus> = {
      ok: 'Success',
      success: 'Success',
      error: 'Failed',
      errored: 'Failed',
    };

    const rows: EmailCronRow[] = cronData.map((c) => {
      let status: EmailCronDisplayStatus;
      if (!c.enabled) status = 'Disabled';
      else if (!c.lastRunStatus) status = 'Pending';
      else status = STATUS_MAP[c.lastRunStatus] ?? 'Pending';
      return {
        id: c.id,
        job: c.name,
        schedule: c.scheduleLabel,
        lastRun: timeAgo(c.lastRunAt),
        status,
      };
    });

    const failing = rows.filter((r) => r.status === 'Failed').length;
    const lastRunIso = cronData
      .map((c) => c.lastRunAt)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;

    return (
      <DesignSurface surface="dense">
        <EmailCronsKit
          jobs={rows}
          totalJobs={cronData.length}
          enabled={enabledCount}
          failing={failing}
          lastRun={timeAgo(lastRunIso)}
        />
      </DesignSurface>
    );
  }

  return (
    <div>
      <PageHeader
        title="Email &amp; Cron Management"
        subtitle="Review, trigger, enable, or disable all automated email and workflow jobs."
      />

      {cronSecretMissing && (
        <div style={{ padding: '1rem 1.25rem', background: 'rgba(173,44,77,0.08)', border: '1px solid rgba(173,44,77,0.2)', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-accent)', fontVariationSettings: "'FILL' 1", flexShrink: 0, marginTop: '0.1rem' }}>warning</span>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-on-surface)', margin: '0 0 0.25rem' }}>
                Cron secret not configured — jobs cannot run
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.5rem', lineHeight: 1.55 }}>
                Vercel scheduled crons and manual triggers both require <code style={{ background: 'var(--surface-container)', padding: '0.1rem 0.3rem', borderRadius: '0.25rem', fontSize: '0.8125rem' }}>CRON_SECRET</code> to be set as an environment variable. Without it, all jobs return 401 Unauthorized and show "Never run."
              </p>
              <ol style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.6 }}>
                <li>Go to <strong>Vercel Dashboard → Project → Settings → Environment Variables</strong></li>
                <li>Add <code style={{ background: 'var(--surface-container)', padding: '0.1rem 0.3rem', borderRadius: '0.25rem', fontSize: '0.8125rem' }}>CRON_SECRET</code> with a random 32+ character string</li>
                <li>Redeploy the project</li>
                <li>Return here and click <strong>Run now</strong> on any cron to verify</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Notice about enable/disable */}
      <div style={{ padding: '0.875rem 1rem', background: 'rgba(43,123,185,0.07)', border: '1px solid rgba(43,123,185,0.15)', borderRadius: '0.75rem', marginBottom: '1.5rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55 }}>
        <strong style={{ color: 'var(--color-blue, #2b7bb9)' }}>How toggling works:</strong> Enabling/disabling a job saves a persistent setting.
        The Vercel scheduler still calls the endpoint on schedule — but the job checks this setting before running. To permanently remove a job from the schedule,
        edit <code style={{ background: 'var(--surface-container)', padding: '0.1rem 0.3rem', borderRadius: '0.25rem', fontSize: '0.8125rem' }}>vercel.json</code>.
        Manual triggers always run regardless of enabled state.
      </div>

      <EmailCronsClient
        crons={cronData}
        categoryColors={CRON_CATEGORY_COLOR}
        initialTotalRuns={totalRuns}
        initialErrorRuns={errorRuns}
        initialEnabledCount={enabledCount}
      />
    </div>
  );
}
