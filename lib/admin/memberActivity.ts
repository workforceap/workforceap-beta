/**
 * Admin member detail — Activity tab rows.
 *
 * Merges the two audit trails that already exist for a member into one
 * newest-first list: staff actions recorded against the member in
 * `AuditLog` (targetType User/user, targetId = member) and the member's own
 * `MemberEvent` rows. Pure: the page passes the (capped) rows it loaded and
 * this module only labels, merges, sorts and caps. No DB access here.
 */

import { CONTACT_AND_SECRET_KEY, redactMetadataKeys } from '@/lib/security/redactMetadata';

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
  /** `MemberEvent.entityType` / `entityId` / `metadata` — optional, shown in the row's "Event details" disclosure. */
  entityType?: string | null;
  entityId?: string | null;
  metadata?: unknown;
}

/** What the "Event details" disclosure prints for a member event. */
export interface MemberActivityDetail {
  entityType: string | null;
  entityId: string | null;
  /** Pretty-printed, redacted JSON; null when the event carried no metadata. */
  metadata: string | null;
}

export interface MemberActivityRow {
  id: string;
  kind: MemberActivityKind;
  /** Human-readable label derived from the audit action / event name. */
  label: string;
  /** Who did it: staff name (or e-mail snapshot), or "Member" for the member's own events. */
  actor: string;
  at: Date;
  /** Member events only; staff audit rows carry no entity/metadata. */
  detail?: MemberActivityDetail;
}

/** Rows shown before the "Show all N events" disclosure. */
export const MEMBER_ACTIVITY_CAP = 20;
/** Member events loaded for the Activity tab (the retired lifecycle page showed 100). */
export const MEMBER_EVENT_LOAD_CAP = 100;

/**
 * Deep copy of event metadata with any key named like email / phone / token /
 * password replaced by "[redacted]" (arrays and nested objects included), so
 * the Activity tab never prints contact details or secrets an event stored.
 */
export function redactActivityMetadata(value: unknown): unknown {
  return redactMetadataKeys(value, CONTACT_AND_SECRET_KEY);
}

/** Pretty JSON of the redacted metadata; null for null/undefined or an empty object. */
export function formatActivityMetadata(metadata: unknown): string | null {
  if (metadata === null || metadata === undefined) return null;
  if (typeof metadata === 'object' && !Array.isArray(metadata) && Object.keys(metadata as object).length === 0) return null;
  return JSON.stringify(redactActivityMetadata(metadata), null, 2);
}

function eventDetail(row: MemberActivityEventInput): MemberActivityDetail | undefined {
  const entityType = row.entityType?.trim() || null;
  const entityId = row.entityId?.trim() || null;
  const metadata = formatActivityMetadata(row.metadata);
  if (!entityType && !entityId && !metadata) return undefined;
  return { entityType, entityId, metadata };
}

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
    ...(eventDetail(row) ? { detail: eventDetail(row) } : null),
  }));
  return [...staff, ...member]
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id))
    .slice(0, limit);
}
