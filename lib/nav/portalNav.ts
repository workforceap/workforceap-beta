import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Award,
  Zap,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Download,
  FileText,
  Flag,
  GitBranch,
  GraduationCap,
  Handshake,
  HeartPulse,
  HelpCircle,
  Home,
  Layers,
  LayoutDashboard,
  LineChart,
  Library,
  ListChecks,
  MessageSquare,
  Mic,
  PlusCircle,
  Settings,
  Shield,
  Sparkles,
  Table2,
  Target,
  Timer,
  TrendingUp,
  Upload,
  User,
  Users,
  UsersRound,
} from 'lucide-react';
import { isWioaPortalAvailable } from '@/lib/wioa/wioaAvailability';

export type PortalRole = 'member' | 'employer' | 'partner' | 'admin' | 'group' | 'counselor';

export type NavGroup =
  | 'primary'
  | 'workflows'
  | 'people'
  | 'pipeline'
  | 'content'
  | 'insights'
  | 'manage'
  // Admin-first, plain-language groups (non-technical owner view)
  | 'runTheOrg'
  | 'students'
  | 'programs'
  | 'partnersEmployers'
  | 'outcomes'
  | 'advanced';

export type NavTab = 'journey' | 'program' | 'jobs' | 'me';

export type NavBadgeKey =
  | 'jobs_draft'
  | 'jobs_pending'
  | 'jobs_live'
  | 'applications_new'
  | 'partner_needs_attention'
  | 'milestones_new'
  | 'milestones_awaiting_approval'
  | 'counselor_messages_unread'
  /** Unread rows in the counselor's own notifications table (counselor audit §6.8). */
  | 'counselor_notifications_unread'
  | 'counselor_sla_breach_48h'
  /** Member threads whose latest message has no staff reply yet (any age). */
  | 'member_messages_unanswered'
  | 'employer_queue_review_today'
  | 'employer_queue_stale_48h'
  | 'employer_queue_interview'
  | 'employer_messages_unread'
  | 'partner_messages_unread';

export type PortalNavItem = {
  href: string;
  label: string;
  group: NavGroup;
  /** Top-level workspace tab (member portal only for now) */
  tab?: NavTab;
  Icon?: LucideIcon;
  aliases?: string[];
  /** `data-tour` id for first-login tooltip tour (Sprint 8c) */
  tourTarget?: string;
  /** Single badge key from server map */
  badgeKey?: NavBadgeKey;
  /** Sum multiple keys (e.g. draft + pending on Jobs) */
  badgeKeys?: NavBadgeKey[];
  requiresSuperAdminContext?: boolean;
  /**
   * Set on a contextual child row (the AI Career Tools tool the member is
   * currently inside). Carries the parent's href so the rail can nest and
   * indent the row under it. Never present on a permanent rail entry.
   */
  nestedUnder?: string;
};

export const NAV_TAB_META: Record<NavTab, { label: string; icon: string }> = {
  journey: { label: 'Home', icon: 'home' },
  program: { label: 'My program', icon: 'school' },
  jobs: { label: 'Jobs', icon: 'work' },
  me: { label: 'AI Career Tools', icon: 'auto_awesome' },
};

export const NAV_TAB_ORDER: NavTab[] = ['journey', 'program', 'jobs', 'me'];

export const NAV_GROUP_LABELS: Record<NavGroup, string | null> = {
  primary: null,
  workflows: 'Workflows',
  people: 'People',
  pipeline: 'Pipeline',
  content: 'Content',
  insights: 'Insights',
  manage: 'Manage',
  // Admin-first, plain-language groups
  runTheOrg: 'Run the org',
  students: 'Students',
  programs: 'Programs',
  partnersEmployers: 'Partners & Employers',
  outcomes: 'Outcomes',
  advanced: 'Advanced',
};

export const GROUP_ORDER: NavGroup[] = [
  'primary',
  // Admin daily-first groups (rendered only when items use them)
  'runTheOrg',
  'students',
  'programs',
  'partnersEmployers',
  'outcomes',
  'content',
  // Shared portal groups (members / employers / partners / counselors)
  'people',
  'pipeline',
  'workflows',
  'insights',
  'manage',
  // Technical / system tooling, demoted to the very bottom
  'advanced',
];

const WIOA_AVAILABLE = isWioaPortalAvailable(process.env.NEXT_PUBLIC_WIOA_ENABLED);

export const MEMBER_PORTAL_NAV_ITEMS: PortalNavItem[] = [
  // ── Home tab ──
  { href: '/dashboard', label: 'Home', group: 'primary', tab: 'journey', Icon: Home, tourTarget: 'tour-dashboard' },
  // ── Program tab ──
  { href: '/dashboard/program', label: 'My program', group: 'primary', tab: 'program', Icon: BookOpen, tourTarget: 'tour-programs' },
  {
    href: '/dashboard/jobs',
    label: 'Job board',
    group: 'primary',
    tab: 'jobs',
    Icon: Briefcase,
    tourTarget: 'tour-jobs',
  },
  { href: '/dashboard/readiness', label: 'My progress', group: 'primary', tab: 'jobs', Icon: CheckCircle },
  { href: '/dashboard/ai-tools', label: 'AI Career Tools', group: 'primary', tab: 'me', Icon: Sparkles, aliases: ['/dashboard/toolkit', '/dashboard/ai-tools/studio'], tourTarget: 'tour-ai-tools' },
  { href: '/dashboard/missions', label: 'Skill missions', group: 'primary', tab: 'program', Icon: Target },
  {
    href: '/dashboard/program/start',
    label: 'Path to certification',
    group: 'insights',
    tab: 'program',
    Icon: GitBranch,
  },
  { href: '/dashboard/certifications', label: 'My certificates', group: 'manage', tab: 'program', Icon: Award, aliases: ['/certifications'] },
  { href: '/dashboard/documents', label: 'My documents', group: 'manage', tab: 'program', Icon: FileText },
  { href: '/dashboard/career-brief', label: 'My career plan', group: 'insights', tab: 'program', Icon: ClipboardList },
  ...(WIOA_AVAILABLE
    ? [
        {
          href: '/dashboard/learning/wioa-qualification',
          label: 'WIOA Qualification',
          group: 'insights',
          tab: 'program',
          Icon: Shield,
        } as PortalNavItem,
      ]
    : []),
  // ── Jobs tab (board + progress sit in primary; apply/resume stay grouped) ──
  {
    href: '/dashboard/job-applications',
    label: 'Job applications',
    group: 'workflows',
    tab: 'jobs',
    Icon: FileText,
    aliases: ['/dashboard/ai-tools/application-tracker', '/applications'],
    badgeKey: 'applications_new',
  },
  { href: '/dashboard/resume', label: 'Resume', group: 'workflows', tab: 'jobs', Icon: FileText },
  // ── Tools tab (AI Career Tools sits in primary; advisor/hub stay grouped) ──
  { href: '/dashboard/counselor', label: 'AI Advisor', group: 'workflows', tab: 'me', Icon: Mic },
  {
    href: '/dashboard/learning',
    label: 'Learning Hub',
    group: 'workflows',
    tab: 'me',
    Icon: Library,
    aliases: ['/resources', '/dashboard/career-library'],
    tourTarget: 'tour-learning',
  },
  {
    href: '/dashboard/learning/find-your-career',
    label: 'Find your career',
    group: 'workflows',
    tab: 'me',
    Icon: Compass,
    aliases: ['/dashboard/learning/interest-profiler'],
  },
  {
    href: '/dashboard/assessment',
    label: 'Training preassessment',
    group: 'insights',
    tab: 'me',
    Icon: ClipboardCheck,
    aliases: ['/dashboard/assessments', '/dashboard/skills-assessment'],
  },
  // ── Profile tab ──
  { href: '/dashboard/referrals', label: 'Invite a friend', group: 'manage', tab: 'me', Icon: Users },
  { href: '/dashboard/weekly-recap', label: 'Weekly recap', group: 'insights', tab: 'journey', Icon: BarChart3 },
  {
    href: '/dashboard/messages',
    label: 'Messages',
    group: 'primary',
    tab: 'journey',
    Icon: MessageSquare,
    badgeKey: 'counselor_messages_unread',
    tourTarget: 'tour-messages',
  },
  { href: '/dashboard/resources', label: 'Resources', group: 'workflows', tab: 'me', Icon: Layers, tourTarget: 'tour-resources' },
  {
    href: '/dashboard/help',
    label: 'Help & Support',
    group: 'manage',
    tab: 'me',
    Icon: HelpCircle,
    aliases: ['/help'],
  },
  { href: '/dashboard/guide', label: 'Member Guide', group: 'manage', tab: 'me', Icon: BookOpen },
  {
    href: '/dashboard/profile',
    label: 'Profile & settings',
    group: 'manage',
    tab: 'me',
    Icon: User,
    aliases: ['/profile', '/account', '/dashboard/settings'],
    tourTarget: 'tour-profile',
  },
  // "My Account" is the member's home base — it lands on the dashboard, not on
  // the profile/settings page (which surprised members). Account settings stay
  // reachable via "Profile & settings" above (/dashboard/profile #settings).
  { href: '/dashboard', label: 'My account', group: 'manage', tab: 'me', Icon: Home },
];

export const EMPLOYER_PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { href: '/employer', label: 'Overview', group: 'primary', Icon: LayoutDashboard, tourTarget: 'tour-overview' },
  {
    href: '/employer/work-queue',
    label: 'Work queue',
    group: 'workflows',
    Icon: ListChecks,
    tourTarget: 'tour-work-queue',
    badgeKeys: ['employer_queue_review_today', 'employer_queue_stale_48h', 'employer_queue_interview'],
  },
  {
    href: '/employer/jobs',
    label: 'Jobs',
    group: 'workflows',
    Icon: Briefcase,
    tourTarget: 'tour-jobs',
    badgeKeys: ['jobs_draft', 'jobs_pending'],
  },
  { href: '/employer/jobs/new', label: 'Post job', group: 'workflows', Icon: PlusCircle },
  { href: '/employer/jobs/import', label: 'Imports', group: 'workflows', Icon: Upload },
  {
    href: '/employer/applications',
    label: 'Applicants',
    group: 'workflows',
    Icon: Users,
    tourTarget: 'tour-applicants',
    badgeKey: 'applications_new',
  },
  { href: '/employer/matches', label: 'Match history', group: 'workflows', Icon: Sparkles, tourTarget: 'tour-matches' },
  { href: '/employer/pipeline', label: 'Candidate pipeline', group: 'workflows', Icon: GitBranch, tourTarget: 'tour-pipeline' },
  {
    href: '/employer/messages',
    label: 'Messages',
    group: 'manage',
    Icon: MessageSquare,
    tourTarget: 'tour-messages',
    badgeKey: 'employer_messages_unread',
  },
  { href: '/employer/settings', label: 'Company settings', group: 'manage', Icon: Settings, tourTarget: 'tour-settings' },
  { href: '/employer/guide', label: 'How it works', group: 'manage', Icon: HelpCircle },
];

export const PARTNER_PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { href: '/partner', label: 'Overview', group: 'primary', Icon: LayoutDashboard, tourTarget: 'tour-overview' },
  {
    href: '/partner/referred-members',
    label: 'Referred members',
    group: 'workflows',
    Icon: Users,
    tourTarget: 'tour-members',
    aliases: ['/partner/members'],
    badgeKey: 'partner_needs_attention',
  },
  {
    href: '/partner/attention',
    label: 'Attention queue',
    group: 'workflows',
    Icon: AlertTriangle,
    tourTarget: 'tour-attention',
  },
  {
    href: '/partner/milestones',
    label: 'Milestones',
    group: 'workflows',
    Icon: Flag,
    badgeKey: 'milestones_new',
  },
  { href: '/partner/guide', label: 'Referral guide', group: 'workflows', Icon: ClipboardList },
  { href: '/partner/outcomes', label: 'Outcomes snapshot', group: 'insights', Icon: BarChart3, tourTarget: 'tour-outcomes' },
  { href: '/partner/resources', label: 'Partner resources', group: 'manage', Icon: Layers },
  { href: '/partner/exports', label: 'Exports', group: 'manage', Icon: Download, tourTarget: 'tour-exports' },
  {
    href: '/partner/messages',
    label: 'Messages',
    group: 'manage',
    Icon: MessageSquare,
    tourTarget: 'tour-messages',
    badgeKey: 'partner_messages_unread',
  },
  { href: '/partner/settings', label: 'Settings', group: 'manage', Icon: Settings },
];

/** @deprecated Subgroup leader UI removed; keep empty for typing */
export const GROUP_PORTAL_NAV_ITEMS: PortalNavItem[] = [];

/**
 * Admin ops — reorganized for a NON-technical owner.
 * Everyday, plain-language groups lead; all technical/system tooling is
 * demoted into a single "Advanced / System" group at the very bottom.
 * Every existing route/href is preserved — this is a reorder + relabel only.
 */
export const ADMIN_PORTAL_NAV_ITEMS: PortalNavItem[] = [
  // ── Run the org — the home / "who needs you today" ──
  // /admin IS the Command Center (renders CommandCenterKit); the old separate
  // /admin/command-center entry was redundant (same view) so it's dropped from
  // the rail — the route still exists and is reachable directly.
  // `tourTarget`s are the admin.home guided-tour anchors (lib/tours/registry.ts).
  { href: '/admin', label: 'Command Center', group: 'runTheOrg', Icon: Zap, tourTarget: 'tour-command-center' },
  { href: '/admin/overview', label: 'Detailed overview', group: 'runTheOrg', Icon: BarChart3, tourTarget: 'tour-overview' },

  // ── Students — the people you manage day to day ──
  // Single entry → the full-kit roster (StudentsRosterKit) at /admin/students,
  // which matches the admin-full mockup's Students view. The legacy management
  // hub (/admin/members) remains reachable via /admin/students?ui=legacy and the
  // flavored sub-lists (Interview ready, Job ready, Duplicates, Applications
  // funnel) in Advanced / System below. All underlying page.tsx routes preserved.
  { href: '/admin/students', label: 'Students', group: 'students', Icon: Users, tourTarget: 'tour-students' },
  {
    href: '/admin/messages',
    label: 'Messages',
    group: 'students',
    Icon: MessageSquare,
    requiresSuperAdminContext: true,
    // WAP-168: the badge is every member message awaiting a staff reply, not
    // only the ones already 48h overdue, so someone is pushed to look today.
    badgeKey: 'member_messages_unanswered',
    tourTarget: 'tour-messages',
  },

  // ── Programs & Training ──
  { href: '/admin/programs', label: 'Programs', group: 'programs', Icon: BookOpen, tourTarget: 'tour-programs' },
  {
    href: '/admin/program-change-requests',
    label: 'Program requests',
    group: 'programs',
    Icon: ArrowLeftRight,
  },
  { href: '/admin/training-progress', label: 'Training progress', group: 'programs', Icon: Table2, tourTarget: 'tour-training-progress' },
  { href: '/admin/assessments', label: 'Assessments', group: 'programs', Icon: ClipboardCheck },
  { href: '/admin/certifications', label: 'Certificates', group: 'programs', Icon: Award },
  { href: '/admin/career-mappings', label: 'Career paths', group: 'programs', Icon: Target },
  { href: '/admin/wioa-screening', label: 'Funding eligibility', group: 'programs', Icon: ClipboardList },

  // ── Partners & Employers ──
  { href: '/admin/partners', label: 'Partners', group: 'partnersEmployers', Icon: Handshake },
  { href: '/admin/employers', label: 'Employers', group: 'partnersEmployers', Icon: Building2 },
  { href: '/admin/employer-screening-packs', label: 'Employer screening', group: 'partnersEmployers', Icon: ListChecks },
  { href: '/admin/jobs', label: 'Jobs', group: 'partnersEmployers', Icon: Briefcase },
  { href: '/admin/mentors', label: 'Mentors', group: 'partnersEmployers', Icon: GraduationCap },
  { href: '/admin/counselors', label: 'Counselors', group: 'partnersEmployers', Icon: Users },
  { href: '/admin/subgroups', label: 'Subgroups', group: 'partnersEmployers', Icon: UsersRound },

  // ── Outcomes — results and reporting ──
  { href: '/admin/board', label: 'Board outcomes', group: 'outcomes', Icon: TrendingUp },
  { href: '/admin/outcomes', label: 'Placement outcomes', group: 'outcomes', Icon: LineChart },
  { href: '/admin/placements', label: 'Placements', group: 'outcomes', Icon: Briefcase },
  { href: '/admin/placement-surveys', label: 'Placement surveys', group: 'outcomes', Icon: ClipboardCheck },
  { href: '/admin/analytics', label: 'Analytics', group: 'outcomes', Icon: BarChart3 },

  // ── Content — blog & invites ──
  { href: '/admin/blog', label: 'Blog', group: 'content', Icon: FileText },
  { href: '/admin/invites', label: 'Invites', group: 'content', Icon: MessageSquare },

  // ── Advanced / System — technical tooling, super-admin only ──
  // In-office sessions is operator-facing (counselor flow) but we keep it
  // out of the dad-default nav for now; it's still reachable directly from
  // /admin (sessions card) and from the detailed overview.
  { href: '/admin/sessions', label: 'In-office sessions', group: 'advanced', Icon: Sparkles, requiresSuperAdminContext: true },
  // Student-list "Tools" surfaces — distinct from the main /admin/members
  // table (different queries / data shape). Demoted from the Students group
  // so the everyday operator sees one student list, not five. Both pages
  // remain reachable via these entries and via chip links on /admin/members.
  { href: '/admin/pipeline', label: 'Applications funnel', group: 'advanced', Icon: GitBranch, requiresSuperAdminContext: true },
  { href: '/admin/members/duplicates', label: 'Find duplicate students', group: 'advanced', Icon: AlertTriangle, requiresSuperAdminContext: true },
  { href: '/admin/users', label: 'Users', group: 'advanced', Icon: User, requiresSuperAdminContext: true },
  { href: '/admin/exports', label: 'Exports', group: 'advanced', Icon: Download, requiresSuperAdminContext: true },
  { href: '/admin/coursera', label: 'Coursera', group: 'advanced', Icon: Library, requiresSuperAdminContext: true },
  { href: '/admin/metrics', label: 'Metrics', group: 'advanced', Icon: LineChart, requiresSuperAdminContext: true },
  { href: '/admin/weekly-recap', label: 'Weekly recap', group: 'advanced', Icon: BarChart3, requiresSuperAdminContext: true },
  { href: '/admin/ai-tools', label: 'AI tools', group: 'advanced', Icon: Sparkles, requiresSuperAdminContext: true },
  { href: '/admin/analytics/ai-efficacy', label: 'AI Efficacy', group: 'advanced', Icon: Target, requiresSuperAdminContext: true },
  { href: '/admin/diagnostics', label: 'Diagnostics', group: 'advanced', Icon: Activity, requiresSuperAdminContext: true },
  { href: '/admin/crons', label: 'Cron Monitor', group: 'advanced', Icon: Timer, requiresSuperAdminContext: true },
  { href: '/admin/health', label: 'System Health', group: 'advanced', Icon: HeartPulse, requiresSuperAdminContext: true },
  { href: '/admin/what-workforceap-does', label: 'What WorkforceAP does', group: 'advanced', Icon: Layers, requiresSuperAdminContext: true },
  { href: '/admin/audit-logs', label: 'Audit logs', group: 'advanced', Icon: Shield, requiresSuperAdminContext: true },
  { href: '/admin/webhook-events', label: 'Webhook events', group: 'advanced', Icon: Activity, requiresSuperAdminContext: true },
  { href: '/admin/email-crons', label: 'Email & Crons', group: 'advanced', Icon: MessageSquare, requiresSuperAdminContext: true },
  { href: '/admin/email-templates', label: 'Email templates', group: 'advanced', Icon: FileText, requiresSuperAdminContext: true },
  { href: '/admin/feedback', label: 'Feedback', group: 'advanced', Icon: MessageSquare, requiresSuperAdminContext: true },
  { href: '/admin/growth', label: 'Growth', group: 'advanced', Icon: TrendingUp, requiresSuperAdminContext: true },
  { href: '/admin/feature-flags', label: 'Feature flags', group: 'advanced', Icon: Flag, requiresSuperAdminContext: true },
  { href: '/admin/agent-inbox', label: 'Agent inbox', group: 'advanced', Icon: ListChecks, requiresSuperAdminContext: true },
  { href: '/admin/data-retention', label: 'Data retention', group: 'advanced', Icon: Shield, requiresSuperAdminContext: true },
  { href: '/admin/csp-report', label: 'CSP reports', group: 'advanced', Icon: Shield, requiresSuperAdminContext: true },
  { href: '/admin/settings', label: 'Settings', group: 'advanced', Icon: Settings, requiresSuperAdminContext: true, tourTarget: 'tour-settings' },
];

export const COUNSELOR_PORTAL_NAV_ITEMS: PortalNavItem[] = [
  // Today is the landing page: one attention list from lib/attention. `/counselor` redirects here.
  { href: '/counselor/today', label: 'Today', group: 'primary', Icon: CalendarCheck, aliases: ['/counselor'] },
  { href: '/counselor/overview', label: 'Overview', group: 'primary', Icon: Home },
  { href: '/counselor/inbox', label: 'Inbox zero', group: 'workflows', Icon: ListChecks },
  { href: '/counselor/sessions', label: 'In-office sessions', group: 'workflows', Icon: Sparkles },
  { href: '/counselor/students', label: 'My members', group: 'workflows', Icon: Users, tourTarget: 'tour-nav-members' },
  { href: '/counselor/lab-reviews', label: 'Lab reviews', group: 'workflows', Icon: ClipboardCheck },
  { href: '/counselor/messages', label: 'Messages', group: 'workflows', Icon: MessageSquare, tourTarget: 'tour-nav-messages' },
  // Every reachable counselor route has a rail row; none is link-only (audit 2026-09-20).
  { href: '/counselor/queue', label: 'Work queue', group: 'workflows', Icon: ListChecks },
  { href: '/counselor/triage', label: 'Triage queue', group: 'workflows', Icon: AlertTriangle },
  { href: '/counselor/at-risk', label: 'At-risk members', group: 'workflows', Icon: AlertTriangle, tourTarget: 'tour-nav-at-risk' },
  { href: '/counselor/inactive-members', label: 'Inactive members', group: 'workflows', Icon: Users },
  { href: '/counselor/placements', label: 'Placements', group: 'outcomes', Icon: Briefcase },
  { href: '/counselor/notifications', label: 'Notifications', group: 'manage', Icon: Bell, badgeKey: 'counselor_notifications_unread' },
  { href: '/counselor/profile', label: 'My profile', group: 'manage', Icon: User },
  { href: '/counselor/resources', label: 'Resources', group: 'manage', Icon: BookOpen },
  { href: '/counselor/guide', label: 'Portal guide', group: 'manage', Icon: HelpCircle },
];

export const PORTAL_NAV: Record<PortalRole, PortalNavItem[]> = {
  member: MEMBER_PORTAL_NAV_ITEMS,
  employer: EMPLOYER_PORTAL_NAV_ITEMS,
  partner: PARTNER_PORTAL_NAV_ITEMS,
  group: GROUP_PORTAL_NAV_ITEMS,
  admin: ADMIN_PORTAL_NAV_ITEMS,
  counselor: COUNSELOR_PORTAL_NAV_ITEMS,
};

export function navItemsForActiveRoute(items: PortalNavItem[]): { href: string; aliases?: string[] }[] {
  return items.map(({ href, aliases }) => ({ href, aliases }));
}

/** Given a pathname, determine which tab is active. Falls back to 'journey'. */
export function getActiveTab(pathname: string, items: PortalNavItem[]): NavTab {
  // Find the most specific matching item
  let best: PortalNavItem | undefined;
  let bestLen = 0;
  for (const item of items) {
    if (!item.tab) continue;
    const candidates = [item.href, ...(item.aliases ?? [])];
    for (const c of candidates) {
      if ((pathname === c || pathname.startsWith(c + '/')) && c.length > bestLen) {
        best = item;
        bestLen = c.length;
      }
    }
  }
  return best?.tab ?? 'journey';
}

export function badgeTotalForItem(
  counts: Partial<Record<NavBadgeKey, number>>,
  item: PortalNavItem
): number {
  if (item.badgeKeys?.length) {
    return item.badgeKeys.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  }
  if (item.badgeKey) return counts[item.badgeKey] ?? 0;
  return 0;
}
