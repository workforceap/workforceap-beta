import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { isAdmin } from '@/lib/auth/roles';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';
import { formatPortalDate } from '@/lib/formatDate';

import {
  listAwaitingApprovalCascades,
  countAwaitingApprovalCascades,
  resolveCascadeScope,
  type CascadeCardData,
} from '@/lib/milestoneCascade/queries';
import { getCascadeMetrics } from '@/lib/milestoneCascade/metrics';
import { AgentInboxClient } from './AgentInboxClient';
import { InboxStatsBlock } from './InboxStatsBlock';
import {
  AgentInboxKit,
  type AgentInboxRow,
} from '@/components/portal/kit/pages/admin-subviews/AgentInboxKit';
import type { KitTone } from '@/components/portal/kit';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Agent Inbox · Admin',
};

/** Humanize the milestone_type enum string for display. */
function humanizeMilestone(type: string, ref: string): string {
  const label = type.replaceAll('_', ' ');
  return ref ? `${label} · ${ref}` : label;
}

/** Hours until an ISO/Date expiry, floored at 0. */
function hoursUntil(at: Date): number {
  const ms = at.getTime() - Date.now();
  return Math.max(0, Math.round(ms / (60 * 60 * 1000)));
}

/** Expiry caption mirroring the legacy client's formatExpiry. */
function formatExpiry(at: Date): string {
  const hrs = hoursUntil(at);
  if (hrs === 0) return 'expires soon';
  if (hrs < 24) return `expires in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  const rem = hrs % 24;
  return rem === 0 ? `expires in ${days}d` : `expires in ${days}d ${rem}h`;
}

/** Urgency tone from time-to-expiry: <6h alert, <24h warn, else ok. */
function expiryTone(at: Date): KitTone {
  const hrs = hoursUntil(at);
  if (hrs < 6) return 'alert';
  if (hrs < 24) return 'warn';
  return 'ok';
}

function toKitRow(c: CascadeCardData): AgentInboxRow {
  const expiresAt = c.expiresAt instanceof Date ? c.expiresAt : new Date(c.expiresAt);
  return {
    id: c.id,
    from: c.userFullName ?? c.userEmail,
    caption: c.userFullName ? c.userEmail : (c.milestoneRef || c.milestoneType),
    type: humanizeMilestone(c.milestoneType, c.milestoneRef),
    drafts: c.drafts.length,
    when: formatPortalDate(c.createdAt),
    expires: c.status === 'approved'
      ? c.dispatch?.retryAfter ? 'Sending' : c.dispatch?.canRetry && expiresAt > new Date() ? 'Delivery retry available' : 'Delivery needs review'
      : formatExpiry(expiresAt),
    urgency: c.status === 'approved' ? c.dispatch?.retryAfter ? 'info' : 'warn' : expiryTone(expiresAt),
  };
}

/**
 * Agent inbox — admin-only.
 *
 * Default view is the kit summary (KPI strip + dense queue table) with the
 * interactive review cards (read/edit drafts, approve or dismiss) below it
 * (WAP-193). `?ui=legacy` keeps the original page for now.
 *
 * Shows every cascade currently waiting for review, oldest first. Counselor
 * access is a follow-up: it requires the list query and the underlying
 * approve/dismiss endpoints to filter by counselor_assignment, so a
 * counselor can only see and act on cascades for members assigned to them.
 * Until that's wired, this page (and the API routes it drives) are
 * admin-only — matching the /admin/* layout guard.
 */
export default async function AgentInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/agent-inbox');
  // The /admin layout already enforces isAdmin, but check again here so
  // this page's auth contract is self-evident from the file.
  const tenantScope = await resolveAdminPageTenant(user.id);
  if (!tenantScope.ok) redirect('/dashboard');

  const { ui } = await searchParams;
  const legacy = ui === 'legacy';

  // Tenant scope: super-admin sees the platform; tenant admins see only
  // their org's cascades. `isAdmin()` is global so without this filter a
  // non-super tenant admin saw every tenant's pending cascades, including
  // AI-drafted message bodies and learner emails.
  const scope = await resolveCascadeScope(user.id);

  const [cascades, metrics, needsReview] = await Promise.all([
    listAwaitingApprovalCascades({ limit: 100, scope }),
    getCascadeMetrics({ windowDays: 7, scope }),
    countAwaitingApprovalCascades({ scope }),
  ]);

  if (legacy) {
    return (
      <PortalPageFrame>
        <PageHeader
          title="Agent Inbox"
          subtitle={
            cascades.length === 0
              ? 'No cascades awaiting review right now.'
              : `${cascades.length} cascade${cascades.length === 1 ? '' : 's'} awaiting your review`
          }
        />
        <InboxStatsBlock metrics={metrics} />
        <AgentInboxClient cascades={JSON.parse(JSON.stringify(cascades))} />
      </PortalPageFrame>
    );
  }

  return (
    <PortalPageFrame>
      <AgentInboxKit
        rows={cascades.map(toKitRow)}
        awaitingReview={needsReview}
        pendingDraft={metrics.totals.pendingDraft}
        sent={metrics.totals.sent}
        resolved={metrics.totals.dismissed + metrics.totals.expired}
        review={
          cascades.length > 0 ? (
            <AgentInboxClient cascades={JSON.parse(JSON.stringify(cascades))} />
          ) : undefined
        }
      />
    </PortalPageFrame>
  );
}
