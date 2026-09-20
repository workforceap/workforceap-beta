import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import { getAiToolsCohortStats, getAiToolUsageCounts } from '@/lib/admin/cohortAnalytics';
import PageHeader from '@/components/portal/PageHeader';
import DataTable from '@/components/portal/ui/DataTable';
import { DesignSurface } from '@/components/portal/kit';
import { AiToolsAdminKit } from '@/components/portal/kit/pages/admin-subviews/AiToolsAdminKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'AI tools',
    description: 'Admin view of member AI toolkit usage & config.',
    path: '/admin/ai-tools',
  });
}

export default async function AdminAiToolsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/ai-tools');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const analyticsOrgId = scope.superAdmin ? undefined : scope.orgId;

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;

  // --- DEFAULT: kit card grid of the AI toolkit with real per-tool usage ---
  if (requestedUi !== 'legacy') {
    // Lean per-tool counts (groupBy toolType + voice-session count). Degrades to
    // [] on failure, in which case cards render with "—" instead of counts.
    let usageLoadFailed = false;
    const usage = await getAiToolUsageCounts(analyticsOrgId).catch((error) => {
      usageLoadFailed = true;
      console.error('[admin/ai-tools] usage load failed', error);
      return [];
    });

    return (
      <DesignSurface surface="dense">
        {usageLoadFailed ? <span hidden data-portal-error-state="admin-ai-tools-usage-load" /> : null}
        <AiToolsAdminKit usage={usage} />
      </DesignSurface>
    );
  }

  // --- LEGACY (?ui=legacy): original cohort-by-cohort usage analytics table ---
  const rows = await getAiToolsCohortStats(analyticsOrgId);

  return (
    <>
      <PageHeader
        title="AI tools analytics"
        subtitle="AI-powered tool runs by enrolled program (cohort)."
      />
      <div style={{ maxWidth: '80rem', margin: '0 auto' }}>
        {rows.length === 0 ? (
          <div
            style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              background: 'var(--surface-container-low)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
              No members enrolled yet
            </p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
              Once members enroll and start running AI tools, usage will show here cohort-by-cohort.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="wa-hidden md:wa-block" style={{ overflowX: 'auto' }}>
              <DataTable
                variant="admin"
                tableClassName="admin-table"
                scrollX={false}
                rows={rows}
                rowKey={(r) => r.cohortKey}
                columns={[
                  { key: 'cohort', header: 'Cohort', cell: (r) => r.cohortLabel },
                  { key: 'members', header: 'Members', cell: (r) => r.memberCount },
                  {
                    key: 'using',
                    header: 'Members using tools',
                    cell: (r) => (
                      <>
                        {r.membersUsedTools}
                        {r.memberCount > 0 ? (
                          <span style={{ marginLeft: '0.4rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                            ({Math.round((r.membersUsedTools / r.memberCount) * 100)}%)
                          </span>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    key: 'total',
                    header: 'Total runs',
                    cell: (r) =>
                      r.totalRuns === 0 ? (
                        <span style={{ color: 'var(--color-on-surface-variant)' }}>—</span>
                      ) : (
                        r.totalRuns
                      ),
                  },
                  {
                    key: '7d',
                    header: 'Runs (7d)',
                    cell: (r) =>
                      r.runsLast7Days === 0 ? (
                        <span style={{ color: 'var(--color-on-surface-variant)' }}>—</span>
                      ) : (
                        r.runsLast7Days
                      ),
                  },
                ]}
              />
            </div>

            {/* Mobile cards */}
            <div className="md:wa-hidden wa-flex wa-flex-col" style={{ gap: '0.625rem' }}>
              {rows.map((r) => (
                <div
                  key={r.cohortKey}
                  style={{
                    background: 'var(--surface-container)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '0.875rem 1rem',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{r.cohortLabel}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                    <span>
                      Members: <strong style={{ color: 'var(--color-on-surface)' }}>{r.memberCount}</strong>
                    </span>
                    <span>
                      Using tools: <strong style={{ color: 'var(--color-on-surface)' }}>{r.membersUsedTools}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                    <span>
                      Total runs: <strong style={{ color: 'var(--color-on-surface)' }}>{r.totalRuns}</strong>
                    </span>
                    <span>
                      Runs (7d): <strong style={{ color: 'var(--color-on-surface)' }}>{r.runsLast7Days}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
