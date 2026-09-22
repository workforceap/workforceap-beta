import { notFound } from 'next/navigation';
import EmployerJobsBoard, { type EmployerJobBoardItem } from '@/components/employer/EmployerJobsBoard';
import { jobPostingStatusLabel } from '@/lib/status/jobPostingStatusVocabulary';

/**
 * Storybook-lite showcase — the employer "My Jobs" board in the Command
 * Center visual language (mixed statuses, applicant counts, readiness
 * cues). Preview-only, no auth/DB. See app/dev/staff/jobs-board/page.tsx
 * for the admin-side sibling of this pattern.
 */
export const dynamic = 'force-dynamic';

const NOW = new Date('2026-07-04T12:00:00Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

const JOBS: EmployerJobBoardItem[] = [
  {
    id: 'sf-admin',
    title: 'Salesforce Administrator',
    location: 'Austin, TX',
    salaryMin: 72000,
    salaryMax: 88000,
    locationType: 'hybrid',
    jobType: 'fulltime',
    descriptionPreview: 'Own our Salesforce org: user support, flows, dashboards, and integrations with our support desk.',
    descriptionLength: 420,
    requirementsCount: 5,
    suggestedProgramsCount: 2,
    status: 'live',
    statusLabel: jobPostingStatusLabel('live', 'employer'),
    applicationsCount: 14,
    updatedAt: daysAgo(1),
    readinessLevel: 'solid',
    readinessIssues: [],
  },
  {
    id: 'it-support',
    title: 'IT Support Specialist',
    location: 'Round Rock, TX',
    salaryMin: 58000,
    salaryMax: 70000,
    locationType: 'onsite',
    jobType: 'fulltime',
    descriptionPreview: 'Tier 1/2 support for a 400-person office: hardware, SSO, ticket triage, and onboarding new hires.',
    descriptionLength: 310,
    requirementsCount: 4,
    suggestedProgramsCount: 1,
    status: 'live',
    statusLabel: jobPostingStatusLabel('live', 'employer'),
    applicationsCount: 9,
    updatedAt: daysAgo(3),
    readinessLevel: 'solid',
    readinessIssues: [],
  },
  {
    id: 'biz-analyst',
    title: 'Business Systems Analyst',
    location: 'Remote',
    salaryMin: 65000,
    salaryMax: 82000,
    locationType: 'remote',
    jobType: 'fulltime',
    descriptionPreview: 'Bridge finance and engineering: gather requirements, document workflows, and ship small automations.',
    descriptionLength: 260,
    requirementsCount: 3,
    suggestedProgramsCount: 1,
    status: 'approved',
    statusLabel: jobPostingStatusLabel('approved', 'employer'),
    applicationsCount: 2,
    updatedAt: daysAgo(2),
    readinessLevel: 'solid',
    readinessIssues: [],
  },
  {
    id: 'med-assistant',
    title: 'Medical Assistant',
    location: 'Austin, TX',
    salaryMin: 44000,
    salaryMax: 52000,
    locationType: 'onsite',
    jobType: 'fulltime',
    descriptionPreview: 'Support two family-practice physicians: vitals, charting, and patient scheduling.',
    descriptionLength: 190,
    requirementsCount: 3,
    suggestedProgramsCount: 1,
    status: 'pending',
    statusLabel: jobPostingStatusLabel('pending', 'employer'),
    applicationsCount: 0,
    updatedAt: daysAgo(1),
    readinessLevel: 'solid',
    readinessIssues: [],
  },
  {
    id: 'warehouse-assoc',
    title: 'Warehouse Associate',
    location: 'Pflugerville, TX',
    salaryMin: null,
    salaryMax: null,
    locationType: 'onsite',
    jobType: 'fulltime',
    descriptionPreview: '',
    descriptionLength: 0,
    requirementsCount: 0,
    suggestedProgramsCount: 0,
    status: 'draft',
    statusLabel: jobPostingStatusLabel('draft', 'employer'),
    applicationsCount: 0,
    updatedAt: daysAgo(6),
    readinessLevel: 'thin',
    readinessIssues: [
      { key: 'salary', target: 'salary', message: 'Add a pay range so candidates can gauge fit.', action: 'Add pay range' },
      { key: 'description', target: 'description', message: 'Description is empty — add a few sentences.', action: 'Write description' },
    ],
  },
  {
    id: 'agentforce-eng',
    title: 'Agentforce Solutions Engineer',
    location: 'Remote',
    salaryMin: 74000,
    salaryMax: 92000,
    locationType: 'remote',
    jobType: 'fulltime',
    descriptionPreview: 'Design and ship AI agent workflows for enterprise clients on top of Salesforce Agentforce.',
    descriptionLength: 380,
    requirementsCount: 4,
    suggestedProgramsCount: 2,
    status: 'draft',
    statusLabel: jobPostingStatusLabel('draft', 'employer'),
    applicationsCount: 0,
    updatedAt: daysAgo(4),
    readinessLevel: 'usable',
    readinessIssues: [
      { key: 'requirements', target: 'requirements', message: 'Add 1–2 more must-have requirements.', action: 'Add requirements' },
    ],
  },
  {
    id: 'facilities-coord',
    title: 'Facilities Coordinator',
    location: 'Austin, TX',
    salaryMin: 42000,
    salaryMax: 48000,
    locationType: 'onsite',
    jobType: 'fulltime',
    descriptionPreview: 'Coordinate vendor visits, manage the facilities ticket queue, and track building maintenance.',
    descriptionLength: 220,
    requirementsCount: 2,
    suggestedProgramsCount: 0,
    status: 'filled',
    statusLabel: jobPostingStatusLabel('filled', 'employer'),
    applicationsCount: 11,
    updatedAt: daysAgo(20),
    readinessLevel: 'solid',
    readinessIssues: [],
  },
  {
    id: 'field-tech',
    title: 'Field Service Technician',
    location: 'Austin, TX',
    salaryMin: 50000,
    salaryMax: 60000,
    locationType: 'onsite',
    jobType: 'fulltime',
    descriptionPreview: 'Install and service on-site equipment across the greater Austin metro; company vehicle provided.',
    descriptionLength: 300,
    requirementsCount: 4,
    suggestedProgramsCount: 1,
    status: 'expired',
    statusLabel: jobPostingStatusLabel('expired', 'employer'),
    applicationsCount: 6,
    updatedAt: daysAgo(45),
    readinessLevel: 'solid',
    readinessIssues: [],
  },
];

const TITLE_BY_ID: Record<string, string> = Object.fromEntries(JOBS.map((j) => [j.id, j.title]));

export default function DevEmployerJobsBoardPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <EmployerJobsBoard
      jobs={JOBS}
      filter="all"
      page={1}
      pageSize={20}
      totalInFilter={JOBS.length}
      totalInDb={JOBS.length}
      deletableInFilter={JOBS.filter((j) => ['draft', 'pending', 'filled', 'closed'].includes(j.status)).map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
      }))}
      closableInFilter={JOBS.filter((j) => ['live', 'approved'].includes(j.status)).map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
      }))}
      titleByIdInFilter={TITLE_BY_ID}
    />
  );
}
