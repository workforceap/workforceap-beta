'use client';

import {
  Zap,
  BarChart3,
  Users,
  MessageSquare,
  BookOpen,
  GitBranch,
  Table2,
  ClipboardCheck,
  Award,
  Target,
  ClipboardList,
  Handshake,
  Building2,
  ListChecks,
  Briefcase,
  GraduationCap,
  UserCog,
  UsersRound,
  TrendingUp,
  LineChart,
  FileText,
  Mail,
  Sparkles,
  Filter,
  TriangleAlert,
  User,
  Download,
  RefreshCw,
  Activity,
  Timer,
  HeartPulse,
  ShieldHalf,
  Search,
  SquareArrowOutUpRight,
  type LucideIcon,
} from 'lucide-react';
import { AppShellSidebar, type NavGroup } from '@/components/portal/kit';

/**
 * Admin sidebar nav — the dark `#161616` rail from
 * `docs/mockups/workforceap-admin-full.html`. Mirrors the mockup's `GROUPS`
 * array (which "mirrors lib/nav/portalNav.ts exactly") and wraps the kit's
 * <AppShellSidebar> so every admin kit page shares one chrome.
 *
 * Each Font Awesome icon from the mockup is mapped to its closest lucide-react
 * equivalent per the porting guide.
 */
export interface AdminSidebarNavProps {
  /** Active nav item id. Defaults to the Command Center ('today'). */
  activeId?: string;
  /** Sticky top-bar content (title, actions) rendered to the right of the rail. */
  topbar?: React.ReactNode;
  onNavigate?: (id: string) => void;
  children: React.ReactNode;
}

interface RawNavItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  badge?: string;
}
interface RawNavGroup {
  label: string;
  items: RawNavItem[];
}

/** Faithful port of the mockup's GROUPS (labels, ids, badges) with lucide icons. */
const RAW_GROUPS: RawNavGroup[] = [
  {
    label: 'Run the org',
    items: [
      { id: 'today', label: 'Command Center', Icon: Zap },
      { id: 'overview', label: 'Detailed overview', Icon: BarChart3 },
    ],
  },
  {
    label: 'Students',
    items: [
      { id: 'members', label: 'Students', Icon: Users, badge: '847' },
      { id: 'messages', label: 'Messages', Icon: MessageSquare, badge: '6' },
    ],
  },
  {
    label: 'Programs',
    items: [
      { id: 'programs', label: 'Programs', Icon: BookOpen },
      { id: 'program-requests', label: 'Program requests', Icon: GitBranch, badge: '3' },
      { id: 'training-progress', label: 'Training progress', Icon: Table2 },
      { id: 'assessments', label: 'Assessments', Icon: ClipboardCheck },
      { id: 'certifications', label: 'Certificates', Icon: Award, badge: '12' },
      { id: 'career-mappings', label: 'Career paths', Icon: Target },
      { id: 'wioa', label: 'Funding eligibility', Icon: ClipboardList },
    ],
  },
  {
    label: 'Partners & Employers',
    items: [
      { id: 'partners', label: 'Partners', Icon: Handshake },
      { id: 'employers', label: 'Employers', Icon: Building2 },
      { id: 'screening-packs', label: 'Employer screening', Icon: ListChecks },
      { id: 'jobs', label: 'Jobs', Icon: Briefcase },
      { id: 'mentors', label: 'Mentors', Icon: GraduationCap },
      { id: 'counselors', label: 'Counselors', Icon: UserCog },
      { id: 'subgroups', label: 'Subgroups', Icon: UsersRound },
    ],
  },
  {
    label: 'Outcomes',
    items: [
      { id: 'board', label: 'Board outcomes', Icon: TrendingUp },
      { id: 'outcomes', label: 'Placement outcomes', Icon: LineChart },
      { id: 'placements', label: 'Placements', Icon: Briefcase },
      { id: 'placement-surveys', label: 'Placement surveys', Icon: ClipboardCheck },
      { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
    ],
  },
  {
    label: 'Content',
    items: [
      { id: 'blog', label: 'Blog', Icon: FileText },
      { id: 'invites', label: 'Invites', Icon: Mail },
    ],
  },
  {
    label: 'Advanced',
    items: [
      { id: 'sessions', label: 'In-office sessions', Icon: Sparkles },
      { id: 'pipeline', label: 'Applications funnel', Icon: Filter },
      { id: 'duplicates', label: 'Duplicate students', Icon: TriangleAlert },
      { id: 'users', label: 'Users', Icon: User },
      { id: 'exports', label: 'Exports', Icon: Download },
      { id: 'coursera', label: 'Coursera', Icon: RefreshCw },
      { id: 'metrics', label: 'Metrics', Icon: LineChart },
      { id: 'weekly-recap', label: 'Weekly recap', Icon: BarChart3 },
      { id: 'ai-tools', label: 'AI tools', Icon: Sparkles },
      { id: 'ai-efficacy', label: 'AI Efficacy', Icon: Target },
      { id: 'diagnostics', label: 'Diagnostics', Icon: Activity },
      { id: 'crons', label: 'Cron Monitor', Icon: Timer },
      { id: 'health', label: 'System Health', Icon: HeartPulse },
      { id: 'audit', label: 'Audit logs', Icon: ShieldHalf },
    ],
  },
];

const ICON_SIZE = 14;

function toNavGroups(): NavGroup[] {
  return RAW_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map((it) => ({
      id: it.id,
      label: it.label,
      icon: (
        <it.Icon size={ICON_SIZE} style={{ color: 'var(--wa-sidebar-label)', flexShrink: 0 }} aria-hidden />
      ),
      badge: it.badge,
    })),
  }));
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 32,
          height: 32,
          background: 'var(--wa-accent)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--wa-sidebar-text)',
          flexShrink: 0,
        }}
      >
        <ShieldHalf size={16} aria-hidden />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1 }}>WorkforceAP</div>
        <div style={{ fontSize: 13, color: 'color-mix(in srgb, var(--wa-sidebar-text) 64%, transparent)', marginTop: 2 }}>Admin · Austin</div>
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: 'linear-gradient(135deg, var(--wa-gold), var(--wa-gold-dark))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        DB
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Dad (Owner)
        </div>
        <div style={{ fontSize: 13, color: 'color-mix(in srgb, var(--wa-sidebar-text) 64%, transparent)' }}>Super Admin</div>
      </div>
      <a
        href="/"
        title="Design Lab"
        className="wa-kit-focus"
        style={{ marginLeft: 'auto', color: 'color-mix(in srgb, var(--wa-sidebar-text) 64%, transparent)', borderRadius: 4, display: 'inline-flex' }}
      >
        <SquareArrowOutUpRight size={14} aria-hidden />
      </a>
    </div>
  );
}

export function AdminSidebarNav({
  activeId = 'today',
  topbar,
  onNavigate,
  children,
}: AdminSidebarNavProps) {
  return (
    // Below lg the rail (<AppShellSidebar>) is a hamburger-triggered drawer:
    // it's `position: fixed` and slid fully off-canvas (`-translateX(100%)`),
    // and the content area carries no left margin (`lg:wa-ml-64` only applies
    // at lg), so the page is genuinely full-width on phones. This wrapper adds
    // a defensive boundary so anything a page passes through `children` can't
    // push horizontal scroll: `overflow-x: clip` (not `hidden`, so it does NOT
    // create a scroll container and the shell's sticky topbar keeps working)
    // plus `minWidth: 0`/`width: 100%` so the column can shrink to the viewport.
    // (Note: the off-canvas rail is `position: fixed`, so it escapes this clip
    // by spec; off-viewport fixed content to the left doesn't extend the page's
    // scroll width, which is why the drawer doesn't overflow on its own.) At lg
    // the rail is in-flow and offset by `lg:wa-ml-64`, so desktop is untouched.
    <div style={{ overflowX: 'clip', minWidth: 0, width: '100%' }}>
      <AppShellSidebar
        brand={<Brand />}
        groups={toNavGroups()}
        activeId={activeId}
        onNavigate={onNavigate}
        footer={<SidebarFooter />}
        topbar={topbar}
      >
        {/* The mockup's admin search lives in the rail; surfaced here as a hint
            for the topbar/universal-search wiring. Kept lightweight: the rail
            search input is decorative chrome in the mockup. */}
        <div className="wa-hidden" aria-hidden>
          <Search size={12} />
        </div>
        {children}
      </AppShellSidebar>
    </div>
  );
}

export default AdminSidebarNav;
