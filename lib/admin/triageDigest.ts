import 'server-only';

import { programDisplayTitle } from '@/lib/content/programTitle';
import { calculateHealthStatus, type HealthStatus, getHealthLabel, getHealthColor } from '@/lib/admin/healthScore';
import { MEMBER_ONLY_WHERE, MEMBER_OR_DOGFOOD_WHERE } from '@/lib/admin/memberOnlyWhere';
import { stalledCheckInAction, TRIAGE_BUCKET_ACCENTS } from '@/lib/admin/triageDigestCopy';
import {
  inheritMemberOrg,
  inheritUserOrg,
  withAdminPageScope,
  type AdminPageTenantOk,
} from '@/lib/tenant/adminPageScope';

/**
 * "Who needs you today" triage digest for the admin home.
 *
 * Rule-based + deterministic — NO LLM call. This runs on every admin visit, so
 * it must be fast and reliable. It respects the same tenant/role + soft-delete
 * filtering used across the admin surfaces (`MEMBER_OR_DOGFOOD_WHERE`, `deletedAt: null`).
 *
 * Three buckets (spec):
 *   1. New applicants (last 7 days) — no assigned counselor yet
 *   2. At-risk — health score red/yellow, staleTrainingDetectedAt, or counselor triage flags
 *   3. Stalled — inactive >30 days (no learning events), still in training
 */

export type TriageMember = {
  id: string;
  fullName: string;
  /** Program name or null. */
  program: string | null;
  /** Days since last activity (null = never). */
  daysSinceActivity: number | null;
  /** Health badge color + label. */
  health: { status: HealthStatus; label: string; color: string } | null;
  /** Plain-language action label for dad. */
  action: string;
  /** Where the "open" link for this person should point. */
  href: string;
};

export type TriageBucketKey = 'new-applicants' | 'at-risk' | 'stalled';

export type TriageBucket = {
  key: TriageBucketKey;
  /** Total members matching this bucket (may exceed `members.length`). */
  count: number;
  /** Plain-language headline shown on the card. */
  label: string;
  /** Material symbol icon name. */
  icon: string;
  /** Accent color for the card. */
  accent: string;
  /** Up to ~5 representative members. */
  members: TriageMember[];
  /** Where the card's primary button points (the relevant list/queue). */
  href: string;
  /** Button label. */
  cta: string;
};

export type TriageDigest = {
  /** Non-empty buckets in priority order. */
  buckets: TriageBucket[];
  /** True when every bucket is empty (nobody is waiting). */
  allClear: boolean;
};

const TOP_N = 5;

function pluralPeople(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getTriageDigest(scope: AdminPageTenantOk): Promise<TriageDigest> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const userOrg = inheritUserOrg(scope);
  const memberOrg = inheritMemberOrg(scope);

  // Everything runs in parallel and degrades independently — a single failing
  // slice must not blank out the whole digest (mirrors /admin/page error policy).
  const [
    newMembersResult,
    membersResult,
    lastEventsResult,
    recentEventsResult,
    staleTrainingResult,
    counselorAssignmentsResult,
  ] = await withAdminPageScope(scope, (db) =>
    Promise.allSettled([
    // 1. New applicants (last 7 days) with no assigned counselor. Staff and
    //    dogfood admin accounts are never applicants, so this list is
    //    member-role only (admin audit 2026-09-20, 4.1).
    db.user.findMany({
      where: {
        deletedAt: null,
        ...MEMBER_ONLY_WHERE,
        createdAt: { gte: sevenDaysAgo },
        counselorAssignments: { none: { active: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: TOP_N,
      select: {
        id: true,
        fullName: true,
        email: true,
        enrolledProgram: true,
        enrolledAt: true,
        createdAt: true,
      },
    }),
    // Member roster for health + stalled computation
    db.user.findMany({
      where: { deletedAt: null, ...MEMBER_OR_DOGFOOD_WHERE },
      take: 3000,
      select: {
        id: true,
        fullName: true,
        email: true,
        enrolledProgram: true,
        enrolledAt: true,
        staleTrainingDetectedAt: true,
        createdAt: true,
      },
    }),
    // Last event per member (for health score + stalled)
    db.memberEvent.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: thirtyDaysAgo }, ...userOrg },
      _max: { createdAt: true },
    }),
    // Recent event count per member (for health score)
    db.memberEvent.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: thirtyDaysAgo }, ...userOrg },
      _count: { _all: true },
    }),
    // Members with staleTrainingDetectedAt set (at-risk signal)
    db.user.findMany({
      where: {
        deletedAt: null,
        ...MEMBER_OR_DOGFOOD_WHERE,
        staleTrainingDetectedAt: { not: null },
      },
      take: 3000,
      select: {
        id: true,
        fullName: true,
        email: true,
        enrolledProgram: true,
        staleTrainingDetectedAt: true,
      },
    }),
    // Active counselor assignments (to exclude from new-applicants count)
    db.counselorAssignment.findMany({
      where: { active: true, ...memberOrg },
      select: { memberId: true },
    }),
  ]));

  const buckets: TriageBucket[] = [];

  // ── Build lookup maps ────────────────────────────────────────────────────
  const lastEventMap = new Map<string, Date | null>();
  if (lastEventsResult.status === 'fulfilled') {
    for (const row of lastEventsResult.value) lastEventMap.set(row.userId, row._max.createdAt);
  }
  const recentEventMap = new Map<string, number>();
  if (recentEventsResult.status === 'fulfilled') {
    for (const row of recentEventsResult.value) recentEventMap.set(row.userId, row._count._all);
  }
  const assignedMemberIds = new Set<string>();
  if (counselorAssignmentsResult.status === 'fulfilled') {
    for (const a of counselorAssignmentsResult.value) assignedMemberIds.add(a.memberId);
  }
  const staleTrainingIds = new Set<string>();
  if (staleTrainingResult.status === 'fulfilled') {
    for (const m of staleTrainingResult.value) staleTrainingIds.add(m.id);
  }

  // ── 1. New applicants (last 7 days, no counselor) ──────────────────────
  const newMembers = newMembersResult.status === 'fulfilled' ? newMembersResult.value : [];
  // Also count total new members without counselor (may exceed TOP_N)
  const newMembersCount = membersResult.status === 'fulfilled'
    ? membersResult.value.filter((m) => {
        const created = m.createdAt ? new Date(m.createdAt).getTime() : 0;
        return created >= sevenDaysAgo.getTime() && !assignedMemberIds.has(m.id);
      }).length
    : newMembers.length;

  if (newMembersCount > 0) {
    buckets.push({
      key: 'new-applicants',
      count: newMembersCount,
      label: `${newMembersCount} new ${pluralPeople(newMembersCount, 'applicant', 'applicants')} — no counselor yet`,
      icon: 'assignment_ind',
      accent: TRIAGE_BUCKET_ACCENTS['new-applicants'],
      members: newMembers.map((m) => {
        const d = daysSince(m.createdAt);
        const program = m.enrolledProgram ? programDisplayTitle(m.enrolledProgram) : null;
        return {
          id: m.id,
          fullName: m.fullName ?? m.email,
          program,
          daysSinceActivity: d,
          health: null,
          action: `Assign a counselor to ${m.fullName ?? m.email}${d != null && d > 0 ? ` — joined ${d}d ago` : ''}`,
          href: `/admin/members/${m.id}`,
        };
      }),
      href: '/admin/members?needs=new-applicants',
      cta: 'Review new applicants',
    });
  }

  // ── 2. At-risk (health red/yellow OR staleTrainingDetectedAt) ──────────
  if (membersResult.status === 'fulfilled') {
    const atRiskRows = membersResult.value
      .map((m) => {
        const lastEventAt = lastEventMap.get(m.id) ?? null;
        const health = calculateHealthStatus({
          lastEventAt,
          recentEventCount: recentEventMap.get(m.id) ?? 0,
          enrolledAt: m.enrolledAt,
        });
        const isStaleFlagged = staleTrainingIds.has(m.id);
        const isAtRisk = health === 'red' || health === 'yellow' || isStaleFlagged;
        return { m, lastEventAt, health, isStaleFlagged, isAtRisk };
      })
      .filter((r) => r.isAtRisk);

    if (atRiskRows.length > 0) {
      // Sort: red first, then yellow, then stale-only; within each group most-stale first
      const healthRank: Record<HealthStatus, number> = { red: 0, yellow: 1, green: 2 };
      atRiskRows.sort((a, b) => {
        const rankA = healthRank[a.health] ?? 99;
        const rankB = healthRank[b.health] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        const staleA = a.isStaleFlagged ? 0 : 1;
        const staleB = b.isStaleFlagged ? 0 : 1;
        if (staleA !== staleB) return staleA - staleB;
        return (a.lastEventAt?.getTime() ?? 0) - (b.lastEventAt?.getTime() ?? 0);
      });

      buckets.push({
        key: 'at-risk',
        count: atRiskRows.length,
        label: `${atRiskRows.length} ${pluralPeople(atRiskRows.length, 'student', 'students')} at risk`,
        icon: 'warning',
        accent: TRIAGE_BUCKET_ACCENTS['at-risk'],
        members: atRiskRows.slice(0, TOP_N).map(({ m, lastEventAt, health, isStaleFlagged }) => {
          const d = daysSince(lastEventAt);
          const program = m.enrolledProgram ? programDisplayTitle(m.enrolledProgram) : null;
          const healthBadge = { status: health, label: getHealthLabel(health), color: getHealthColor(health) };
          const staleText = isStaleFlagged ? ' · training stalled' : '';
          const activityText = d == null ? 'never active' : `quiet for ${d}d`;
          return {
            id: m.id,
            fullName: m.fullName ?? m.email,
            program,
            daysSinceActivity: d,
            health: healthBadge,
            action: `Check in with ${m.fullName ?? m.email} — ${activityText}${staleText}`,
            href: `/admin/members/${m.id}`,
          };
        }),
        href: '/admin/members?needs=at-risk',
        cta: 'See who needs a nudge',
      });
    }
  }

  // ── 3. Stalled — inactive >30 days, still in training ──────────────────
  if (membersResult.status === 'fulfilled') {
    const stalledRows = membersResult.value
      .filter((m) => {
        const lastEventAt = lastEventMap.get(m.id) ?? null;
        const d = daysSince(lastEventAt ?? m.enrolledAt);
        const inTraining = Boolean(m.enrolledProgram);
        return inTraining && (d == null || d > 30);
      })
      .map((m) => {
        const lastEventAt = lastEventMap.get(m.id) ?? null;
        const d = daysSince(lastEventAt ?? m.enrolledAt);
        return { m, lastEventAt, daysInactive: d };
      })
      .sort((a, b) => (b.daysInactive ?? 0) - (a.daysInactive ?? 0));

    if (stalledRows.length > 0) {
      buckets.push({
        key: 'stalled',
        count: stalledRows.length,
        label: `${stalledRows.length} ${pluralPeople(stalledRows.length, 'student', 'students')} stalled — no activity 30+ days`,
        icon: 'pause_circle',
        // Token, not a hex literal: #d97706 measured 2.82:1 on the card
        // surface. --wa-gold-dark is the text-on-tint gold (5.4:1 light).
        accent: TRIAGE_BUCKET_ACCENTS.stalled,
        members: stalledRows.slice(0, TOP_N).map(({ m, daysInactive }) => {
          const program = m.enrolledProgram ? programDisplayTitle(m.enrolledProgram) : null;
          const d = daysInactive;
          return {
            id: m.id,
            fullName: m.fullName ?? m.email,
            program,
            daysSinceActivity: d,
            health: null,
            action: stalledCheckInAction(m.fullName ?? m.email, d),
            href: `/admin/members/${m.id}`,
          };
        }),
        href: '/admin/members?needs=stalled',
        cta: 'See stalled students',
      });
    }
  }

  return { buckets, allClear: buckets.length === 0 };
}
