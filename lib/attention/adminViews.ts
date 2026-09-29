/**
 * Pure projections of the org-wide `AttentionQueue` onto the two admin pages.
 *
 * The Command Center tiles/rows and the Detailed overview digest are built
 * here from the same queue, so the two pages cannot disagree — a spec
 * (lib/attention/adminAgreement.test.ts) asserts they print the same counts.
 */

import { programDisplayTitle } from '@/lib/content/programTitle';
import { studentsNeedsHref } from '@/lib/admin/studentsRosterView';
import { stalledCheckInAction, TRIAGE_BUCKET_ACCENTS } from '@/lib/admin/triageDigestCopy';
import type { TriageBucket, TriageDigest, TriageMember } from '@/lib/admin/triageDigestTypes';
import {
  ATTENTION_REASON_META,
  attentionReasonDefinition,
  type AttentionReason,
} from './reasons';
import { selectByReason, type AttentionQueue, type MemberAttention } from './evaluate';

const TOP_N = 5;

/** The three org-wide numbers both admin pages print, in display order. */
export const ADMIN_ATTENTION_TILES = [
  { key: 'risk_alert', label: 'Risk alerts' },
  { key: 'no_activity_30d', label: 'Quiet 30+ days' },
  { key: 'new_no_counselor', label: 'New, no counselor' },
] as const satisfies ReadonlyArray<{ key: AttentionReason; label: string }>;

export type AdminAttentionTileKey = (typeof ADMIN_ATTENTION_TILES)[number]['key'];

export type AdminAttentionTile = {
  key: AdminAttentionTileKey;
  label: string;
  value: number;
  /** The rule, printed next to the number. */
  definition: string;
  href: string;
};

/**
 * Every attention number opens the one admin roster (`/admin/students`) on
 * the chip nearest its rule; the page resolves `?needs=` through
 * `chipForStudentsNeeds`. The legacy `/admin/members` hub never read `needs`,
 * so those links used to show the whole roster (admin audit 2026-09-20).
 */
export const ADMIN_ATTENTION_HREF: Record<AdminAttentionTileKey, string> = {
  risk_alert: studentsNeedsHref('at-risk'),
  no_activity_30d: studentsNeedsHref('stalled'),
  new_no_counselor: studentsNeedsHref('new-applicants'),
};

export function buildAdminAttentionTiles(queue: AttentionQueue): AdminAttentionTile[] {
  return ADMIN_ATTENTION_TILES.map((tile) => ({
    key: tile.key,
    label: tile.label,
    value: queue.totals.byReason[tile.key],
    definition: attentionReasonDefinition(tile.key),
    href: ADMIN_ATTENTION_HREF[tile.key],
  }));
}

/** Data for a Command Center "What needs you today" row (the page adds the icon). */
export type AdminAttentionQueueItem = {
  id: AdminAttentionTileKey;
  count: number;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  urgent: boolean;
  /**
   * The first members behind the count, each linking to the place the row's
   * action is taken (new applicants: the Counselor assignment card on their
   * record). `more` is how many the count holds beyond them.
   */
  members?: { label: string; items: Array<{ id: string; name: string; href: string }>; more: number };
};

/**
 * The Counselor assignment card on the admin member record (Overview tab,
 * the default). The kit Tabs island opens the panel holding an in-page
 * anchor and scrolls to it.
 */
export function adminCounselorAssignHref(memberId: string): string {
  return `/admin/members/${encodeURIComponent(memberId)}#admin-member-counselor-title`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function buildCommandCenterAttentionRows(queue: AttentionQueue): AdminAttentionQueueItem[] {
  const risk = queue.totals.byReason.risk_alert;
  const quiet = queue.totals.byReason.no_activity_30d;
  const newcomers = selectByReason(queue, 'new_no_counselor');
  const fresh = queue.totals.byReason.new_no_counselor;
  const listed = newcomers.slice(0, TOP_N);
  return [
    {
      id: 'risk_alert',
      count: risk,
      title: `${risk} ${plural(risk, 'member has', 'members have')} a risk alert`,
      detail: ATTENTION_REASON_META.risk_alert.definition,
      actionLabel: `${risk} ${plural(risk, 'item', 'items')}`,
      href: ADMIN_ATTENTION_HREF.risk_alert,
      urgent: risk > 0,
    },
    {
      id: 'no_activity_30d',
      count: quiet,
      title: `${quiet} ${plural(quiet, 'member is', 'members are')} quiet 30+ days`,
      detail: ATTENTION_REASON_META.no_activity_30d.definition,
      actionLabel: `${quiet} ${plural(quiet, 'item', 'items')}`,
      href: ADMIN_ATTENTION_HREF.no_activity_30d,
      urgent: quiet > 0,
    },
    // Restored on the admin Today (WAP-190): the rule is a `warning`, so the
    // row is listed but never marked urgent. Assignment happens per member,
    // on their record, so the row names the first few with a direct link.
    {
      id: 'new_no_counselor',
      count: fresh,
      title: `${fresh} new ${plural(fresh, 'applicant has', 'applicants have')} no counselor`,
      detail: ATTENTION_REASON_META.new_no_counselor.definition,
      actionLabel: `${fresh} ${plural(fresh, 'item', 'items')}`,
      href: ADMIN_ATTENTION_HREF.new_no_counselor,
      urgent: false,
      members: {
        label: 'Assign a counselor:',
        items: listed.map((row) => ({ id: row.memberId, name: row.memberName, href: adminCounselorAssignHref(row.memberId) })),
        more: Math.max(0, fresh - listed.length),
      },
    },
  ];
}

// ─── Detailed overview digest ────────────────────────────────────────────────

function memberProgram(row: MemberAttention): string | null {
  return row.enrolledProgram ? programDisplayTitle(row.enrolledProgram) : null;
}

function riskAction(row: MemberAttention): string {
  const level = row.context.atRiskLevel ? row.context.atRiskLevel.toLowerCase() : null;
  const score = row.context.atRiskScore;
  const scoreText = score != null ? `risk score ${score}${level ? ` (${level})` : ''}` : 'saved risk alert';
  const quiet = row.context.daysInactive != null ? ` · quiet for ${row.context.daysInactive}d` : '';
  return `Check in with ${row.memberName} — ${scoreText}${quiet}`;
}

function toTriageMember(row: MemberAttention, action: string): TriageMember {
  return {
    id: row.memberId,
    fullName: row.memberName,
    program: memberProgram(row),
    daysSinceActivity: row.context.daysInactive ?? null,
    health: null,
    action,
    href: `/admin/members/${row.memberId}`,
  };
}

/**
 * The "Who needs you today" digest, built from the shared queue. Bucket
 * counts are `totals.byReason`, the same numbers the Command Center tiles
 * print. Buckets with no members are omitted upstream, as before.
 */
export function buildAttentionDigest(queue: AttentionQueue): TriageDigest {
  const buckets: TriageBucket[] = [];

  const newMembers = selectByReason(queue, 'new_no_counselor');
  if (newMembers.length > 0) {
    const n = newMembers.length;
    buckets.push({
      key: 'new-applicants',
      count: n,
      label: `${n} new ${plural(n, 'applicant', 'applicants')} — no counselor yet`,
      definition: attentionReasonDefinition('new_no_counselor'),
      icon: 'assignment_ind',
      accent: TRIAGE_BUCKET_ACCENTS['new-applicants'],
      members: newMembers.slice(0, TOP_N).map((row) => {
        const d = row.context.daysSinceJoined;
        return toTriageMember(row, `Assign a counselor to ${row.memberName}${d != null && d > 0 ? ` — joined ${d}d ago` : ''}`);
      }),
      href: ADMIN_ATTENTION_HREF.new_no_counselor,
      cta: 'Review new applicants',
    });
  }

  const riskRows = selectByReason(queue, 'risk_alert');
  if (riskRows.length > 0) {
    const n = riskRows.length;
    buckets.push({
      key: 'at-risk',
      count: n,
      label: `${n} ${plural(n, 'member', 'members')} with a risk alert`,
      definition: attentionReasonDefinition('risk_alert'),
      icon: 'warning',
      accent: TRIAGE_BUCKET_ACCENTS['at-risk'],
      members: riskRows.slice(0, TOP_N).map((row) => toTriageMember(row, riskAction(row))),
      href: ADMIN_ATTENTION_HREF.risk_alert,
      cta: 'See who needs a nudge',
    });
  }

  const quietRows = selectByReason(queue, 'no_activity_30d');
  if (quietRows.length > 0) {
    const n = quietRows.length;
    buckets.push({
      key: 'stalled',
      count: n,
      label: `${n} ${plural(n, 'member', 'members')} quiet 30+ days — no activity`,
      definition: attentionReasonDefinition('no_activity_30d'),
      icon: 'pause_circle',
      accent: TRIAGE_BUCKET_ACCENTS.stalled,
      members: quietRows.slice(0, TOP_N).map((row) =>
        toTriageMember(row, stalledCheckInAction(row.memberName, row.context.daysInactive ?? null)),
      ),
      href: ADMIN_ATTENTION_HREF.no_activity_30d,
      cta: 'See quiet members',
    });
  }

  return { buckets, allClear: buckets.length === 0 };
}
