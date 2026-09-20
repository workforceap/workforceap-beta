/**
 * Admin member detail — Activity tab rows.
 *
 * Merges the two audit trails that already exist for a member into one
 * newest-first list: staff actions recorded against the member in
 * `AuditLog` (targetType User/user, targetId = member) and the member's own
 * `MemberEvent` rows. Pure: the page passes the (capped) rows it loaded and
 * this module only labels, merges, sorts and caps. No DB access here.
 */

export type MemberActivityKind = 'staff' | 'member';

export interface MemberActivityAuditInput {
  id: string;
  action: string;
  createdAt: Date;
  actorName?: string | null;
  actorEmailSnapshot?: string | null;
  actorRoleSnapshot?: string | null;
}

export interface MemberActivityEventInput {
  id: string;
  eventName: string;
  createdAt: Date;
}

export interface MemberActivityRow {
  id: string;
  kind: MemberActivityKind;
  /** Human-readable label derived from the audit action / event name. */
  label: string;
  /** Who did it: staff name (or e-mail snapshot), or "Member" for the member's own events. */
  actor: string;
  at: Date;
}

export const MEMBER_ACTIVITY_CAP = 20;

/**
 * `admin_feature_flag_update` → "Feature flag update";
 * `career_plan_saved` → "Career plan saved". Leading `admin_` / `member_`
 * prefixes only say who, which the row already shows, so they are dropped.
 */
export function humanizeActivityName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Activity';
  const words = trimmed
    .replace(/^(admin|member|staff)[_-]/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  if (!words) return 'Activity';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function auditActor(row: MemberActivityAuditInput): string {
  const name = row.actorName?.trim();
  if (name) return name;
  const email = row.actorEmailSnapshot?.trim();
  if (email) return email;
  const role = row.actorRoleSnapshot?.trim();
  if (role) return `${humanizeActivityName(role)} (account removed)`;
  return 'System';
}

export function buildMemberActivityRows(input: {
  auditRows: ReadonlyArray<MemberActivityAuditInput>;
  eventRows: ReadonlyArray<MemberActivityEventInput>;
  limit?: number;
}): MemberActivityRow[] {
  const limit = Math.max(1, Math.floor(input.limit ?? MEMBER_ACTIVITY_CAP));
  const staff: MemberActivityRow[] = input.auditRows.map((row) => ({
    id: `audit:${row.id}`,
    kind: 'staff',
    label: humanizeActivityName(row.action),
    actor: auditActor(row),
    at: row.createdAt,
  }));
  const member: MemberActivityRow[] = input.eventRows.map((row) => ({
    id: `event:${row.id}`,
    kind: 'member',
    label: humanizeActivityName(row.eventName),
    actor: 'Member',
    at: row.createdAt,
  }));
  return [...staff, ...member]
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id))
    .slice(0, limit);
}
