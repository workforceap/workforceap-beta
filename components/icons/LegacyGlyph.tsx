import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  AtSign,
  Award,
  BadgeCheck,
  Banknote,
  Bell,
  BellOff,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ChartBar,
  ChartLine,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Compass,
  Copy,
  Download,
  FileText,
  Flag,
  GitBranch,
  GraduationCap,
  Handshake,
  HardHat,
  Headset,
  HeartHandshake,
  HeartPulse,
  Home,
  IdCard,
  Inbox,
  KeyRound,
  Landmark,
  Languages,
  LayoutDashboard,
  Lock,
  Mail,
  MailOpen,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Monitor,
  Radar,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingDown,
  User,
  UserCheck,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Legacy Material Symbols ligature name → Lucide component.
 *
 * WAP-110 removed the second icon font from the public site, the apply funnel
 * and the member shell. Data-driven configs (nav tabs, step lists, metric
 * cards, trust signals) still carry their historical ligature names as plain
 * strings; render them through `LegacyGlyph` instead of a
 * `.material-symbols-outlined` span. Direct call sites should import the
 * Lucide component itself. Names not listed here fall back to a neutral dot
 * so a typo never renders as literal ligature text.
 */
export const LEGACY_GLYPHS: Record<string, LucideIcon> = {
  account_balance: Landmark,
  account_tree: GitBranch,
  alternate_email: AtSign,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  arrow_upward: ArrowUp,
  assignment: ClipboardList,
  assignment_turned_in: ClipboardCheck,
  assured_workload: ShieldCheck,
  auto_awesome: Sparkles,
  badge: IdCard,
  bar_chart: ChartBar,
  bolt: Zap,
  business: Building2,
  calendar_month: CalendarDays,
  campaign: Megaphone,
  chat: MessageCircle,
  chat_bubble: MessageSquare,
  check: Check,
  check_circle: CircleCheck,
  close: X,
  compare_arrows: ArrowLeftRight,
  computer: Monitor,
  construction: HardHat,
  content_copy: Copy,
  dashboard: LayoutDashboard,
  description: FileText,
  download: Download,
  error: CircleAlert,
  explore: Compass,
  flag: Flag,
  forum: MessagesSquare,
  groups: Users,
  handshake: Handshake,
  health_and_safety: HeartPulse,
  help_outline: CircleHelp,
  home: Home,
  how_to_reg: UserCheck,
  inbox: Inbox,
  key: KeyRound,
  lock: Lock,
  mail: Mail,
  mark_email_unread: MailOpen,
  menu_book: BookOpen,
  notifications: Bell,
  notifications_none: BellOff,
  payments: Banknote,
  person: User,
  query_stats: ChartLine,
  radar: Radar,
  schedule: Clock,
  school: GraduationCap,
  support_agent: Headset,
  timer: Timer,
  translate: Languages,
  trending_down: TrendingDown,
  verified: BadgeCheck,
  verified_user: ShieldCheck,
  volunteer_activism: HeartHandshake,
  work: Briefcase,
  work_outline: Briefcase,
  workspace_premium: Award,
};

export function legacyGlyph(name: string): LucideIcon {
  return LEGACY_GLYPHS[name] ?? CircleDot;
}

export type LegacyGlyphProps = {
  /** Historical Material Symbols ligature name (e.g. `check_circle`). */
  name: string;
  size?: number | string;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
};

/** Decorative Lucide glyph looked up by legacy name. Always `aria-hidden`. */
export default function LegacyGlyph({ name, size = 20, strokeWidth, className, style }: LegacyGlyphProps) {
  const Icon = legacyGlyph(name);
  return <Icon size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden="true" focusable="false" />;
}
