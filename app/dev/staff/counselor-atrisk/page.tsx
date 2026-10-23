import { notFound } from 'next/navigation';
import type { AtRiskMember } from '@/components/portal/counselor/AtRiskDashboard';
import AtRiskShowcaseClient from './AtRiskShowcaseClient';
import CounselorWorkspace from '@/components/portal/counselor/CounselorWorkspace';

/**
 * Storybook-lite showcase — AtRiskDashboard "Command Center" redesign
 * (fully populated, no auth/DB). See app/dev/staff/counselor-command/page.tsx
 * for the pattern this mirrors.
 */
export const dynamic = 'force-dynamic';

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

const MOCK_MEMBERS: AtRiskMember[] = [
  {
    userId: 'u1',
    alertId: 'a1',
    name: 'Destiny Ford',
    email: 'destiny.ford@example.com',
    phone: '(512) 555-0142',
    score: 86,
    riskLevel: 'CRITICAL',
    status: 'open',
    factors: [
      { name: 'no_login', weight: 40, description: 'No login in 14 days' },
      { name: 'sla_breach', weight: 30, description: 'Counselor reply overdue 61h' },
      { name: 'stale_training', weight: 16, description: 'No course progress in 3 weeks' },
    ],
    enrolledProgram: 'Cloud & IT',
    enrolledAt: daysAgo(60),
    memberSince: daysAgo(120),
    profile: { employmentStatus: 'unemployed', educationLevel: 'some_college' },
    alertCreatedAt: daysAgo(2),
    alertUpdatedAt: daysAgo(2),
    lastActivityAt: daysAgo(14),
  },
  {
    userId: 'u2',
    alertId: 'a2',
    name: 'Marcus DeLeon',
    email: 'marcus.deleon@example.com',
    phone: '(737) 555-0187',
    score: 78,
    riskLevel: 'CRITICAL',
    status: 'acknowledged',
    factors: [
      { name: 'sla_breach', weight: 35, description: 'Counselor reply overdue 72h+' },
      { name: 'no_login', weight: 28, description: 'No login in 11 days' },
    ],
    enrolledProgram: 'Data & AI',
    enrolledAt: daysAgo(45),
    memberSince: daysAgo(90),
    profile: { employmentStatus: 'part_time', educationLevel: 'hs_diploma' },
    alertCreatedAt: daysAgo(4),
    alertUpdatedAt: daysAgo(1),
    lastActivityAt: daysAgo(11),
  },
  {
    userId: 'u3',
    alertId: 'a3',
    name: 'Hoang Tran',
    email: 'hoang.tran@example.com',
    phone: null,
    score: 58,
    riskLevel: 'HIGH',
    status: 'open',
    factors: [
      { name: 'sla_warning', weight: 20, description: 'Counselor reply overdue 27h' },
      { name: 'stale_training', weight: 18, description: 'Training stalled 9 days' },
    ],
    enrolledProgram: 'Skilled Trades',
    enrolledAt: daysAgo(30),
    memberSince: daysAgo(75),
    profile: { employmentStatus: 'unemployed', educationLevel: 'hs_diploma' },
    alertCreatedAt: daysAgo(1),
    alertUpdatedAt: daysAgo(1),
    lastActivityAt: daysAgo(9),
  },
  {
    userId: 'u4',
    alertId: 'a4',
    name: 'Sofia Reyes-Martinez',
    email: 'sofia.reyes@example.com',
    phone: '(512) 555-0199',
    score: 52,
    riskLevel: 'HIGH',
    status: 'escalated',
    factors: [
      { name: 'computer_support', weight: 22, description: 'Needs computer support follow-up' },
      { name: 'stale_training', weight: 15, description: 'No course progress in 6 days' },
    ],
    enrolledProgram: 'Cloud & IT',
    enrolledAt: daysAgo(70),
    memberSince: daysAgo(140),
    profile: { employmentStatus: 'unemployed', educationLevel: 'associate_degree' },
    alertCreatedAt: daysAgo(6),
    alertUpdatedAt: daysAgo(3),
    lastActivityAt: daysAgo(6),
  },
  {
    userId: 'u5',
    alertId: 'a5',
    name: 'Priya Natarajan',
    email: 'priya.natarajan@example.com',
    phone: '(469) 555-0164',
    score: 34,
    riskLevel: 'MEDIUM',
    status: 'resolved',
    factors: [{ name: 'stale_training', weight: 12, description: 'No course progress in 4 days' }],
    enrolledProgram: 'Data & AI',
    enrolledAt: daysAgo(20),
    memberSince: daysAgo(50),
    profile: { employmentStatus: 'part_time', educationLevel: 'bachelor_degree' },
    alertCreatedAt: daysAgo(8),
    alertUpdatedAt: daysAgo(1),
    lastActivityAt: daysAgo(4),
  },
];

export default function DevStaffCounselorAtRiskPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <CounselorWorkspace view="attention" filter="at-risk" baseHref="/dev/staff/counselor-workspace">
      <AtRiskShowcaseClient initialMembers={MOCK_MEMBERS} />
    </CounselorWorkspace>
  );
}
