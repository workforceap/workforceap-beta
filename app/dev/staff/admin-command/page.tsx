import { notFound } from 'next/navigation';
import { Briefcase, TriangleAlert, Award, UserPlus, Bell } from 'lucide-react';
import {
  CommandCenterKit,
  type CommandCenterKpiItem,
  type CommandCenterQueueItem,
  type CommandCenterSystemHealthRow,
  type CommandCenterMemberRow,
  type ProgramHealthDatum,
} from '@/components/portal/kit/pages/admin/CommandCenterKit';
import type { ChartDatum } from '@/components/portal/kit';

/**
 * Showcase-only render of the elevated admin Command Center with inline mock
 * data exercising every new optional prop (sparkline KPIs, placements-trend
 * area chart, severity-coded queue, system health incl. one "warn" row, and
 * the members roster) — no auth/DB, so screenshot tooling can photograph the
 * kit component directly. See app/dev/staff/crons-monitor/page.tsx for the pattern.
 */
export const dynamic = 'force-dynamic';

const KPIS: CommandCenterKpiItem[] = [
  {
    label: 'Active Students',
    value: 847,
    iconKey: 'students',
    spark: { series: [790, 805, 812, 820, 831, 840, 847], delta: '32 this month', direction: 'up' },
  },
  {
    label: 'Placements YTD',
    value: 213,
    iconKey: 'placements',
    spark: { series: [38, 46, 55, 62, 78, 90, 101], delta: '18 this month', direction: 'up' },
  },
  {
    label: 'Completion Rate',
    value: '71%',
    iconKey: 'completion',
    spark: { series: [64, 65, 67, 68, 69, 70, 71], delta: 'cohort avg', direction: 'up' },
  },
  {
    label: 'Job-Ready Now',
    value: 64,
    iconKey: 'ready',
    delta: 'ready to place',
    deltaTone: 'muted',
  },
  {
    label: 'At Risk',
    value: 19,
    iconKey: 'risk',
    spark: { series: [12, 14, 15, 17, 18, 20, 19], delta: '19 need outreach', direction: 'down' },
  },
];

const QUEUE_ITEMS: CommandCenterQueueItem[] = [
  {
    id: 'inactive',
    icon: <TriangleAlert size={14} aria-hidden />,
    iconColor: 'var(--wa-accent)',
    title: '5 students inactive 14+ days',
    detail: 'Cloud & IT cohort · likely to drop',
    actionLabel: 'Assign outreach',
    urgent: true,
    tone: 'red',
    count: 5,
    href: '/admin/command-center?ui=legacy',
  },
  {
    id: 'certifications',
    icon: <Award size={14} aria-hidden />,
    iconColor: 'var(--wa-gold)',
    title: '12 certifications awaiting approval',
    detail: 'Verify proof to count toward outcomes',
    actionLabel: 'Review',
    tone: 'yellow',
    count: 12,
    href: '/admin/certifications',
  },
  {
    id: 'applicants',
    icon: <UserPlus size={14} aria-hidden />,
    iconColor: 'var(--wa-info)',
    title: '8 new applicants need eligibility review',
    detail: 'WIOA screening pending',
    actionLabel: 'Open queue',
    tone: 'blue',
    count: 8,
    href: '/admin/command-center?ui=legacy',
  },
  {
    id: 'needs-reply',
    icon: <Bell size={14} aria-hidden />,
    iconColor: 'var(--wa-info)',
    title: '6 messages awaiting your reply',
    detail: 'Members are waiting on a response',
    actionLabel: 'Open inbox',
    tone: 'blue',
    count: 6,
    href: '/admin/messages',
  },
  {
    id: 'placements',
    icon: <Briefcase size={14} aria-hidden />,
    iconColor: 'var(--wa-success)',
    title: '3 placements to confirm',
    detail: 'Employers reported hires',
    actionLabel: 'Confirm',
    tone: 'blue',
    count: 3,
    href: '/admin/placements',
  },
];

const PROGRAM_HEALTH: ProgramHealthDatum[] = [
  { label: 'Cloud & IT', value: '312 · 74%', pct: 74, color: 'success' },
  { label: 'Data & AI', value: '198 · 68%', pct: 68, color: 'success' },
  { label: 'Healthcare', value: '156 · 81%', pct: 81, color: 'success' },
  { label: 'Skilled Trades', value: '81 · 52%', pct: 52, color: 'accent' },
  { label: 'Manufacturing', value: '100 · 70%', pct: 70, color: 'success' },
];

const PLACEMENTS_BY_MONTH: ChartDatum[] = [
  { label: 'Jan', value: 38 },
  { label: 'Feb', value: 46 },
  { label: 'Mar', value: 55 },
  { label: 'Apr', value: 62 },
  { label: 'May', value: 78 },
  { label: 'Jun', value: 90 },
  { label: 'Jul', value: 101 },
];

const SYSTEM_HEALTH: CommandCenterSystemHealthRow[] = [
  { name: 'Coursera sync', status: 'ok', meta: 'Nightly at 2:00 AM' },
  { name: 'At-risk scoring', status: 'ok', meta: 'Recomputes hourly' },
  { name: 'Notifications', status: 'ok', meta: 'All threads within SLA' },
  { name: 'Webhook retry', status: 'warn', meta: '3 errors (7d)' },
  { name: 'Payouts', status: 'ok', meta: 'No automated signal yet' },
];

const MEMBERS: CommandCenterMemberRow[] = [
  { id: 'm1', name: 'Jasmine Okafor', program: 'Cloud & IT', progress: 92, status: 'On track', statusTone: 'ok', lastActive: '2h ago' },
  { id: 'm2', name: 'Diego Villareal', program: 'Skilled Trades', progress: 41, status: 'At risk', statusTone: 'alert', lastActive: '16d ago' },
  { id: 'm3', name: "Grace O'Sullivan", program: 'Healthcare', progress: 78, status: 'On track', statusTone: 'ok', lastActive: '1d ago' },
  { id: 'm4', name: 'Tobias Nwosu', program: 'Manufacturing', progress: 55, status: 'Needs reply', statusTone: 'warn', lastActive: '4h ago' },
  { id: 'm5', name: 'Linh Pham', program: 'Data & AI', progress: 88, status: 'Interviewing', statusTone: 'info', lastActive: '30m ago' },
];

export default function DevStaffAdminCommandPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <CommandCenterKit
      dateLabel="Tue, Jun 21 · 9:42 AM"
      kpis={KPIS}
      queueItems={QUEUE_ITEMS}
      programHealth={PROGRAM_HEALTH}
      placementsByMonth={PLACEMENTS_BY_MONTH}
      placementsSubtitle="2026 YTD · 213 total"
      addStudentHref="/admin/members/new"
      systemHealth={SYSTEM_HEALTH}
      members={MEMBERS}
    />
  );
}
