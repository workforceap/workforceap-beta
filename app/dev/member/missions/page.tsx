import { notFound } from 'next/navigation';
import { Target } from 'lucide-react';
import { DesignSurface, KitEmptyState, PageOpener } from '@/components/portal/kit';
import SkillMissionPanel, { type SkillMissionSummary } from '@/components/portal/SkillMissionPanel';
import { SkillMissionChallengePreview } from '@/components/portal/SkillMissionChallenge';
import SkillMissionTeaserCard from '@/components/portal/SkillMissionTeaserCard';
import { skillMissionEmptyState } from '@/lib/member/skillMissionEmptyState';

/**
 * Credential-free proofs for Skill Missions.
 * Superadmin switcher lives in WorkspaceShell (DevMemberShell passes
 * `superAdmin`) — do not render a second workspace-shell-header here.
 *   /dev/member/missions              — unenrolled ("Choose program")
 *   /dev/member/missions?state=enrolled — enrolled program with no catalog missions
 *   /dev/member/missions?state=active   — populated journey (passed / ready / retry / locked)
 *   /dev/member/missions?state=challenge — kit challenge overlay (preview, no POST)
 *   /dev/member/missions?state=passed    — quiet pass overlay (resume bullet saved)
 *   /dev/member/missions?state=teaser    — live Home mission teaser chrome
 */
export const dynamic = 'force-dynamic';

const DEV_HREF: Record<string, string> = {
  '/dashboard/program': '/dev/member/program',
  '/dashboard/training': '/dev/member/program',
};

const QUIZ = {
  text: 'Which well-architected pillar covers cost?',
  options: ['Security', 'Cost Optimization', 'Reliability', 'Performance'] as [string, string, string, string],
};

const ACTIVE_SUMMARY: SkillMissionSummary = {
  programSlug: 'aws-cloud-technology-amazon',
  programTitle: 'AWS Cloud Technology Certificate',
  totalMissions: 4,
  passedCount: 1,
  readyCount: 1,
  retryCount: 1,
  streak: 2,
  careerReadinessPct: 25,
  demonstratedSkills: ['AWS fundamentals', 'Cost awareness'],
  missions: [
    {
      key: 'aws-cloud-concepts',
      courseSlug: 'cloud-concepts',
      programSlug: 'aws-cloud-technology-amazon',
      programTitle: 'AWS Cloud Technology Certificate',
      courseTitle: 'Cloud Concepts',
      missionName: 'Explain the cloud to a hiring manager',
      missionTagline: 'Turn the first module into a 30-second pitch.',
      primaryAxis: 'communication',
      skillLabels: ['AWS fundamentals', 'Storytelling'],
      scenarioPrompt: '',
      evidenceHint: '',
      quizQuestions: [QUIZ],
      estimatedMinutes: 12,
      status: 'passed',
      completedAt: new Date('2026-07-18T12:00:00.000Z'),
      latestResult: {
        verdict: 'passed',
        coachingNote: '',
        starStory: '',
        resumeBullet: 'Explained AWS shared-responsibility tradeoffs to a non-technical hiring manager.',
        skillsUnlocked: ['AWS fundamentals', 'Cost awareness'],
      },
      aiToolResultId: 'preview-resume',
    },
    {
      key: 'aws-security',
      courseSlug: 'security-compliance',
      programSlug: 'aws-cloud-technology-amazon',
      programTitle: 'AWS Cloud Technology Certificate',
      courseTitle: 'Security & Compliance',
      missionName: 'Defend a least-privilege decision',
      missionTagline: 'Prove you can say no to a risky IAM request.',
      primaryAxis: 'judgment',
      skillLabels: ['IAM', 'Security'],
      scenarioPrompt:
        'A teammate asks you to attach AdministratorAccess so a vendor can “just get unblocked.” Walk the hiring manager through what you do instead.',
      evidenceHint: '',
      quizQuestions: [QUIZ],
      estimatedMinutes: 15,
      status: 'ready',
      completedAt: null,
      latestResult: null,
      aiToolResultId: null,
    },
    {
      key: 'aws-billing',
      courseSlug: 'billing-pricing',
      programSlug: 'aws-cloud-technology-amazon',
      programTitle: 'AWS Cloud Technology Certificate',
      courseTitle: 'Billing & Pricing',
      missionName: 'Catch a runaway bill',
      missionTagline: 'Show how you would investigate a cost spike.',
      primaryAxis: 'analysis',
      skillLabels: ['Cost Explorer', 'FinOps'],
      scenarioPrompt: '',
      evidenceHint: '',
      quizQuestions: [QUIZ],
      estimatedMinutes: 18,
      status: 'needs_retry',
      completedAt: null,
      latestResult: {
        verdict: 'needs_retry',
        coachingNote: 'Name the service and the 24-hour window before you recommend a fix. Hiring managers want the evidence trail.',
        starStory: '',
        resumeBullet: '',
        skillsUnlocked: [],
      },
      aiToolResultId: null,
    },
    {
      key: 'aws-exam',
      courseSlug: 'exam-readiness',
      programSlug: 'aws-cloud-technology-amazon',
      programTitle: 'AWS Cloud Technology Certificate',
      courseTitle: 'Exam Readiness',
      missionName: 'Walk through a practice exam miss',
      missionTagline: 'Turn a wrong answer into a teaching moment.',
      primaryAxis: 'learning',
      skillLabels: ['Exam strategy'],
      scenarioPrompt: '',
      evidenceHint: '',
      quizQuestions: [QUIZ],
      estimatedMinutes: 20,
      status: 'locked',
      completedAt: null,
      latestResult: null,
      aiToolResultId: null,
    },
  ],
};

export default async function DevMemberMissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const { state } = await searchParams;
  const view =
    state === 'enrolled' || state === 'active' || state === 'challenge' || state === 'passed' || state === 'teaser'
      ? state
      : 'empty';

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Missions"
          title="Skill missions"
          lede="One pass per course. Resume bullet and STAR story."
          icon={<Target size={13} aria-hidden="true" />}
        />
        {view === 'teaser' ? (
          <SkillMissionTeaserCard
            href="/dev/member/missions"
            data={{
              careerReadinessPct: 50,
              passedCount: 2,
              totalMissions: 4,
              readyCount: 1,
              retryCount: 0,
              streak: 3,
              nextMissionName: 'Defend a least-privilege decision',
              nextMissionCourse: 'Security & Compliance',
            }}
          />
        ) : view === 'passed' ? (
          <SkillMissionChallengePreview mission={ACTIVE_SUMMARY.missions[1]!} state="passed" />
        ) : view === 'challenge' ? (
          <SkillMissionChallengePreview mission={ACTIVE_SUMMARY.missions[1]!} />
        ) : view === 'active' ? (
          <SkillMissionPanel
            summary={ACTIVE_SUMMARY}
            hideTitle
            preview
            resumeStudioHref="#"
          />
        ) : (
          <DevMissionsEmpty enrolled={view === 'enrolled'} />
        )}
      </div>
    </DesignSurface>
  );
}

/** Same shell as the live page: kit card + KitEmptyState at h2, hrefs remapped to the proofs. */
function DevMissionsEmpty({ enrolled }: { enrolled: boolean }) {
  const empty = skillMissionEmptyState({
    programSlug: enrolled ? 'ai-professional-practitioner-certificate' : null,
    programTitle: enrolled ? 'AI Professional Practitioner Certificate' : null,
  });
  return (
    <div className="wa-kit-card">
      <KitEmptyState
        kind={empty.kind}
        tone={empty.tone}
        headingAs="h2"
        title={empty.title}
        description={empty.description}
        primaryAction={{ href: DEV_HREF[empty.primaryAction.href] ?? empty.primaryAction.href, label: empty.primaryAction.label }}
      />
    </div>
  );
}
