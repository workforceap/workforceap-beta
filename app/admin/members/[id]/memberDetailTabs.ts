/**
 * Admin member detail — the seven record tabs (admin audit gap map, wave 16).
 * Shared by the server page (reads `?tab=`), the kit Tabs island and the
 * specs, so the ids stay one list. Mirrors the counselor student detail
 * (`app/(portal)/counselor/students/[memberId]/studentDetailTabs.ts`).
 */
import type { KitTabItem } from '@/components/portal/kit';

const ADMIN_MEMBER_DETAIL_TAB_IDS = ['overview', 'program', 'eligibility', 'placement', 'messages', 'notes', 'activity'] as const;

export type AdminMemberDetailTabId = (typeof ADMIN_MEMBER_DETAIL_TAB_IDS)[number];

const ADMIN_MEMBER_DETAIL_DEFAULT_TAB: AdminMemberDetailTabId = 'overview';

/** Element-id prefix for the tablist (`<base>-tab-<id>` / `<base>-panel-<id>`). */
export const ADMIN_MEMBER_DETAIL_TABS_ID_BASE = 'admin-member-record';

/** Query-string key mirrored on switch: `?tab=program`. */
export const ADMIN_MEMBER_DETAIL_TAB_PARAM = 'tab';

export const ADMIN_MEMBER_DETAIL_TABS: ReadonlyArray<KitTabItem & { id: AdminMemberDetailTabId }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'program', label: 'Program' },
  { id: 'eligibility', label: 'Eligibility' },
  { id: 'placement', label: 'Placement' },
  { id: 'messages', label: 'Messages' },
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity' },
];

/** `?tab=` value → tab id; anything unknown falls back to Overview. */
export function parseAdminMemberDetailTab(
  value: string | string[] | undefined | null,
): AdminMemberDetailTabId {
  const raw = Array.isArray(value) ? value[0] : value;
  const lower = raw?.trim().toLowerCase();
  return (ADMIN_MEMBER_DETAIL_TAB_IDS as readonly string[]).includes(lower ?? '')
    ? (lower as AdminMemberDetailTabId)
    : ADMIN_MEMBER_DETAIL_DEFAULT_TAB;
}
