import { MemberAiToolsHubKit } from '@/components/portal/kit/pages/member/MemberAiToolsHubKit';
import { MemberHomeKit } from '@/components/portal/kit/pages/member/MemberHomeKit';
import { MemberJobsKit } from '@/components/portal/kit/pages/member/MemberJobsKit';
import { MemberProgramKit } from '@/components/portal/kit/pages/member/MemberProgramKit';
import { ResumeStudioKit } from '@/components/portal/kit/pages/member/ResumeStudioKit';
import { BenefitsCliffKit } from '@/components/portal/kit/pages/member/BenefitsCliffKit';
import { CareerBusinessCoachKit } from '@/components/portal/kit/pages/member/CareerBusinessCoachKit';
import { CoverLetterKit } from '@/components/portal/kit/pages/member/CoverLetterKit';
import { ElevatorPitchKit } from '@/components/portal/kit/pages/member/ElevatorPitchKit';
import { GapAnalyzerKit } from '@/components/portal/kit/pages/member/GapAnalyzerKit';
import { InterviewCoachKit } from '@/components/portal/kit/pages/member/InterviewCoachKit';
import { InterviewPracticeKit } from '@/components/portal/kit/pages/member/InterviewPracticeKit';
import { InterviewPrepKit } from '@/components/portal/kit/pages/member/InterviewPrepKit';
import { JobMatchScorerKit } from '@/components/portal/kit/pages/member/JobMatchScorerKit';
import { LinkedInAboutKit } from '@/components/portal/kit/pages/member/LinkedInAboutKit';
import { LinkedInHeadlineKit } from '@/components/portal/kit/pages/member/LinkedInHeadlineKit';
import { MemberCertificatesKit } from '@/components/portal/kit/pages/member/MemberCertificatesKit';
import { MemberMessagesKit } from '@/components/portal/kit/pages/member/MemberMessagesKit';
import { MemberProfileKit } from '@/components/portal/kit/pages/member/MemberProfileKit';
import { MemberProgressKit } from '@/components/portal/kit/pages/member/MemberProgressKit';
import { SalaryNegotiationKit } from '@/components/portal/kit/pages/member/SalaryNegotiationKit';
import {
  DEV_ADVISOR,
  DEV_AI_DRAFTS,
  DEV_APPLICATIONS,
  DEV_APPLIED_COUNT,
  DEV_CURRENT_MODULE_NUMBER,
  DEV_CURRENT_MODULE_TITLE,
  DEV_HOME_PIPELINE,
  DEV_INTERVIEW_WHEN,
  DEV_INTERVIEWING_COUNT,
  DEV_MEMBER_FIRST_NAME,
  DEV_MEMBER_FULL_NAME,
  DEV_NEXT_CHECK_IN,
  DEV_OPEN_ROLES_TOTAL,
  DEV_PROGRAM_TITLE,
  DEV_RECOMMENDED_ROLES,
  DEV_REMAINING_OPEN_ROLES,
  DEV_RESUME_SCORE,
  DEV_STREAK,
  DEV_TARGET_ROLE,
  employerShortName,
} from '@/app/dev/member/devMemberFixtures';
import { DevMemberCurrentUi } from './DevMemberCurrentUi';
import type { DevMemberView } from './registry';

const HUB = '/dev/member/v/ai-tools';
const RESUME_SEED = `${DEV_MEMBER_FULL_NAME}
Austin, TX
IT support graduate. VPN triage, runbooks, AWS lab hours.

Experience
WorkforceAP — Cloud support lab
- Triaged VPN tickets
- Logged AWS lab hours against Cost Explorer`;

/**
 * Full-state mount. C kits and existing tool kits use shared fixtures.
 * Views without a safe kit stay on DevMemberCurrentUi (no banned filler).
 */
export function DevMemberFullViews({ view }: { view: DevMemberView }) {
  switch (view.slug) {
    case 'home':
      return (
        <MemberHomeKit
          advisor={DEV_ADVISOR}
          firstName={DEV_MEMBER_FIRST_NAME}
          coursePercent={78}
          activeJobs={DEV_HOME_PIPELINE.length}
          certs={2}
          points={1240}
          programTitle={DEV_PROGRAM_TITLE}
          programStatus="In progress"
          nextLesson={DEV_CURRENT_MODULE_TITLE}
          nextLessonDue="Due Thursday"
          nextLessonHref="/dev/member/v/program"
          nextBadgePercent={60}
          nextBadgeName="Cloud Foundations"
          nextBadgeRemaining="2 modules"
          currentStreak={DEV_STREAK}
          longestStreak={DEV_STREAK}
          programHref="/dev/member/v/program"
          resumeHref="/dev/member/v/program"
          toolkitHref={HUB}
          interviewWhen={DEV_INTERVIEW_WHEN}
          priorityBody="Learn the division of provider infrastructure security and customer configuration, IAM rules, and encryption controls."
          estRemainingMinutes={25}
          resumeModuleNumber={DEV_CURRENT_MODULE_NUMBER}
          nextCheckIn={DEV_NEXT_CHECK_IN}
          curriculum={[
            { title: 'Networking, VPC and Content Delivery', state: 'done', grade: 'Completed · Grade: 98%', number: 6 },
            { title: 'Cloud Security and Identity Access (IAM)', state: 'done', grade: 'Completed · Grade: 95%', number: 7 },
            { title: DEV_CURRENT_MODULE_TITLE, state: 'active', due: 'In progress · Due Thursday', number: DEV_CURRENT_MODULE_NUMBER },
            { title: 'Billing and Pricing Basics', state: 'upcoming', due: 'Unlocks after Module 8', number: 9 },
          ]}
          jobsHref="/dev/member/v/jobs"
          coursesHref="/dev/member/v/program"
          goalsHref="/dev/member/v/readiness"
          doThisNext={{
            id: 'resume-module',
            title: DEV_CURRENT_MODULE_TITLE,
            body: `~25 min · Module ${DEV_CURRENT_MODULE_NUMBER} of 9 · AWS Cloud Practitioner — due Thursday.`,
            href: '/dev/member/v/program',
            cta: 'Resume module',
            variant: 'urgent',
            weight: 100,
          }}
          certModulesDone={7}
          certModulesTotal={9}
          goals={[
            { title: 'Finish AWS Cloud Practitioner', percent: 78 },
            { title: 'Apply to 5 cloud roles', percent: 80 },
          ]}
          pipeline={[...DEV_HOME_PIPELINE]}
        />
      );
    case 'jobs':
      return (
        <MemberJobsKit
          saved={9}
          applied={DEV_APPLIED_COUNT}
          interviewing={DEV_INTERVIEWING_COUNT}
          programTitle={DEV_PROGRAM_TITLE}
          advisor={DEV_ADVISOR}
          scorerHref="/dev/member/v/job-match-scorer"
          profileMatchPct={85}
          syncedLabel="Jun 18 and Jun 29 filings"
          browseHref="/dev/member/v/jobs"
          jobHref={() => '/dev/member/v/job-detail'}
          applications={[...DEV_APPLICATIONS]}
          openRoles={[...DEV_REMAINING_OPEN_ROLES]}
          openRolesTotal={DEV_OPEN_ROLES_TOTAL}
          recommended={[...DEV_RECOMMENDED_ROLES]}
        />
      );
    case 'program':
      return (
        <MemberProgramKit
          programTitle={DEV_PROGRAM_TITLE}
          progressPercent={78}
          modulesComplete={7}
          modulesTotal={9}
          estRemaining="25 minutes remaining"
          resumeHref="/dev/member/v/learning-module"
          advisor={DEV_ADVISOR}
          nextLesson={DEV_CURRENT_MODULE_TITLE}
          nextLessonDue="Due Thursday"
          pointsThisWeek={85}
          certsThisWeek={2}
          toolkitHref={HUB}
          resumeStudioHref="/dev/member/v/resume-studio"
          interviewHref="/dev/member/v/interview-practice"
          modules={[
            { title: 'Cloud Concepts Overview', state: 'done', slug: 'cloud-concepts' },
            { title: 'Cloud Economics and Billing Framework', state: 'done', slug: 'cloud-economics' },
            { title: 'AWS Global Infrastructure Basics', state: 'done', slug: 'infrastructure' },
            { title: 'Core Compute Services — EC2 and Lambda', state: 'done', slug: 'compute' },
            { title: 'Storage and Delivery Essentials', state: 'done', slug: 'storage' },
            { title: 'Networking, VPC and Content Delivery', state: 'done', slug: 'networking' },
            { title: 'Cloud Security and Identity Access (IAM)', state: 'done', slug: 'security-iam' },
            { title: DEV_CURRENT_MODULE_TITLE, state: 'active', slug: 'shared-responsibility', moduleHref: '/dev/member/v/learning-module' },
            { title: 'Billing and Pricing Basics', state: 'locked', slug: 'billing-pricing' },
          ]}
          liveSessionTitle="Advisor check-in"
          liveSessionWhen="Thu, Jul 9 · 10:00 AM CT"
          liveSessionStart="2026-07-09T15:00:00.000Z"
          liveSessionDurationMinutes={30}
          missionsSummary="3 missions ready on this path."
          missionsHref="/dev/member/v/missions"
        />
      );
    case 'resume-studio':
      return (
        <ResumeStudioKit
          preview
          hasResume
          backHref={HUB}
          basePath="/dev/member/v/resume-studio"
          initialResume={RESUME_SEED}
          initialJobTarget={DEV_TARGET_ROLE.title}
          previewScoreOutput={`OVERALL SCORE: ${DEV_RESUME_SCORE}%\n\nSTRENGTHS:\n• AWS lab hours named against Cost Explorer.\n• VPN triage on a real queue.`}
          advisor={DEV_ADVISOR}
          score={DEV_RESUME_SCORE}
          targetListing={DEV_TARGET_ROLE.title}
          keywordPct={84}
          coachName={DEV_ADVISOR.name}
          versions={[
            { title: DEV_TARGET_ROLE.title, saved: 'Saved · Oct 14', score: DEV_RESUME_SCORE, href: '/dev/member/v/resume-studio' },
          ]}
        />
      );
    case 'ai-tools': {
      const targetEmployer = DEV_TARGET_ROLE.meta.split(' · ')[0] ?? '';
      return (
        <MemberAiToolsHubKit
          hubHref={HUB}
          advisor={DEV_ADVISOR}
          firstName={DEV_MEMBER_FIRST_NAME}
          currentStreak={DEV_STREAK}
          longestStreak={DEV_STREAK}
          targetRole={DEV_TARGET_ROLE.title}
          targetEmployer={employerShortName(targetEmployer)}
          currentModuleNumber={DEV_CURRENT_MODULE_NUMBER}
          currentModuleTitle={DEV_CURRENT_MODULE_TITLE}
          resumeScore={DEV_RESUME_SCORE}
          mockQuestion={2}
          mockTotal={5}
          interviewWhen={DEV_INTERVIEW_WHEN}
          nextCheckIn={DEV_NEXT_CHECK_IN}
          jobsHref="/dev/member/v/jobs"
          drafts={[...DEV_AI_DRAFTS]}
        />
      );
    }
    case 'interview-practice':
      return (
        <InterviewPracticeKit
          preview
          backHref={HUB}
          initialData={{
            role: DEV_TARGET_ROLE.title,
            experienceLevel: 'entry',
            resumeContext: 'IT support graduate. VPN triage, runbooks, AWS lab hours.',
          }}
        />
      );
    case 'cover-letter':
      return (
        <CoverLetterKit
          preview
          backHref={HUB}
          initialCompany={employerShortName(DEV_TARGET_ROLE.meta.split(' · ')[0] ?? 'Brightline')}
          initialJobDescription={`${DEV_TARGET_ROLE.title} in Austin. Cost Explorer, runbooks, and ticket triage.`}
          initialResume={RESUME_SEED}
        />
      );
    case 'job-match-scorer':
      return (
        <JobMatchScorerKit
          preview
          backHref={HUB}
          initialResume={RESUME_SEED}
          initialJobDescription={`${DEV_TARGET_ROLE.title} at Brightline Credit Union. Hybrid Austin cloud support.`}
        />
      );
    case 'interview-coach':
      return <InterviewCoachKit preview backHref={HUB} initialRole={DEV_TARGET_ROLE.title} />;
    case 'elevator-pitch':
      return (
        <ElevatorPitchKit
          preview
          backHref={HUB}
          initialData={{
            name: DEV_MEMBER_FULL_NAME,
            targetRole: DEV_TARGET_ROLE.title,
            strengths: 'VPN triage, Cost Explorer, runbooks',
            certifications: 'AWS Cloud Practitioner in progress',
            industry: 'Credit unions',
          }}
        />
      );
    case 'gap-analyzer':
      return <GapAnalyzerKit preview backHref={HUB} initialResume={RESUME_SEED} />;
    case 'linkedin-headline':
      return (
        <LinkedInHeadlineKit
          preview
          backHref={HUB}
          initialRole={DEV_TARGET_ROLE.title}
          initialSkills="VPN triage, AWS labs, ticket queues"
          initialYears="1"
        />
      );
    case 'linkedin-about':
      return (
        <LinkedInAboutKit
          preview
          backHref={HUB}
          resumeHref="/dev/member/v/resume"
          initialRole={DEV_TARGET_ROLE.title}
          initialBullets="IT support graduate. VPN triage, runbooks, AWS lab hours."
        />
      );
    case 'salary-negotiation':
      return (
        <SalaryNegotiationKit
          preview
          backHref={HUB}
          initialOffer="58000"
          initialTarget="64000"
          initialJobTitle={DEV_TARGET_ROLE.title}
          initialCompany="Brightline Credit Union"
        />
      );
    case 'interview-prep':
      return <InterviewPrepKit preview backHref={HUB} items={[]} />;
    case 'career-business-coach':
      return <CareerBusinessCoachKit backHref={HUB} />;
    case 'benefits-cliff':
      return (
        <BenefitsCliffKit
          title="Will this offer leave you better off?"
          lede="Enter a job offer and see how it could change SNAP, Medicaid, or TANF benefits each month."
          betaLabel="Beta"
          backHref={HUB}
        />
      );
    case 'readiness':
      return (
        <MemberProgressKit
          readinessScore={86}
          readinessNote="On track for the Cloud Support Associate screen."
          statsHeading="Progress by area"
          readinessCoachHref={HUB}
        />
      );
    case 'messages':
      return (
        <MemberMessagesKit
          conversations={[
            {
              id: 'counselor',
              name: DEV_ADVISOR.name,
              role: 'Career counselor',
              preview: 'Reply here about training, jobs, or your next session.',
              unread: true,
              active: true,
            },
            {
              id: 'team',
              name: 'WorkforceAP Team',
              role: 'Support',
              preview: 'Workspace email and Coursera access questions go here.',
            },
          ]}
          activeName={DEV_ADVISOR.name}
          activeRole="Career counselor"
          activeInitials="DR"
          messages={[
            {
              id: 'm1',
              from: 'other',
              author: 'DR',
              text: `This thread is with ${DEV_ADVISOR.firstName}. Send a question about training, jobs, or your next session.`,
            },
            { id: 'm2', from: 'self', text: 'Will do.' },
          ]}
        />
      );
    case 'profile':
      return (
        <MemberProfileKit
          name={DEV_MEMBER_FULL_NAME}
          initials="AR"
          headline={`${DEV_TARGET_ROLE.title} candidate · Austin, TX`}
          email="alex.rivera@example.test"
          location="Austin, TX"
          programInterest="Cloud & IT"
          programOptions={['Cloud & IT', 'Data & AI', 'Healthcare', 'Skilled Trades']}
          badges={[
            { label: '2 certs', bg: 'var(--wa-gold-soft)', color: 'var(--wa-gold)' },
            { label: `${DEV_RESUME_SCORE} readiness`, bg: 'var(--wa-success-soft)', color: 'var(--wa-success)' },
            { label: `${DEV_STREAK}-day streak`, bg: 'var(--wa-accent-soft)', color: 'var(--wa-accent)' },
          ]}
          notifications={[
            { key: 'jobs', label: 'Job matches', enabled: true },
            { key: 'counselor', label: 'Counselor messages', enabled: true },
            { key: 'reminders', label: 'Course reminders', enabled: false },
          ]}
        />
      );
    case 'certifications':
      return (
        <MemberCertificatesKit
          earnedCount={2}
          inProgressCount={1}
          verifiedCount={2}
          earned={[
            { id: 'aws-cp', title: 'AWS Cloud Practitioner', meta: 'Issued May 2026 · Credential ID AWS-CP-8841', verified: true, earnedAtIso: '2026-05-14' },
            { id: 'it-support', title: 'IT Support certificate', meta: 'Issued Mar 2026 · Credential ID ITS-2207', verified: true, earnedAtIso: '2026-03-02' },
          ]}
          inProgress={[
            {
              id: 'aws-saa',
              title: 'AWS Solutions Architect Associate',
              percent: 47,
              note: `Module ${DEV_CURRENT_MODULE_NUMBER} in progress.`,
            },
          ]}
        />
      );
    default: {
      return <DevMemberCurrentUi view={view} />;
    }
  }
}
