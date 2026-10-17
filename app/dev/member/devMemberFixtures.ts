import type { KitTone } from '@/components/portal/kit';

type ApplicationTone = Extract<KitTone, 'warn' | 'muted' | 'info'>;

/** Shared example employers for Home + Job board proofs. No real company names. */
export const DEV_MEMBER_FIRST_NAME = 'Alex';
export const DEV_MEMBER_FULL_NAME = 'Alex Rivera';

export const DEV_ADVISOR = {
  name: 'Dana Reyes',
  firstName: 'Dana',
  messagingHref: '/dev/member/messages',
} as const;

export const DEV_APPLICATIONS = [
  {
    id: 'a1',
    role: 'IT Support Specialist',
    company: 'Lakeview Health System',
    location: 'Remote',
    applied: 'Jun 18',
    stage: 'Interviewing',
    tone: 'warn' as ApplicationTone,
  },
  {
    id: 'a2',
    role: 'Cloud Support Associate',
    company: 'Brightline Credit Union',
    location: 'Austin, TX',
    applied: 'Jun 24',
    stage: 'Screening',
    tone: 'info' as ApplicationTone,
  },
  {
    id: 'a3',
    role: 'Help Desk Technician',
    company: 'Metro Transit Authority',
    location: 'Austin, TX',
    applied: 'Jun 29',
    stage: 'Applied',
    tone: 'muted' as ApplicationTone,
  },
] as const;

export const DEV_HOME_PIPELINE: Array<{
  role: string;
  company: string;
  stage: string;
  tone: ApplicationTone;
  appliedLabel: string;
  stageIndex: number;
  stageTotal: number;
}> = DEV_APPLICATIONS.map((row) => ({
  role: row.role,
  company: row.company,
  stage: row.stage,
  tone: row.tone,
  appliedLabel: row.applied,
  stageIndex: row.tone === 'warn' ? 3 : row.tone === 'info' ? 2 : 1,
  stageTotal: 3,
}));

export const DEV_RECOMMENDED_ROLES = [
  {
    id: 'r1',
    logo: 'BC',
    match: '92% match',
    title: 'Cloud Support Associate',
    meta: 'Brightline Credit Union · Austin, TX · Hybrid',
    skills: ['AWS Cloud Foundations', 'Linux basics', 'Ticket triage'],
  },
  {
    id: 'r2',
    logo: 'LH',
    match: '85% match',
    title: 'IT Support Specialist',
    meta: 'Lakeview Health System · Remote',
    skills: ['Active Directory', 'VPN triage'],
  },
  {
    id: 'r3',
    logo: 'MT',
    match: '81% match',
    title: 'Help Desk Technician',
    meta: 'Metro Transit Authority · Austin, TX · On-site',
    skills: ['ITIL basics', 'Service desk'],
  },
  {
    id: 'r4',
    logo: 'HC',
    match: '88% match',
    title: 'Junior Cloud Engineer',
    meta: 'Harbor City Schools · Austin, TX · On-site',
    skills: ['AWS labs', 'Networking'],
  },
  {
    id: 'r5',
    logo: 'RC',
    match: '79% match',
    title: 'Systems Administrator Trainee',
    meta: 'Riverside County · Austin, TX · Hybrid',
    skills: ['Windows Server', 'IAM'],
  },
  {
    id: 'r6',
    logo: 'NG',
    match: '76% match',
    title: 'Technical Support Analyst',
    meta: 'Northgate Logistics · Austin, TX · Hybrid',
    skills: ['Runbooks', 'Cost Explorer'],
  },
] as const;

/** Remaining live openings — not the same six as the top-matched list. */
export const DEV_REMAINING_OPEN_ROLES = [
  { id: 'r7', title: 'Cloud Operations Assistant', meta: 'Westlake Municipal · Austin, TX · Hybrid', logo: 'WM' },
  { id: 'r8', title: 'Network Support Trainee', meta: 'Hill Country Clinics · Austin, TX · On-site', logo: 'HL' },
  { id: 'r9', title: 'Desktop Support Associate', meta: 'Cedar Ridge ISD · Austin, TX · On-site', logo: 'CR' },
  { id: 'r10', title: 'IT Operations Coordinator', meta: 'Southbank Credit Union · Hybrid', logo: 'SB' },
  { id: 'r11', title: 'Junior Systems Analyst', meta: 'Lakeside Logistics · Austin, TX · Hybrid', logo: 'LL' },
  { id: 'r12', title: 'Service Desk Associate', meta: 'Capitol Health Network · Remote', logo: 'CH' },
] as const;

export const DEV_APPLIED_COUNT = 2;
export const DEV_INTERVIEWING_COUNT = 1;
export const DEV_OPEN_ROLES_TOTAL = DEV_RECOMMENDED_ROLES.length + DEV_REMAINING_OPEN_ROLES.length;
