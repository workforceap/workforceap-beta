import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import { MemberJobsBoard } from '@/components/portal/kit/pages/member/MemberJobsBoard';
import { MemberJobsKit } from '@/components/portal/kit/pages/member/MemberJobsKit';
import { MemberJobDetail } from '@/components/portal/kit/pages/member/MemberJobDetail';
import JobsListingClient from '@/app/(portal)/dashboard/jobs/JobsListingClient';
import MobileApplyFunnel from '@/app/(portal)/dashboard/jobs/[id]/MobileApplyFunnel';
import JobTailorPanel from '@/components/portal/JobTailorPanel';
import ReferralCopyButton from '@/app/(portal)/dashboard/jobs/[id]/ReferralCopyButton';
import { formatJobSalaryRange } from '@/lib/jobs/formatSalary';

/**
 * Storybook-lite showcase — MemberJobsKit (populated pipeline + recommendations).
 * Preview-only, no auth/DB. See app/dev/dashboard/page.tsx for the pattern.
 * Empty-state variant: app/dev/member/jobs-empty/page.tsx.
 *   /dev/member/jobs               — tracked pipeline
 *   /dev/member/jobs?state=board   — open-roles board (PageOpener + kit rows)
 *   /dev/member/jobs?state=board-empty — board kit empty inventory (honest next steps)
 *   /dev/member/jobs?state=listing — live JobsListingClient on kit JobListingRow
 *   /dev/member/jobs?state=listing-empty — listing client with empty inventory
 *   /dev/member/jobs?state=detail  — live job detail chrome (PageOpener + kit cards + tailor)
 */
export const dynamic = 'force-dynamic';

const LISTING_JOBS = [
  {
    id: 'j1',
    title: 'Cloud Support Engineer',
    location: 'Austin, TX',
    locationType: 'onsite',
    jobType: 'fulltime',
    salaryMin: 58000,
    salaryMax: 72000,
    employer: { companyName: 'Deloitte', logoUrl: null },
    programSlugs: ['aws-cloud-technology-amazon'],
  },
  {
    id: 'j2',
    title: 'Junior Salesforce Consultant',
    location: 'Remote',
    locationType: 'remote',
    jobType: 'fulltime',
    salaryMin: 54000,
    salaryMax: 66000,
    employer: { companyName: 'Accenture', logoUrl: null },
    programSlugs: ['it-automation-with-python-google'],
  },
  {
    id: 'j3',
    title: 'Technical Support Associate',
    location: 'Austin, TX',
    locationType: 'onsite',
    jobType: 'fulltime',
    salaryMin: 46000,
    salaryMax: 52000,
    employer: { companyName: 'Tesla', logoUrl: null },
    programSlugs: ['comptia-a-professional-certificate'],
  },
  {
    id: 'j4',
    title: 'IT Support Specialist',
    location: 'Austin, TX',
    locationType: 'hybrid',
    jobType: 'fulltime',
    salaryMin: 48000,
    salaryMax: 55000,
    employer: { companyName: 'HEB', logoUrl: null },
    programSlugs: ['comptia-a-professional-certificate'],
  },
];

async function DevMemberJobsScreen({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; job?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { state, job: jobId } = await searchParams;
  if (state === 'board') {
    return (
      <MemberJobsBoard
        pipelineHref="/dev/member/jobs"
        jobs={[
          { id: 'j1', title: 'Cloud Support Engineer', company: 'Deloitte', location: 'Austin, TX', meta: 'Full-time · $58k–72k', match: '92% match', applied: true, href: '/dev/member/jobs?state=detail&job=j1' },
          { id: 'j2', title: 'Junior Salesforce Consultant', company: 'Accenture', location: 'Remote', meta: 'Full-time · $54k–66k', match: '87% match', href: '/dev/member/jobs?state=detail&job=j2' },
          { id: 'j3', title: 'Technical Support Associate', company: 'Tesla', location: 'Austin, TX', meta: 'Full-time · $46k–52k', match: '74% match', href: '/dev/member/jobs?state=detail&job=j3' },
          { id: 'j4', title: 'IT Support Specialist', company: 'HEB', location: 'Austin, TX', meta: 'Full-time · $48k–55k', href: '/dev/member/jobs?state=detail&job=j4' },
        ]}
      />
    );
  }
  if (state === 'board-empty') {
    return (
      <MemberJobsBoard
        pipelineHref="/dev/member/jobs"
        profileHref="/dev/member/profile"
        messagesHref="/dev/member/messages"
        jobs={[]}
      />
    );
  }
  if (state === 'listing') {
    return (
      <DesignSurface surface="warm">
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
          <PageOpener
            kicker="Job search"
            title="Open roles"
            lede="Hiring-partner openings. Track applications from the pipeline."
            icon={<Briefcase size={13} aria-hidden="true" />}
          />
          <JobsListingClient
            preview
            isAuthenticated
            initialJobs={LISTING_JOBS}
            initialTotal={LISTING_JOBS.length}
            appliedJobIds={['j1']}
            initialSavedJobIds={['j2']}
            initialMatchedJobs={[
              { id: 'j1', title: 'Cloud Support Engineer', company: 'Deloitte', location: 'Austin, TX', locationType: 'onsite', matchPct: 92 },
              { id: 'j2', title: 'Junior Salesforce Consultant', company: 'Accenture', location: 'Remote', locationType: 'remote', matchPct: 87 },
              { id: 'j3', title: 'Technical Support Associate', company: 'Tesla', location: 'Austin, TX', locationType: 'onsite', matchPct: 74 },
            ]}
          />
        </div>
      </DesignSurface>
    );
  }
  if (state === 'listing-empty') {
    return (
      <DesignSurface surface="warm">
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
          <PageOpener
            kicker="Job search"
            title="Open roles"
            lede="Hiring-partner openings. Track applications from the pipeline."
            icon={<Briefcase size={13} aria-hidden="true" />}
          />
          <JobsListingClient preview isAuthenticated initialJobs={[]} initialTotal={0} />
        </div>
      </DesignSurface>
    );
  }
  if (state === 'detail') {
    const job = LISTING_JOBS.find((item) => item.id === jobId) ?? LISTING_JOBS[0];
    const company = job.employer.companyName;
    const referralMessage = `Hi! I'm interested in the ${job.title} role at ${company} and thought of you since you work there.\nI'd appreciate any insight about the team or the application process.\nThanks — Jordan (sample member)`;
    return (
      <MemberJobDetail
        title={job.title}
        company={company}
        location={job.location}
        jobType="Full-time"
        salary={formatJobSalaryRange(job.salaryMin, job.salaryMax)}
        description={`Sample ${job.title} opening at ${company}. Work with an experienced team to solve customer problems, document clear next steps and build practical skills.\n\nThis synthetic posting lets you review the application layout and consent flow.`}
        requirements={[
          'Google IT Support or CompTIA A+ (or equivalent hands-on troubleshooting)',
          'Clear written English for tickets and runbooks',
          job.locationType === 'remote' ? 'Availability for a remote team schedule' : 'Availability to work with the Austin team',
        ]}
        backHref="/dev/member/jobs?state=listing"
        screening={{
          packTitle: 'Cloud support screen',
          employerLabel: company,
          questions: [
            { id: 'q1', prompt: 'Walk through how you would triage a user who cannot connect to VPN.', type: 'scenario' },
            { id: 'q2', prompt: 'Which ticket fields do you fill in before escalating?', type: 'short_answer' },
          ],
        }}
        referral={{
          company,
          message: referralMessage,
          copySlot: <ReferralCopyButton text={referralMessage} />,
        }}
        preparationSlot={<JobTailorPanel jobId={job.id} preview />}
        applySlot={
            <MobileApplyFunnel
              preview
              jobId={job.id}
              authenticated
              jobTitle={job.title}
              employerName={company}
              salaryLine={formatJobSalaryRange(job.salaryMin, job.salaryMax)}
              location={job.location}
              jobType="Full-time"
            />
        }
      />
    );
  }

  return (
    <MemberJobsKit
      saved={9}
      applied={4}
      interviewing={2}
      offers={1}
      syncedLabel="6 sample applications"
      browseHref="/dev/member/jobs?state=listing"
      profileHref="/dev/member/profile"
      messagesHref="/dev/member/messages"
      retryHref="/dev/member/jobs"
      pipelineLoadFailed={state === 'error'}
      openRolesLoadFailed={state === 'error'}
      recommendationsLoadFailed={state === 'error'}
      jobHref={(id) => `/dev/member/jobs?state=detail&job=${id}`}
      openRoles={LISTING_JOBS.map((job) => ({ id: job.id, title: job.title, meta: `${job.employer.companyName} · ${job.location} · ${formatJobSalaryRange(job.salaryMin, job.salaryMax)}`, applied: job.id === 'j1' }))}
      applications={[
        { id: 'a1', role: 'Salesforce Administrator', company: 'Deloitte', location: 'Austin, TX', applied: 'Jun 12', stage: 'Interviewing', tone: 'warn' },
        { id: 'a2', role: 'Agentforce Solutions Engineer', company: 'Accenture', location: 'Remote', applied: 'Jun 14', stage: 'Applied', tone: 'muted' },
        { id: 'a3', role: 'Cloud Support Associate', company: 'Indeed', location: 'Austin, TX', applied: 'Jun 16', stage: 'Screening', tone: 'info' },
        { id: 'a4', role: 'Junior Cloud Engineer', company: 'Oracle', location: 'Austin, TX', applied: 'Jun 18', stage: 'Applied', tone: 'muted' },
        { id: 'a5', role: 'IT Support Specialist', company: 'Tesla', location: 'Austin, TX', applied: 'Jun 21', stage: 'Offer', tone: 'ok' },
        { id: 'a6', role: 'Business Systems Analyst', company: 'HEB', location: 'Austin, TX', applied: 'Jun 9', stage: 'Closed', tone: 'alert' },
      ]}
      recommended={[
        { id: 'j1', logo: 'DL', match: '92% match', title: 'Cloud Support Engineer', meta: 'Deloitte · Austin, TX · $58k–72k' },
        { id: 'j2', logo: 'AC', match: '87% match', title: 'Junior Salesforce Consultant', meta: 'Accenture · Remote · $54k–66k' },
        { id: 'j3', logo: 'TS', match: '74% match', title: 'Technical Support Associate', meta: 'Tesla · Austin, TX · $46k–52k' },
      ]}
    />
  );
}

export default async function DevMemberJobsPage({ searchParams }: { searchParams: Promise<{ state?: string; job?: string }> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = await searchParams;
  const states = [
    ['', 'Overview'], ['listing', 'Search & save'], ['detail', 'Apply flow'],
    ['board', 'Board & outside application'], ['board-empty', 'Empty board'],
    ['listing-empty', 'Empty search'], ['error', 'Load error'],
  ];
  return (
    <>
      <aside aria-label="Job board preview scenarios" style={{ padding: 'var(--wa-pad-sm)', borderBottom: '1px solid var(--wa-border)' }}>
        <p className="wa-kit-meta" style={{ margin: 0 }}>Synthetic jobs. Nothing is sent or saved; reload resets changes.</p>
        <details>
          <summary className="wa-kit-focus" style={{ minHeight: 44, alignContent: 'center', cursor: 'pointer', fontSize: 'var(--wa-type-meta)', fontWeight: 700 }}>Job scenarios · {states.length} states</summary>
          <nav aria-label="Job board scenarios" className="wa-flex wa-flex-wrap wa-gap-2">
            {states.map(([state, label]) => <Link key={state} href={`/dev/member/jobs${state ? `?state=${state}` : ''}`} aria-current={(params.state ?? '') === state ? 'page' : undefined} className="wa-page-action wa-kit-focus" style={{ minHeight: 44 }}>{label}</Link>)}
          </nav>
        </details>
      </aside>
      {await DevMemberJobsScreen({ searchParams: Promise.resolve(params) })}
    </>
  );
}
