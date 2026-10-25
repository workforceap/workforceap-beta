import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  EmployerHomeKit,
  type EmployerCandidateRow,
  type EmployerOpenRoleItem,
} from '@/components/portal/kit/pages/employer/EmployerHomeKit';

/**
 * Storybook-lite showcase — EmployerHomeKit "Command Center" (fully
 * populated: open roles, pipeline volume, fit-scored candidate table with
 * stage trackers, the open-roles queue, and the community-impact banner).
 * Preview-only, no auth/DB. See app/dev/member/home/page.tsx for the pattern.
 */
export const dynamic = 'force-dynamic';

const CANDIDATES: EmployerCandidateRow[] = [
  { id: 'c1', name: 'Maria Gonzalez', role: 'Salesforce Administrator', fitScore: 94, status: 'interview', appliedLabel: 'Jun 18', href: '#' },
  { id: 'c2', name: 'Devon Walker', role: 'Cloud Support Associate', fitScore: 88, status: 'offered', appliedLabel: 'Jun 20', href: '#' },
  { id: 'c3', name: 'Priya Natarajan', role: 'Agentforce Solutions Engineer', fitScore: 81, status: 'reviewing', appliedLabel: 'Jun 24', href: '#' },
  { id: 'c4', name: 'Ethan Brooks', role: 'IT Support Specialist', fitScore: 76, status: 'reviewing', appliedLabel: 'Jun 27', href: '#' },
  { id: 'c5', name: 'Alicia Fontaine', role: 'Business Systems Analyst', fitScore: 69, status: 'applied', appliedLabel: 'Jun 29', href: '#' },
  { id: 'c6', name: 'Marcus Reed', role: 'Junior Cloud Engineer', status: 'applied', appliedLabel: 'Jul 1', href: '#' },
  { id: 'c7', name: 'Sofia Ibrahim', role: 'Salesforce Administrator', fitScore: 91, status: 'hired', appliedLabel: 'Jun 10', href: '#' },
];

const OPEN_ROLES: EmployerOpenRoleItem[] = [
  { id: 'r1', title: 'Salesforce Administrator', applicants: 14, location: 'Austin, TX', href: '#' },
  { id: 'r2', title: 'Cloud Support Associate', applicants: 9, location: 'Remote', href: '#' },
  { id: 'r3', title: 'Agentforce Solutions Engineer', applicants: 7, location: 'Austin, TX', href: '#' },
  { id: 'r4', title: 'IT Support Specialist', applicants: 3, location: 'Austin, TX', href: '#' },
  { id: 'r5', title: 'Business Systems Analyst', applicants: 1, location: 'Remote', href: '#' },
];

export default async function DevEmployerCommandPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const commonT = await getTranslations('common.disclosures');

  return (
    <EmployerHomeKit
      firstName="Jordan"
      companyName="Deloitte"
      openRoles={5}
      openRolesSpark={{ series: [3, 3, 4, 4, 4, 5, 5], delta: '2', direction: 'up' }}
      inPipeline={34}
      pipelineSpark={{ series: [18, 21, 24, 27, 29, 31, 34], delta: '16', direction: 'up' }}
      interviews={6}
      interviewsSpark={{ series: [1, 2, 2, 3, 4, 5, 6], delta: '5', direction: 'up' }}
      hires={3}
      hiresSpark={{ series: [0, 0, 1, 1, 2, 2, 3], delta: '3', direction: 'up' }}
      candidates={CANDIDATES}
      openRolesList={OPEN_ROLES}
      postRoleHref="#"
      jobsHref="#"
      pipelineHref="#"
      givebackHref="#"
      whereItGoesLabel={commonT('whereItGoes')}
    />
  );
}
