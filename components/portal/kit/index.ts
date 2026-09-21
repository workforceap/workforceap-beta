/**
 * Portal Design Kit — public barrel (Phase 0).
 * Spec: docs/PORTAL_DESIGN_KIT.md
 * READ FIRST: docs/KIT_GUIDE.md — token families, surface modes, status-tone
 * semantics, the KitBaseProps contract, and the anti-pattern list. If you
 * change exports here, update the guide's component index in the same PR.
 *
 * Kit primitives (`StatusTag`, `Avatar`, `ProgressBar`, `KitEmptyState`, …)
 * stay on `--wa-*`. Pages compose Astryx Card/Token/Button per KIT_GUIDE §9;
 * the barrel does not wrap primitives in Astryx. `./astryxMap.ts` is only the
 * tone bridge where kit still feeds Astryx Token/Badge: `alert` → brand
 * magenta, `danger` → true red. Do not collapse those tones.
 */
export { DesignSurface, useSurface, type SurfaceMode } from './DesignSurface';
export { cx, type KitBaseProps, type KitDataAttrs } from './base';
export { useFocusTrap, getFocusable, type FocusTrapOptions } from './hooks/useFocusTrap';
export { useListFocus, LIST_ITEM_ATTR, type ListFocusOptions } from './hooks/useListFocus';
export { useAnnounce, announce } from './hooks/useAnnounce';
export { StatTile } from './StatTile';
export { KpiStrip, type KpiItem } from './KpiStrip';
export { StatusTag } from './StatusTag';
export { JobListingRow, JobListingRowSkeleton } from './JobListingRow';
export { KitEmptyState } from './KitEmptyState';
export { SectionHeader } from './SectionHeader';
export { PageOpener } from './PageOpener';
export { ProgressRing } from './ProgressRing';
export { ProgressBar } from './ProgressBar';
export { Avatar } from './Avatar';
export { DataTable, type Column, type KitTablePagination, type KitTableBulkBarContext } from './DataTable';
export { KitTableToolbar, type KitTableViewChip } from './KitTableToolbar';
export { KitRowMenu, type KitRowMenuItem } from './KitRowMenu';
export {
  KIT_TABLE_PAGE_SIZE,
  readKitTableUrlState,
  writeKitTableUrlState,
  kitTableHref,
  parseKitTableSort,
  serializeKitTableSort,
  type KitTableSort,
  type KitTableUrlState,
} from './kitTableUrlState';
export { FeatureTile } from './FeatureTile';
export { QueueRow, type QueueTone } from './QueueRow';
export { WorkQueueItem } from './WorkQueueItem';
export { KanbanBoard, KanbanColumnHeader, type KanbanColumnData, type KanbanCardData } from './Kanban';
export { BarChartMini, RankBars, Sparkline, AreaChartMini, type ChartDatum, type RankDatum } from './Charts';
export {
  CardHead,
  DeltaChip,
  StatSparkTile,
  StageTrack,
  SegmentedProgress,
  type SparkStat,
} from './CommandCenter';
export { FormField, Toggle } from './FormField';
export { ChatThread, type ChatMessage } from './ChatThread';
export { Tabs, TabPanel, type KitTabItem } from './Tabs';
export { AppShellSidebar, type NavItem, type NavGroup } from './AppShellSidebar';
export { AppShellMember, type MemberTab } from './AppShellMember';
export { UniversalSearch } from './UniversalSearch';
export { MemberDashboardKit, type MemberDashboardKitProps } from './MemberDashboardKit';
export { colorVar, toneClass, tonePaint, type KitColor, type KitTone } from './tokens';
