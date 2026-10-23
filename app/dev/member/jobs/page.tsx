import { notFound } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import { MemberJobsBoard } from '@/components/portal/kit/pages/member/MemberJobsBoard';
import { MemberJobsKit } from '@/components/portal/kit/pages/member/MemberJobsKit';
import { MemberJobDetail } from '@/components/portal/kit/pages/member/MemberJobDetail';
import JobsListingClient from '@/app/(portal)/dashboard/jobs/JobsListingClient';
import MobileApplyFunnel from '@/app/(portal)/dashboard/jobs/[id]/MobileApplyFunnel';
import JobTailorPanel, { JOB_TAILOR_PREVIEW_RESULT } from '@/components/portal/JobTailorPanel';
import {
  DEV_ADVISOR,
  DEV_APPLICATIONS,
  DEV_APPLIED_COUNT,
  DEV_INTERVIEWING_COUNT,
  DEV_OPEN_ROLES_TOTAL,
  DEV_RECOMMENDED_ROLES,
  DEV_REMAINING_OPEN_ROLES,
} from '@/app/dev/member/devMemberFixtures';

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
    employer: { companyName: 'Brightline Credit Union', logoUrl: null },
  },
  {
    id: 'j2',
    title: 'Junior Salesforce Consultant',
    location: 'Remote',
    locationType: 'remote',
    jobType: 'fulltime',
    salaryMin: 54000,
    salaryMax: 66000,
    employer: { companyName: 'Lakeview Health System', logoUrl: null },
  },
  {
    id: 'j3',
    title: 'Technical Support Associate',
    location: 'Austin, TX',
    locationType: 'onsite',
    jobType: 'fulltime',
    salaryMin: 46000,
    salaryMax: 52000,
    employer: { companyName: 'Metro Transit Authority', logoUrl: null },
  },
  {
    id: 'j4',
    title: 'IT Support Specialist',
    location: 'Austin, TX',
    locationType: 'hybrid',
    jobType: 'fulltime',
    salaryMin: 48000,
    salaryMax: 55000,
    employer: { companyName: 'Harbor City Schools', logoUrl: null },
  },
];

export default async function DevMemberJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { state } = await searchParams;
  if (state === 'board') {
    return (
      <MemberJobsBoard
        pipelineHref="/dev/member/jobs"
        jobs={[
          { id: 'j1', title: 'Cloud Support Engineer', company: 'Brightline Credit Union', location: 'Austin, TX', meta: 'Full-time · $58k–72k', match: '92% match', applied: true, href: '/dev/member/jobs?state=detail' },
          { id: 'j2', title: 'Junior Salesforce Consultant', company: 'Lakeview Health System', location: 'Remote', meta: 'Full-time · $54k–66k', match: '87% match', href: '/dev/member/jobs?state=detail' },
          { id: 'j3', title: 'Technical Support Associate', company: 'Metro Transit Authority', location: 'Austin, TX', meta: 'Full-time · $46k–52k', match: '74% match', href: '/dev/member/jobs?state=detail' },
          { id: 'j4', title: 'IT Support Specialist', company: 'Harbor City Schools', location: 'Austin, TX', meta: 'Full-time · $48k–55k', href: '/dev/member/jobs?state=detail' },
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
            lede="Open roles. Track applications from the pipeline."
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
              { id: 'j1', title: 'Cloud Support Engineer', company: 'Brightline Credit Union', location: 'Austin, TX', locationType: 'onsite', matchPct: 92 },
              { id: 'j2', title: 'Junior Salesforce Consultant', company: 'Lakeview Health System', location: 'Remote', locationType: 'remote', matchPct: 87 },
              { id: 'j3', title: 'Technical Support Associate', company: 'Metro Transit Authority', location: 'Austin, TX', locationType: 'onsite', matchPct: 74 },
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
            lede="Open roles. Track applications from the pipeline."
            icon={<Briefcase size={13} aria-hidden="true" />}
          />
          <JobsListingClient preview isAuthenticated initialJobs={[]} initialTotal={0} />
        </div>
      </DesignSurface>
    );
  }
  if (state === 'detail') {
    return (
      <MemberJobDetail
        title="Cloud Support Engineer"
        company="Brightline Credit Union"
        location="Austin, TX"
        jobType="Full-time"
        salary="$58,000 – $72,000/yr"
        description={"Help members of Brightline Credit Union's cloud practice resolve tickets, document runbooks, and grow into a support engineer role.\n\nYou will work with senior engineers on AWS and Azure incidents, then own a small book of accounts."}
        requirements={[
          'Google IT Support or CompTIA A+ (or equivalent hands-on troubleshooting)',
          'Clear written English for tickets and runbooks',
          'Willingness to work a hybrid Austin schedule',
        ]}
        backHref="/dev/member/jobs?state=listing"
        screening={{
          packTitle: 'Cloud support screen',
          employerLabel: 'Brightline Credit Union',
          questions: [
            { id: 'q1', prompt: 'Walk through how you would triage a user who cannot connect to VPN.', type: 'scenario' },
            { id: 'q2', prompt: 'Which ticket fields do you fill in before escalating?', type: 'short_answer' },
          ],
        }}
        referral={{
          company: 'Brightline Credit Union',
          message:
            "Hi! I'm applying for the Cloud Support Engineer role at Brightline Credit Union and thought of you since you work there.\nI just completed IT Support training and would love any insight you can share, or an introduction to the right person.\nThanks so much! — Jordan",
          copySlot: <ProofCopy />,
        }}
        applySlot={
          <>
            <JobTailorPanel jobId="j1" preview initialResult={JOB_TAILOR_PREVIEW_RESULT} />
            <MobileApplyFunnel
              preview
              jobId="j1"
              authenticated
              jobTitle="Cloud Support Engineer"
              employerName="Brightline Credit Union"
              salaryLine="$58,000 – $72,000/yr"
              location="Austin, TX"
              jobType="Full-time"
            />
          </>
        }
      />
    );
  }

  return (
    <MemberJobsKit
      saved={9}
      applied={DEV_APPLIED_COUNT}
      interviewing={DEV_INTERVIEWING_COUNT}
      programTitle="AWS Cloud Practitioner"
      advisor={DEV_ADVISOR}
      scorerHref="/dev/member/job-match"
      profileMatchPct={85}
      syncedLabel="Jun 18 and Jun 29 filings"
      browseHref="/dev/member/jobs?state=board"
      jobHref={(id) => `/dev/member/jobs?state=detail&job=${id}`}
      applications={[...DEV_APPLICATIONS]}
      openRoles={[...DEV_REMAINING_OPEN_ROLES]}
      openRolesTotal={DEV_OPEN_ROLES_TOTAL}
      recommended={[...DEV_RECOMMENDED_ROLES]}
    />
  );
}

function ProofCopy() {
  return (
    <span className="wa-kit-cta wa-kit-cta--ghost">
      Copy message
    </span>
  );
}
