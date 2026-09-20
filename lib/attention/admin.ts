import 'server-only';

/**
 * Admin (org-wide) attention queue for the Command Center (`/admin`) and the
 * Detailed overview (`/admin/overview`). Both pages read every attention
 * number from this one queue.
 *
 * Roster: member-role accounts only (`MEMBER_ONLY_WHERE`). Staff, admin and
 * dogfood accounts are never members or applicants on these pages (admin
 * audit 2026-09-20, §4.1).
 *
 * Tenant scope: the roster query runs inside `withAdminPageScope`, so an org
 * admin only sees their organisation's members (super-admin is unscoped by
 * design). Every fact the loader then reads — applications, events, alerts,
 * assignments, message SQL — is keyed by that id set, which is how the
 * models without an `organizationId` column stay inside the tenant
 * (scripts/verify-high-risk-tenant-routes.cjs guards this file).
 */

import { cache } from 'react';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import { withAdminPageScope, type AdminPageTenantOk } from '@/lib/tenant/adminPageScope';
import { buildAttentionQueue, type AttentionQueue } from './evaluate';
import { loadAttentionFacts } from './loadFacts';

/** Same ceiling the previous triage digest used for its roster scan. */
export const ADMIN_ATTENTION_ROSTER_CAP = 3000;

const loadAdminAttention = cache(async (scope: AdminPageTenantOk): Promise<AttentionQueue> => {
  const now = new Date();
  return withAdminPageScope(scope, async (db) => {
    const members = await db.user.findMany({
      where: { deletedAt: null, ...MEMBER_ONLY_WHERE },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: ADMIN_ATTENTION_ROSTER_CAP,
    });
    const facts = await loadAttentionFacts(members.map((m) => m.id), now, db);
    return buildAttentionQueue(facts, now);
  });
});

/** Deduplicated per request; `resolveAdminPageTenant` is cached too, so the scope object is stable. */
export function getAdminAttention(scope: AdminPageTenantOk): Promise<AttentionQueue> {
  return loadAdminAttention(scope);
}
