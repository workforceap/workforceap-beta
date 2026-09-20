/**
 * /admin/growth — paid-traffic sanity-check dashboard.
 *
 * Purpose: when Google Ads turns on, an admin can hit this route and
 * confirm signups + funnel events are flowing. NOT a BI tool — see
 * `app/admin/metrics/page.tsx` for the analytics chart suite.
 *
 * Auth: `app/admin/layout.tsx` already redirects non-admins. We still
 * do a defensive isAdmin check + redirect to keep this page safe if
 * the layout guard is ever refactored.
 *
 * Data sources:
 *   1. `MemberEvent` rows where `eventName = 'apply_signup_completed'`
 *      — UTM source breakdown, last 7d.
 *   2. GA4 dataLayer (`apply_funnel`) — placeholder, server cannot query
 *      directly; link out to the GA4 dashboard.
 *   3. `MemberEvent` rows with `eventName LIKE 'apply_%'` — last 24h.
 *   4. `MemberEvent` rows where `eventName = 'member_logged_in'` —
 *      last 24h count. The companion `member_login` funnel events are
 *      dataLayer-only so we link out to GA4 for them.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser, withAuthGuc } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { ANALYTICS_SAMPLE_CAP } from '@/lib/db/queryCaps';

import { getActorOrganizationId } from '@/lib/tenant/organization';
import PageHeader from '@/components/portal/PageHeader';
import PortalCard from '@/components/portal/ui/PortalCard';
import { CONVERSION_VALUE_BASIS, CONVERSION_VALUE_USD } from '@/lib/analytics/conversionValue';
import { GrowthKit } from '@/components/portal/kit/pages/admin-subviews/GrowthKit';
import type { KpiItem, RankDatum } from '@/components/portal/kit';

export const dynamic = 'force-dynamic';

// Resolved from env once the GA4 workspace is provisioned. Until
// `GA4_FUNNEL_DASHBOARD_URL` is set we render no live-looking link —
// see `ga4Note` below — rather than pointing admins at a non-existent
// property (the old hardcoded `p000000000` placeholder showed a GA4
// error).
const GA4_FUNNEL_DASHBOARD_URL = process.env.GA4_FUNNEL_DASHBOARD_URL?.trim() || null;

const ga4Note = 'GA4 dashboard link not configured yet — set GA4_FUNNEL_DASHBOARD_URL.';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Growth — paid traffic dashboard',
    description: 'Day-1 sanity check for Google Ads conversion flow.',
    path: '/admin/growth',
  });
}

type Utm = {
  source: string;
  medium: string;
  campaign: string;
  count: number;
  latest: Date;
};

type ApplyBreakdownRow = {
  eventName: string;
  count: number;
};

function getStr(meta: unknown, key: string): string {
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

async function loadSignupsByUtmSource(orgId: string): Promise<Utm[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.memberEvent.findMany({
    where: {
      eventName: 'apply_signup_completed',
      createdAt: { gte: since },
      user: { organizationId: orgId },
    },
    select: { metadata: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: ANALYTICS_SAMPLE_CAP,
  });

  const buckets = new Map<string, Utm>();
  for (const row of rows) {
    const source = getStr(row.metadata, 'utm_source') || '(direct/none)';
    const medium = getStr(row.metadata, 'utm_medium') || '—';
    const campaign = getStr(row.metadata, 'utm_campaign') || '—';
    const key = `${source}|${medium}|${campaign}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      if (row.createdAt > existing.latest) existing.latest = row.createdAt;
    } else {
      buckets.set(key, { source, medium, campaign, count: 1, latest: row.createdAt });
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.count - a.count);
}

async function loadApplyAttemptsLast24h(orgId: string): Promise<ApplyBreakdownRow[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Prisma groupBy + startsWith via a small raw filter; we restrict on
  // server side and aggregate in JS — volume is bounded (small TAM).
  const rows = await prisma.memberEvent.findMany({
    where: {
      eventName: { startsWith: 'apply_' },
      createdAt: { gte: since },
      user: { organizationId: orgId },
    },
    select: { eventName: true },
    take: ANALYTICS_SAMPLE_CAP,
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.eventName, (counts.get(row.eventName) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([eventName, count]) => ({ eventName, count }))
    .sort((a, b) => b.count - a.count);
}

async function loadLoginCountLast24h(orgId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.memberEvent.count({
    where: {
      eventName: 'member_logged_in',
      createdAt: { gte: since },
      user: { organizationId: orgId },
    },
  });
}

export default async function AdminGrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/growth');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const orgId = await getActorOrganizationId(user.id);
  const [utmRows, applyBreakdown, loginCount24h] = await withAuthGuc(() =>
    Promise.all([
      loadSignupsByUtmSource(orgId),
      loadApplyAttemptsLast24h(orgId),
      loadLoginCountLast24h(orgId),
    ]),
  );

  const totalSignups7d = utmRows.reduce((acc, r) => acc + r.count, 0);
  const sp = await searchParams;
  const requestedUi = typeof sp.ui === 'string' ? sp.ui : null;

  // ── DEFAULT (design-kit) PATH — dense Growth view with real data. Runs
  // after the auth/role guard so access control is preserved. Empty data
  // degrades to KPI zeros + empty RankBars/DataTable states. ──
  if (requestedUi !== 'legacy') {
    const totalApplyEvents24h = applyBreakdown.reduce((acc, r) => acc + r.count, 0);

    // Signups by UTM source (7d), aggregated across medium/campaign.
    const bySourceCount = new Map<string, number>();
    for (const r of utmRows) {
      bySourceCount.set(r.source, (bySourceCount.get(r.source) ?? 0) + r.count);
    }
    const rankedSources = [...bySourceCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const sourceMax = Math.max(1, ...rankedSources.map(([, c]) => c));
    const signupsBySource: RankDatum[] = rankedSources.map(([source, count]) => ({
      label: source,
      value: count,
      pct: Math.round((count / sourceMax) * 100),
      color: 'success',
    }));

    const kpis: KpiItem[] = [
      { label: 'Signups (7d)', value: totalSignups7d.toLocaleString('en-US') },
      { label: 'Apply Events (24h)', value: totalApplyEvents24h.toLocaleString('en-US') },
      { label: 'Logins (24h)', value: loginCount24h.toLocaleString('en-US') },
      { label: 'UTM Sources (7d)', value: bySourceCount.size.toLocaleString('en-US') },
    ];

    return (
      <GrowthKit
        kpis={kpis}
        signupsBySource={signupsBySource.length > 0 ? signupsBySource : undefined}
        utmRows={utmRows.map((r) => ({
          source: r.source,
          medium: r.medium,
          campaign: r.campaign,
          count: r.count,
          latest: `${r.latest.toISOString().replace('T', ' ').slice(0, 16)} UTC`,
        }))}
        applyEvents={applyBreakdown.map((r) => ({ eventName: r.eventName, count: r.count }))}
        conversionValues={Object.entries(CONVERSION_VALUE_USD).map(([name, value]) => ({
          name,
          valueUsd: Number(value),
          estimate: CONVERSION_VALUE_BASIS === 'estimate',
        }))}
        headerAction={
          GA4_FUNNEL_DASHBOARD_URL ? (
            <Link
              href={GA4_FUNNEL_DASHBOARD_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline btn-sm"
            >
              Open GA4 dashboard
            </Link>
          ) : undefined
        }
      />
    );
  }

  // ── LEGACY PATH (?ui=legacy) — original PortalCard-based dashboard. ──
  const sectionGap: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-6)',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 'var(--font-size-sm)',
  };
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: 'var(--space-2) var(--space-3)',
    borderBottom: '1px solid var(--outline-variant)',
    color: 'var(--color-on-surface-variant)',
    fontWeight: 600,
  };
  const tdStyle: React.CSSProperties = {
    padding: 'var(--space-2) var(--space-3)',
    borderBottom: '1px solid var(--outline-variant)',
    color: 'var(--color-on-surface)',
  };

  return (
    <div style={sectionGap}>
      <PageHeader
        title="Growth — paid traffic"
        subtitle={`Last 7d signups: ${totalSignups7d.toLocaleString()} · sanity check for Google Ads launch.`}
      />

      {/* Section 1: 7-day conversion funnel by UTM source */}
      <PortalCard
        title="Last 7 days: signups by UTM source"
        subtitle="Counted from MemberEvent.apply_signup_completed; grouped by metadata.utm_source / utm_medium / utm_campaign."
      >
        {utmRows.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
            No <code>apply_signup_completed</code> events in the last 7 days.
          </p>
        ) : (
          <table style={tableStyle}>
            <caption className="sr-only">
              Last 7 days of signups grouped by UTM source, medium, and campaign with the latest signup timestamp.
            </caption>
            <thead>
              <tr>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Medium</th>
                <th style={thStyle}>Campaign</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                <th style={thStyle}>Latest signup</th>
              </tr>
            </thead>
            <tbody>
              {utmRows.map((row) => (
                <tr key={`${row.source}|${row.medium}|${row.campaign}`}>
                  <td style={tdStyle}>{row.source}</td>
                  <td style={tdStyle}>{row.medium}</td>
                  <td style={tdStyle}>{row.campaign}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {row.count.toLocaleString()}
                  </td>
                  <td style={tdStyle}>{row.latest.toISOString().replace('T', ' ').slice(0, 16)} UTC</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PortalCard>

      {/* Section 2: Funnel drop-off — GA4 placeholder */}
      <PortalCard
        title="Funnel drop-off (apply_funnel events)"
        subtitle="apply_funnel events are pushed to GTM/GA4 only — not stored in MemberEvent. Query GA4 directly."
      >
        <p style={{ margin: 0, marginBottom: 'var(--space-3)', color: 'var(--color-on-surface-variant)' }}>
          {/* TODO(growth): replace with server-side GA4 Data API integration
              once a service-account credential lands in env. */}
          Funnel step-by-step drop-off lives in GA4. The data is not queryable
          from this app today.
        </p>
        {GA4_FUNNEL_DASHBOARD_URL ? (
          <Link
            href={GA4_FUNNEL_DASHBOARD_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline btn-sm"
          >
            Open GA4 dashboard
          </Link>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>
            {ga4Note}
          </p>
        )}
      </PortalCard>

      {/* Section 3: Last 24h apply attempts by event name */}
      <PortalCard
        title="Last 24h: apply_* MemberEvents"
        subtitle="Every server-recorded event whose name starts with `apply_`."
      >
        {applyBreakdown.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>No apply_* events in the last 24h.</p>
        ) : (
          <table style={tableStyle}>
            <caption className="sr-only">
              Apply funnel MemberEvents recorded in the last 24 hours, grouped by event name with counts.
            </caption>
            <thead>
              <tr>
                <th style={thStyle}>Event name</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {applyBreakdown.map((row) => (
                <tr key={row.eventName}>
                  <td style={tdStyle}>
                    <code>{row.eventName}</code>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {row.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PortalCard>

      {/* Section 4: Login funnel (last 24h) */}
      <PortalCard
        title="Last 24h: member logins"
        subtitle="MemberEvent.member_logged_in count. dataLayer member_login funnel events are in GA4 only."
      >
        <p style={{ margin: 0, marginBottom: 'var(--space-2)', color: 'var(--color-on-surface)' }}>
          <strong style={{ fontSize: 'var(--font-size-xl)' }}>{loginCount24h.toLocaleString()}</strong>{' '}
          logins in the last 24 hours.
        </p>
        <p style={{ margin: 0, marginBottom: 'var(--space-3)', color: 'var(--color-on-surface-variant)' }}>
          {/* TODO(growth): step-by-step login funnel drop-off (form_view → submit
              → success) is dataLayer-only — fetch via GA4 Data API later. */}
          Per-step login funnel drop-off lives in GA4.
        </p>
        {GA4_FUNNEL_DASHBOARD_URL ? (
          <Link
            href={GA4_FUNNEL_DASHBOARD_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline btn-sm"
          >
            Open GA4 login funnel
          </Link>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)' }}>
            {ga4Note}
          </p>
        )}
      </PortalCard>

      {/* Conversion value reference — what Google Ads "import with value" uses */}
      <PortalCard
        title="Conversion values (sent to Google Ads)"
        subtitle="Placeholder USD values forwarded with each conversion so the bid optimizer can learn CPA → LTV."
      >
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {Object.entries(CONVERSION_VALUE_USD).map(([name, value]) => (
            <li key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
              <code>{name}</code>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>${value} USD</span>
            </li>
          ))}
        </ul>
      </PortalCard>
    </div>
  );
}
