/**
 * Counselor student detail — the four record tabs (counselor audit §6 item 3,
 * §2 item 4). Shared by the server page (reads `?tab=`), the kit Tabs island
 * and the specs, so the ids stay one list.
 */
import type { KitTabItem } from '@/components/portal/kit';

const STUDENT_DETAIL_TAB_IDS = ['profile', 'training', 'notes', 'messages'] as const;

type StudentDetailTabId = (typeof STUDENT_DETAIL_TAB_IDS)[number];

const STUDENT_DETAIL_DEFAULT_TAB: StudentDetailTabId = 'profile';

/** Element-id prefix for the tablist (`<base>-tab-<id>` / `<base>-panel-<id>`). */
export const STUDENT_DETAIL_TABS_ID_BASE = 'counselor-member-record';

/** Query-string key mirrored on switch: `?tab=messages`. */
export const STUDENT_DETAIL_TAB_PARAM = 'tab';

export const STUDENT_DETAIL_TABS: ReadonlyArray<KitTabItem & { id: StudentDetailTabId }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'training', label: 'Training' },
  { id: 'notes', label: 'Notes' },
  { id: 'messages', label: 'Messages' },
];

/** `?tab=` value → tab id; anything unknown falls back to Profile. */
export function parseStudentDetailTab(value: string | string[] | undefined | null): StudentDetailTabId {
  const raw = Array.isArray(value) ? value[0] : value;
  const lower = raw?.trim().toLowerCase();
  return (STUDENT_DETAIL_TAB_IDS as readonly string[]).includes(lower ?? '')
    ? (lower as StudentDetailTabId)
    : STUDENT_DETAIL_DEFAULT_TAB;
}
